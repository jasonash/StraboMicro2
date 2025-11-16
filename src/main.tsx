import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, createTheme, Theme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App';
import './index.css';
import { useTheme } from './hooks/useTheme';

// Shared theme configuration
const getTheme = (mode: 'dark' | 'light'): Theme => createTheme({
  palette: {
    mode,
    primary: {
      main: '#e44c65', // Pinkish-red accent (same for both themes)
      contrastText: '#fff',
    },
    background: mode === 'dark' ? {
      default: '#1a1a1a',
      paper: '#2d2d2d',
    } : {
      default: '#f5f5f0', // Warm off-white (softer than pure white)
      paper: '#faf9f6',   // Warmer paper background
    },
    divider: mode === 'dark' ? '#404040' : '#d0d0d0',
    text: mode === 'dark' ? {
      primary: '#e0e0e0',
      secondary: '#b0b0b0',
    } : {
      primary: '#2a2a2a',  // Softer than pure black
      secondary: '#5a5a5a', // Warmer medium gray
    },
  },
  typography: {
    fontFamily: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 14,
  },
  transitions: {
    // Customize transition durations for smoother animations
    duration: {
      shortest: 150,
      shorter: 200,
      short: 250,
      standard: 300,
      complex: 375,
      enteringScreen: 225,
      leavingScreen: 195,
    },
    easing: {
      // Material Design standard easing curves
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: theme.palette.background.paper,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }),
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: ({ theme }) => ({
          backgroundColor: theme.palette.background.paper,
          borderRight: `1px solid ${theme.palette.divider}`,
        }),
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none', // Remove MUI's default gradient
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none', // Don't uppercase button text
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: ({ theme }) => ({
          // Style the date picker calendar icon
          '& input[type="date"]::-webkit-calendar-picker-indicator': {
            filter: theme.palette.mode === 'dark' ? 'brightness(0) invert(1)' : 'none',
            cursor: 'pointer',
          },
          // Style the native date input calendar popup
          '& input[type="date"]::-webkit-datetime-edit': {
            color: theme.palette.text.primary,
          },
          '& input[type="date"]::-webkit-datetime-edit-fields-wrapper': {
            color: theme.palette.text.primary,
          },
          '& input[type="date"]::-webkit-datetime-edit-text': {
            color: theme.palette.text.primary,
          },
          '& input[type="date"]::-webkit-datetime-edit-month-field': {
            color: theme.palette.text.primary,
          },
          '& input[type="date"]::-webkit-datetime-edit-day-field': {
            color: theme.palette.text.primary,
          },
          '& input[type="date"]::-webkit-datetime-edit-year-field': {
            color: theme.palette.text.primary,
          },
        }),
      },
    },
  },
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
