/**
 * Authentication Store (Renderer Process)
 *
 * Zustand store for managing authentication UI state.
 * IMPORTANT: This store does NOT store tokens - tokens are securely stored
 * in the main process using Electron's safeStorage API.
 *
 * This store only tracks:
 * - Whether user is logged in (for UI updates)
 * - User profile info (for display)
 * - Loading/error states (for UI feedback)
 */

import { create } from 'zustand';
import { getRestServerUrl } from '@/components/dialogs/PreferencesDialog';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Result of a token refresh:
 * - 'refreshed': new access token stored
 * - 'expired': the server rejected the refresh token; tokens were cleared, user is logged out
 * - 'unavailable': server unreachable or failing (tokens kept, user stays logged in)
 */
export type RefreshOutcome = 'refreshed' | 'expired' | 'unavailable';

export interface AuthUser {
  pkey: string;
  email: string;
  name: string;
}

interface AuthState {
  // ========== AUTH STATE (UI only, no tokens) ==========
  isAuthenticated: boolean;
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;

  // ========== LOGIN PROMPT STATE ==========
  /** When true, the login dialog should be shown for re-authentication */
  loginPromptActive: boolean;
  /** Message to show in the login dialog (e.g. "Your session has expired") */
  loginPromptMessage: string | null;

  // ========== AUTH ACTIONS ==========
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
  refreshToken: () => Promise<RefreshOutcome>;
  clearError: () => void;
  /** Called by App.tsx when the login prompt dialog is dismissed (cancel) */
  dismissLoginPrompt: () => void;
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

// Pending login resolvers — when authenticatedFetch needs re-auth, it pushes
// a { resolve, reject } here and awaits. Login success resolves all; cancel rejects all.
let pendingLoginResolvers: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

export const useAuthStore = create<AuthState>()((set, get) => ({
  // ========== INITIAL STATE ==========
  isAuthenticated: false,
  user: null,
  isLoading: false,
  error: null,
  loginPromptActive: false,
  loginPromptMessage: null,

  // ========== AUTH ACTIONS ==========

  /**
   * Login to StraboSpot server
   * Tokens are stored securely in main process
   */
  login: async (email: string, password: string): Promise<boolean> => {
    if (!window.api?.auth) {
      set({ error: 'Authentication API not available' });
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      const restServer = getRestServerUrl();
      const result = await window.api.auth.login(email, password, restServer);

      if (result.success) {
        set({
          isAuthenticated: true,
          user: result.user,
          isLoading: false,
          error: null,
          loginPromptActive: false,
          loginPromptMessage: null,
        });
        // Notify main process to update menu
        window.api.auth.notifyStateChanged(true);
        console.log('[AuthStore] Login successful for:', result.user?.email);
        // Resolve any pending auth requests that were waiting for re-login
        const resolvers = pendingLoginResolvers;
        pendingLoginResolvers = [];
        resolvers.forEach(({ resolve }) => resolve());
        return true;
      } else {
        set({
          isLoading: false,
          error: result.error || 'Login failed',
        });
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      console.error('[AuthStore] Login error:', error);
      set({
        isLoading: false,
        error: message,
      });
      return false;
    }
  },

  /**
   * Logout from StraboSpot server
   * Clears tokens from secure storage in main process
   */
  logout: async (): Promise<void> => {
    if (!window.api?.auth) {
      set({
        isAuthenticated: false,
        user: null,
        error: null,
      });
      return;
    }

    set({ isLoading: true });

    try {
      const restServer = getRestServerUrl();
      await window.api.auth.logout(restServer);
    } catch (error) {
      console.error('[AuthStore] Logout error:', error);
      // Continue with local state clear even if server logout fails
    }

    set({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      error: null,
    });

    // Notify main process to update menu
    window.api?.auth?.notifyStateChanged(false);
    console.log('[AuthStore] Logged out');
  },

  /**
   * Check current authentication status
   * Should be called on app startup to restore auth state
   */
  checkAuthStatus: async (): Promise<void> => {
    if (!window.api?.auth) {
      return;
    }

    try {
      const result = await window.api.auth.check();

      if (result.isLoggedIn) {
        set({
          isAuthenticated: true,
          user: result.user,
        });
        window.api.auth.notifyStateChanged(true);
        console.log('[AuthStore] User is logged in:', result.user?.email);
      } else if (result.needsRefresh) {
        // Token expired but we have refresh token - try to refresh
        console.log('[AuthStore] Token expired, attempting refresh...');
        const outcome = await get().refreshToken();
        if (outcome !== 'expired') {
          // 'unavailable' (offline or server trouble): the tokens are kept, so the
          // user is still logged in; the next authenticated request retries the refresh
          set({
            isAuthenticated: true,
            user: result.user ?? null,
          });
          window.api.auth.notifyStateChanged(true);
        } else {
          set({
            isAuthenticated: false,
            user: null,
          });
          window.api.auth.notifyStateChanged(false);
        }
      } else {
        set({
          isAuthenticated: false,
          user: null,
        });
        window.api.auth.notifyStateChanged(false);
      }
    } catch (error) {
      console.error('[AuthStore] Auth check error:', error);
      set({
        isAuthenticated: false,
        user: null,
      });
      window.api?.auth?.notifyStateChanged(false);
    }
  },

  /**
   * Refresh the access token
   * Called automatically when token is about to expire
   */
  refreshToken: async (): Promise<RefreshOutcome> => {
    if (!window.api?.auth) {
      return 'unavailable';
    }

    try {
      const restServer = getRestServerUrl();
      const result = await window.api.auth.refresh(restServer);

      if (result.success) {
        console.log('[AuthStore] Token refreshed successfully');
        return 'refreshed';
      }
      if (result.sessionExpired) {
        console.warn('[AuthStore] Session expired:', result.error);
        set({
          isAuthenticated: false,
          user: null,
          error: result.error ?? null,
        });
        window.api.auth.notifyStateChanged(false);
        return 'expired';
      }
      // Offline or server trouble: tokens were kept, stay logged in
      console.warn('[AuthStore] Token refresh not possible right now:', result.error);
      return 'unavailable';
    } catch (error) {
      console.error('[AuthStore] Token refresh error:', error);
      return 'unavailable';
    }
  },

  /**
   * Clear error state
   */
  clearError: () => set({ error: null }),

  /**
   * Dismiss the login prompt (user cancelled)
   * Rejects all pending auth requests so callers get an error
   */
  dismissLoginPrompt: () => {
    set({ loginPromptActive: false, loginPromptMessage: null });
    const resolvers = pendingLoginResolvers;
    pendingLoginResolvers = [];
    resolvers.forEach(({ reject }) => reject(new Error('Login cancelled')));
  },
}));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Request re-authentication from the user.
 * Shows the login dialog and returns a promise that resolves when login succeeds
 * or rejects if the user cancels.
 */
function requestLogin(message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    pendingLoginResolvers.push({ resolve, reject });
    // Only activate the prompt once (multiple concurrent callers share the same dialog)
    const { loginPromptActive } = useAuthStore.getState();
    if (!loginPromptActive) {
      useAuthStore.setState({ loginPromptActive: true, loginPromptMessage: message });
    }
  });
}

/**
 * Get the current access token, refreshing it if it has expired.
 * unavailable is true when the refresh could not reach the server (or the
 * server failed); the user is still logged in, so callers should report a
 * connection problem rather than ask for a new login.
 */
async function getAccessTokenWithStatus(): Promise<{ token: string | null; unavailable: boolean }> {
  if (!window.api?.auth) {
    return { token: null, unavailable: false };
  }

  try {
    const result = await window.api.auth.getToken();

    if (result.token) {
      return { token: result.token, unavailable: false };
    }

    // Token expired - try to refresh
    if (result.expired) {
      const outcome = await useAuthStore.getState().refreshToken();

      if (outcome === 'refreshed') {
        // Get fresh token after refresh
        const freshResult = await window.api.auth.getToken();
        return { token: freshResult.token || null, unavailable: false };
      }
      return { token: null, unavailable: outcome === 'unavailable' };
    }

    return { token: null, unavailable: false };
  } catch (error) {
    console.error('[Auth] Error getting access token:', error);
    return { token: null, unavailable: false };
  }
}

/**
 * Get the current access token for making authenticated API calls
 * Returns null if not logged in, or if the token expired and cannot be refreshed
 */
export async function getAccessToken(): Promise<string | null> {
  return (await getAccessTokenWithStatus()).token;
}

/**
 * Make an authenticated fetch request
 * Automatically includes Bearer token and handles token refresh.
 * If no valid token is available, prompts the user to re-login and retries.
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  console.log('[authenticatedFetch] Fetching:', url);

  const status = await getAccessTokenWithStatus();
  let token = status.token;
  console.log('[authenticatedFetch] Token retrieved:', token ? `${token.substring(0, 20)}...` : 'null');

  if (!token && status.unavailable) {
    // Still logged in, but the server cannot be reached right now: a login prompt would not help
    throw new Error('Could not reach the StraboSpot server. Check your connection and try again.');
  }

  if (!token) {
    console.warn('[authenticatedFetch] No token available — prompting user to log in');
    // Show login dialog and wait for the user to authenticate (or cancel)
    await requestLogin('Your session has expired. Please sign in again to continue.');
    // After successful re-login, get the fresh token
    token = await getAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);

  console.log('[authenticatedFetch] Making request with Authorization header');
  return fetch(url, {
    ...options,
    headers,
  });
}
