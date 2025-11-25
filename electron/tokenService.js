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

// Store instance - lazily initialized
let store = null;

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
   */
  async saveTokens(accessToken, refreshToken, expiresIn, user) {
    if (!this.isEncryptionAvailable()) {
      throw new Error('Secure storage is not available on this system');
    }

    // Warn on Linux if using plaintext fallback
    const backend = this.getStorageBackend();
    if (backend === 'basic_text') {
      log.warn('[TokenService] WARNING: Using plaintext storage fallback - credentials are NOT fully encrypted');
    }

    const tokenData = {
      accessToken,
      refreshToken,
      expiresAt: Date.now() + (expiresIn * 1000),
      user,
    };

    try {
      // Encrypt the entire token object as JSON
      const encrypted = safeStorage.encryptString(JSON.stringify(tokenData));
      const encryptedBase64 = encrypted.toString('base64');

      // Store encrypted data
      const s = await getStore();
      s.set('tokens', encryptedBase64);

      log.info('[TokenService] Tokens saved securely for user:', user.email);
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
      const encryptedBase64 = s.get('tokens');
      if (!encryptedBase64) {
        return null;
      }

      const encrypted = Buffer.from(encryptedBase64, 'base64');
      const decrypted = safeStorage.decryptString(encrypted);
      return JSON.parse(decrypted);
    } catch (error) {
      log.error('[TokenService] Failed to decrypt tokens - clearing stored data:', error);
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
      currentTokens.user
    );

    log.info('[TokenService] Access token updated');
  }
};

module.exports = tokenService;
