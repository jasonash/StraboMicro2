/**
 * Token Service
 *
 * Secure storage for JWT tokens using Electron's safeStorage API.
 * Tokens are encrypted using OS-native security mechanisms:
 * - macOS: Keychain Access
 * - Windows: DPAPI (Data Protection API)
 * - Linux: System secret store (libsecret, gnome-keyring, kwallet)
 *
 * This service handles:
 * - Secure token storage and retrieval
 * - Token expiration checking
 * - Automatic cleanup on decryption errors
 */

const { safeStorage } = require('electron');
const log = require('electron-log');

// Token data structure stored encrypted
// {
//   accessToken: string,
//   refreshToken: string,
//   expiresAt: number (Unix timestamp in ms),
//   user: { pkey: string, email: string, name: string }
// }

// Waits between refresh attempts when the server cannot be reached or answers 5xx
const REFRESH_RETRY_DELAYS_MS = [1000, 3000];

// Store instance - lazily initialized
let store = null;

// Cache whether we should use encryption (checked once at startup)
let useEncryption = null;

/**
 * Initialize the electron-store (ESM module requires dynamic import)
 */
async function getStore() {
  if (store) {
    return store;
  }

  try {
    // Dynamic import for ESM module
    const { default: Store } = await import('electron-store');
    store = new Store({
      name: 'strabomicro-tokens',
      // Don't use electron-store's encryption - we use safeStorage instead
    });
    return store;
  } catch (error) {
    log.error('[TokenService] Failed to initialize store:', error);
    throw error;
  }
}

/**
 * Check if we should use safeStorage encryption.
 * On Linux, safeStorage can hang indefinitely if the keyring is locked or
 * requires authentication, so we skip it entirely and use plaintext storage.
 * This is a known limitation of Electron on Linux.
 */
function shouldUseEncryption() {
  if (useEncryption !== null) {
    return useEncryption;
  }

  // On Linux, skip safeStorage entirely - it can hang waiting for keyring unlock
  // This is a common issue with gnome-keyring, kwallet, etc.
  if (process.platform === 'linux') {
    log.warn('[TokenService] Linux detected - using plaintext storage (keyring can cause hangs)');
    useEncryption = false;
    return false;
  }

  // Check if encryption is available at all
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn('[TokenService] Encryption not available - using plaintext storage');
    useEncryption = false;
    return false;
  }

  // Check the backend being used
  const backend = typeof safeStorage.getSelectedStorageBackend === 'function'
    ? safeStorage.getSelectedStorageBackend()
    : 'unknown';

  // With 'basic_text' backend, encryption is essentially unavailable
  if (backend === 'basic_text') {
    log.warn('[TokenService] basic_text backend detected - using plaintext storage');
    useEncryption = false;
    return false;
  }

  // macOS and Windows generally work reliably
  log.info('[TokenService] Using encrypted storage, backend:', backend);
  useEncryption = true;
  return useEncryption;
}

const tokenService = {
  /**
   * Check if secure storage is available on this system
   */
  isEncryptionAvailable() {
    return safeStorage.isEncryptionAvailable();
  },

  /**
   * Get the storage backend being used (for warning on Linux)
   * Returns 'basic_text' if no secure storage is available
   */
  getStorageBackend() {
    if (typeof safeStorage.getSelectedStorageBackend === 'function') {
      return safeStorage.getSelectedStorageBackend();
    }
    return 'unknown';
  },

  /**
   * Save tokens securely
   * @param {string} accessToken - JWT access token
   * @param {string} refreshToken - Refresh token for getting new access tokens
   * @param {number} expiresIn - Seconds until access token expires
   * @param {object} user - User info { pkey, email, name }
   * @param {string} [server] - REST server the tokens are from (tokens saved
   *   before 2026-10-05 have none); auth:check refuses them for another one
   */
  async saveTokens(accessToken, refreshToken, expiresIn, user, server) {
    const tokenData = {
      accessToken,
      refreshToken,
      expiresAt: Date.now() + (expiresIn * 1000),
      user,
      ...(server ? { server } : {}),
    };

    try {
      const s = await getStore();

      if (shouldUseEncryption()) {
        // Encrypt the entire token object as JSON
        const encrypted = safeStorage.encryptString(JSON.stringify(tokenData));
        const encryptedBase64 = encrypted.toString('base64');
        s.set('tokens', encryptedBase64);
        s.set('encrypted', true);
        log.info('[TokenService] Tokens saved securely for user:', user.email);
      } else {
        // Store as plaintext (Linux fallback when keyring unavailable)
        // Base64 encode to at least obscure it slightly
        const plainBase64 = Buffer.from(JSON.stringify(tokenData)).toString('base64');
        s.set('tokens', plainBase64);
        s.set('encrypted', false);
        log.warn('[TokenService] Tokens saved (unencrypted) for user:', user.email);
      }
    } catch (error) {
      log.error('[TokenService] Failed to save tokens:', error);
      throw error;
    }
  },

  /**
   * Retrieve and decrypt stored tokens
   * @returns {object|null} Token data or null if not found/invalid
   */
  async getTokens() {
    try {
      const s = await getStore();
      const storedBase64 = s.get('tokens');
      if (!storedBase64) {
        return null;
      }

      const isEncrypted = s.get('encrypted');

      if (isEncrypted) {
        // Decrypt using safeStorage
        const encrypted = Buffer.from(storedBase64, 'base64');
        const decrypted = safeStorage.decryptString(encrypted);
        return JSON.parse(decrypted);
      } else {
        // Plaintext fallback (Linux without keyring)
        const decoded = Buffer.from(storedBase64, 'base64').toString('utf8');
        return JSON.parse(decoded);
      }
    } catch (error) {
      log.error('[TokenService] Failed to retrieve tokens - clearing stored data:', error);
      // Clear corrupted/invalid tokens
      await this.clearTokens();
      return null;
    }
  },

  /**
   * Clear all stored tokens (logout)
   */
  async clearTokens() {
    try {
      const s = await getStore();
      s.delete('tokens');
      s.delete('encrypted');
      log.info('[TokenService] Tokens cleared');
    } catch (error) {
      log.error('[TokenService] Failed to clear tokens:', error);
    }
  },

  /**
   * Check if the access token is expired or about to expire
   * @param {object} tokenData - Token data from getTokens()
   * @param {number} bufferMs - Buffer time in ms before actual expiry (default 5 min)
   * @returns {boolean} True if token is expired or will expire within buffer
   */
  isTokenExpired(tokenData, bufferMs = 5 * 60 * 1000) {
    if (!tokenData || !tokenData.expiresAt) {
      return true;
    }
    return Date.now() >= (tokenData.expiresAt - bufferMs);
  },

  /**
   * Check if we have a valid (non-expired) token
   * @returns {boolean}
   */
  async hasValidToken() {
    const tokens = await this.getTokens();
    return tokens !== null && !this.isTokenExpired(tokens);
  },

  /**
   * Get the current user info if logged in
   * @returns {object|null} User info or null if not logged in
   */
  async getCurrentUser() {
    const tokens = await this.getTokens();
    return tokens?.user || null;
  },

  /**
   * Update only the access token (after refresh)
   * @param {string} newAccessToken - New JWT access token
   * @param {number} expiresIn - Seconds until new token expires
   */
  async updateAccessToken(newAccessToken, expiresIn) {
    const currentTokens = await this.getTokens();
    if (!currentTokens) {
      throw new Error('No existing tokens to update');
    }

    await this.saveTokens(
      newAccessToken,
      currentTokens.refreshToken,
      expiresIn,
      currentTokens.user,
      currentTokens.server
    );

    log.info('[TokenService] Access token updated');
  },

  /**
   * Get a valid access token, automatically refreshing if expired.
   * This is the main method server handlers should use.
   * @param {string} restServer - REST server URL for refresh endpoint
   * @returns {object} { success, accessToken, user, error, sessionExpired }
   *   - sessionExpired: true if refresh token is invalid (user needs to log in again)
   */
  /**
   * Get a usable access token, refreshing it first if it has expired.
   * @param {string} restServer
   * @returns {Promise<{ success: boolean, accessToken?: string, user?: object,
   *   sessionExpired?: boolean, unreachable?: boolean, offline?: boolean, error?: string }>}
   */
  async getValidAccessToken(restServer) {
    const tokens = await this.getTokens();

    if (!tokens || !tokens.accessToken) {
      return {
        success: false,
        error: 'Not authenticated. Please log in first.',
        sessionExpired: true,
      };
    }

    if (!this.isTokenExpired(tokens)) {
      return { success: true, accessToken: tokens.accessToken, user: tokens.user };
    }

    log.info('[TokenService] Access token expired, attempting refresh...');
    return this.refreshAccessToken(restServer);
  },

  /**
   * Get a new access token with the stored refresh token.
   * Tokens are cleared only when the server rejects the refresh token (401).
   * Network errors and server errors keep the tokens (the user stays logged
   * in) and are retried with backoff; if they persist, the result has
   * unreachable: true.
   * @param {string} restServer
   * @param {{ retryDelaysMs?: number[] }} [options]
   * @returns {Promise<{ success: boolean, accessToken?: string, user?: object,
   *   sessionExpired?: boolean, unreachable?: boolean, offline?: boolean, error?: string }>}
   */
  async refreshAccessToken(restServer, { retryDelaysMs = REFRESH_RETRY_DELAYS_MS } = {}) {
    const tokens = await this.getTokens();
    if (!tokens || !tokens.refreshToken) {
      log.warn('[TokenService] No refresh token available');
      return { success: false, sessionExpired: true, error: 'Session expired. Please log in again.' };
    }

    const baseUrl = restServer || 'https://strabospot.org';
    let lastProblem = '';
    // The last attempt could not reach the server at all (no connection), as
    // opposed to a server error; the header shows "offline" only then
    let lastWasNetwork = false;

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt - 1]));
      }

      let response;
      try {
        response = await fetch(`${baseUrl}/jwtauth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: tokens.refreshToken }),
        });
      } catch (networkError) {
        lastProblem = networkError.message || 'network error';
        lastWasNetwork = true;
        log.warn(`[TokenService] Refresh attempt ${attempt + 1} could not reach the server: ${lastProblem}`);
        continue;
      }

      if (response.status === 401) {
        log.warn('[TokenService] Refresh token rejected by the server (401), session expired');
        await this.clearTokens();
        return { success: false, sessionExpired: true, error: 'Session expired. Please log in again.' };
      }

      lastWasNetwork = false;
      if (response.status >= 500) {
        lastProblem = `HTTP ${response.status}`;
        log.warn(`[TokenService] Refresh attempt ${attempt + 1} failed with ${lastProblem}`);
        continue;
      }

      if (!response.ok) {
        // Other 4xx: a request problem, not proof that the session is gone; keep the tokens
        log.error(`[TokenService] Refresh failed with HTTP ${response.status}; tokens kept`);
        return { success: false, error: 'Failed to refresh session' };
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        lastProblem = 'unreadable server response';
        log.warn(`[TokenService] Refresh attempt ${attempt + 1}: ${lastProblem}`);
        continue;
      }

      if (!data || !data.access_token) {
        lastProblem = 'server response without an access token';
        log.warn(`[TokenService] Refresh attempt ${attempt + 1}: ${lastProblem}`);
        continue;
      }

      await this.updateAccessToken(data.access_token, data.expires_in);
      log.info('[TokenService] Token refreshed successfully');
      return { success: true, accessToken: data.access_token, user: tokens.user };
    }

    log.warn(`[TokenService] Refresh gave up (${lastProblem}); tokens kept`);
    return {
      success: false,
      unreachable: true,
      offline: lastWasNetwork,
      error: 'Could not reach the StraboSpot server. Check your connection and try again.',
    };
  },
};

module.exports = tokenService;
