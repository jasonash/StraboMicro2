/**
 * Login Dialog
 *
 * Provides login functionality for StraboSpot authentication.
 * Credentials are securely transmitted to the server and JWT tokens
 * are stored in the main process using Electron's safeStorage API.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Alert,
  CircularProgress,
  Link,
  Typography,
} from '@mui/material';
import { useAuthStore } from '@/store/useAuthStore';

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginDialog({ isOpen, onClose }: LoginDialogProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { login, isLoading, error, clearError } = useAuthStore();

  // Clear form and error when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      clearError();
    } else {
      setEmail('');
      setPassword('');
    }
  }, [isOpen, clearError]);

  const handleLogin = async () => {
    if (!email || !password) {
      return;
    }

    const success = await login(email, password);

    if (success) {
      onClose();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && email && password && !isLoading) {
      handleLogin();
    }
  };

  const handleCreateAccount = async () => {
    // Open StraboSpot registration page in browser
    if (window.api?.openExternalLink) {
      await window.api.openExternalLink('https://strabospot.org/register');
    }
  };

  const handleForgotPassword = async () => {
    // Open StraboSpot password reset page in browser
    if (window.api?.openExternalLink) {
      await window.api.openExternalLink('https://strabospot.org/password/reset');
    }
  };

  const isFormValid = email.trim() !== '' && password !== '';

  return (
    <Dialog
      open={isOpen}
      onClose={isLoading ? undefined : onClose}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>Sign in to StraboSpot</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <TextField
            fullWidth
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            autoFocus
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            sx={{ mb: 2 }}
          />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Link
              component="button"
              variant="body2"
              onClick={handleCreateAccount}
              disabled={isLoading}
              sx={{ cursor: 'pointer' }}
            >
              Create account
            </Link>
            <Link
              component="button"
              variant="body2"
              onClick={handleForgotPassword}
              disabled={isLoading}
              sx={{ cursor: 'pointer' }}
            >
              Forgot password?
            </Link>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            Sign in with your StraboSpot account to sync projects and access cloud features.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleLogin}
          variant="contained"
          disabled={!isFormValid || isLoading}
          startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
