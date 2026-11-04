import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import { getTheme } from './theme';
import CssBaseline from '@mui/material/CssBaseline';
import * as Sentry from '@sentry/electron/renderer';
import App from './App';
import './index.css';
import { useTheme } from './hooks/useTheme';
import { E2E } from './services/e2eMode';
import { STORAGE_KEY_REST_SERVER } from './components/dialogs/PreferencesDialog';

// End-to-end test run (tests/e2e): this copy talks to the test's server, and
// the test can reach the stores. Before anything reads the preference.
if (E2E) {
  localStorage.setItem(STORAGE_KEY_REST_SERVER, E2E.server);
  void import('./services/e2eHooks');
}

// Initialize Sentry for renderer process error tracking
// Only enabled in production (main process controls this via IPC)
Sentry.init({
  dsn: 'https://a0a059594ef2ba9bfecb1e6bf028afde@o4510450188484608.ingest.us.sentry.io/4510450322046976',
});

// =============================================================================
// ERROR CAPTURE: Send console.error to Sentry and log file
// =============================================================================

// Store the original console.error function
const originalConsoleError = console.error;

// Override console.error to capture errors
console.error = (...args: unknown[]) => {
  // Call the original console.error first
  originalConsoleError.apply(console, args);

  // Format the message
  const message = args
    .map((arg) => {
      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
      }
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');

  // Send to Sentry (errors only, not warnings)
  Sentry.captureMessage(message, 'error');

  // Send to log file via IPC
  if (window.api?.logs?.write) {
    window.api.logs.write('ERROR', message, 'console').catch(() => {
      // Silently fail if logging fails to avoid infinite recursion
    });
  }
};

// Capture unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message =
    reason instanceof Error
      ? `Unhandled Promise Rejection: ${reason.name}: ${reason.message}\n${reason.stack || ''}`
      : `Unhandled Promise Rejection: ${String(reason)}`;

  // Send to Sentry
  Sentry.captureException(reason);

  // Send to log file
  if (window.api?.logs?.write) {
    window.api.logs.write('ERROR', message, 'unhandledRejection').catch(() => {
      // Silently fail
    });
  }
});

// Capture uncaught errors
window.addEventListener('error', (event) => {
  const { message: errorMessage, filename, lineno, colno, error } = event;
  const fullMessage = error
    ? `Uncaught Error: ${error.name}: ${error.message}\n${error.stack || ''}`
    : `Uncaught Error: ${errorMessage} at ${filename}:${lineno}:${colno}`;

  // Sentry automatically captures these, but we also want them in the log file
  if (window.api?.logs?.write) {
    window.api.logs.write('ERROR', fullMessage, 'uncaughtError').catch(() => {
      // Silently fail
    });
  }
});


// Wrapper component that makes MUI theme reactive to Zustand state
function ThemedApp() {
  const { effectiveTheme } = useTheme();
  const muiTheme = React.useMemo(() => getTheme(effectiveTheme), [effectiveTheme]);

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemedApp />
  </React.StrictMode>
);
