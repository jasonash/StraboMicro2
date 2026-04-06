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
  refreshToken: () => Promise<boolean>;
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
        const refreshed = await get().refreshToken();
        if (refreshed) {
          set({
            isAuthenticated: true,
            user: result.user,
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
  refreshToken: async (): Promise<boolean> => {
    if (!window.api?.auth) {
      return false;
    }

    try {
      const restServer = getRestServerUrl();
      const result = await window.api.auth.refresh(restServer);

      if (result.success) {
        console.log('[AuthStore] Token refreshed successfully');
        return true;
      } else {
        console.warn('[AuthStore] Token refresh failed:', result.error);
        // Session expired - clear auth state
        set({
          isAuthenticated: false,
          user: null,
          error: result.error,
        });
        return false;
      }
    } catch (error) {
      console.error('[AuthStore] Token refresh error:', error);
      return false;
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
 * Get the current access token for making authenticated API calls
 * Returns null if not logged in or token expired
 */
export async function getAccessToken(): Promise<string | null> {
  if (!window.api?.auth) {
    return null;
  }

  try {
    const result = await window.api.auth.getToken();

    if (result.token) {
      return result.token;
    }

    // Token expired - try to refresh
    if (result.expired) {
      const restServer = getRestServerUrl();
      const refreshResult = await window.api.auth.refresh(restServer);

      if (refreshResult.success) {
        // Get fresh token after refresh
        const freshResult = await window.api.auth.getToken();
        return freshResult.token || null;
      }
    }

    return null;
  } catch (error) {
    console.error('[Auth] Error getting access token:', error);
    return null;
  }
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

  let token = await getAccessToken();
  console.log('[authenticatedFetch] Token retrieved:', token ? `${token.substring(0, 20)}...` : 'null');

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
