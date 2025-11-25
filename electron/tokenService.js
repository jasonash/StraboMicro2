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
const Store = require('electron-store').default;
const log = require('electron-log');

// Token data structure stored encrypted
// {
//   accessToken: string,
//   refreshToken: string,
//   expiresAt: number (Unix timestamp in ms),
//   user: { pkey: string, email: string, name: string }
// }

class TokenService {
  constructor() {
    this.store = new Store({
      name: 'strabomicro-tokens',
      // Don't use electron-store's encryption - we use safeStorage instead
    });
  }

  /**
   * Check if secure storage is available on this system
   */
  isEncryptionAvailable() {
    return safeStorage.isEncryptionAvailable();
  }

  /**
   * Get the storage backend being used (for warning on Linux)
   * Returns 'basic_text' if no secure storage is available
   */
  getStorageBackend() {
    if (typeof safeStorage.getSelectedStorageBackend === 'function') {
      return safeStorage.getSelectedStorageBackend();
    }
    return 'unknown';
  }

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
      this.store.set('tokens', encryptedBase64);

      log.info('[TokenService] Tokens saved securely for user:', user.email);
    } catch (error) {
      log.error('[TokenService] Failed to save tokens:', error);
      throw error;
    }
  }

  /**
   * Retrieve and decrypt stored tokens
   * @returns {object|null} Token data or null if not found/invalid
   */
  getTokens() {
    const encryptedBase64 = this.store.get('tokens');
    if (!encryptedBase64) {
      return null;
    }

    try {
      const encrypted = Buffer.from(encryptedBase64, 'base64');
      const decrypted = safeStorage.decryptString(encrypted);
      return JSON.parse(decrypted);
    } catch (error) {
      log.error('[TokenService] Failed to decrypt tokens - clearing stored data:', error);
      // Clear corrupted/invalid tokens
      this.clearTokens();
      return null;
    }
  }

  /**
   * Clear all stored tokens (logout)
   */
  clearTokens() {
    this.store.delete('tokens');
    log.info('[TokenService] Tokens cleared');
  }

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
  }

  /**
   * Check if we have a valid (non-expired) token
   * @returns {boolean}
   */
  hasValidToken() {
    const tokens = this.getTokens();
    return tokens !== null && !this.isTokenExpired(tokens);
  }

  /**
   * Get the current user info if logged in
   * @returns {object|null} User info or null if not logged in
   */
  getCurrentUser() {
    const tokens = this.getTokens();
    return tokens?.user || null;
  }

  /**
   * Update only the access token (after refresh)
   * @param {string} newAccessToken - New JWT access token
   * @param {number} expiresIn - Seconds until new token expires
   */
  async updateAccessToken(newAccessToken, expiresIn) {
    const currentTokens = this.getTokens();
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
}

// Singleton instance
const tokenService = new TokenService();

module.exports = tokenService;
