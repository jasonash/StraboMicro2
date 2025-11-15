import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App';
import './index.css';

// Create dark theme with custom colors matching the original design
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#e44c65', // Pinkish-red accent
      contrastText: '#fff',
    },
    background: {
      default: '#1e1e1e', // Very dark grey
      paper: '#2d2d2d',   // Dark grey for panels/cards
    },
    divider: '#404040',
    text: {
      primary: '#e0e0e0',
      secondary: '#b0b0b0',
    },
  },
  typography: {
    fontFamily: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 14,
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#2d2d2d',
          borderBottom: '1px solid #404040',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#2d2d2d',
          borderRight: '1px solid #404040',
        },
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
        root: {
          // Style the date picker calendar icon to be visible in dark mode
          '& input[type="date"]::-webkit-calendar-picker-indicator': {
            filter: 'invert(1)',
            cursor: 'pointer',
          },
          // Style the native date input calendar popup
          '& input[type="date"]::-webkit-datetime-edit': {
            color: '#e0e0e0',
          },
          '& input[type="date"]::-webkit-datetime-edit-fields-wrapper': {
            color: '#e0e0e0',
          },
          '& input[type="date"]::-webkit-datetime-edit-text': {
            color: '#e0e0e0',
          },
          '& input[type="date"]::-webkit-datetime-edit-month-field': {
            color: '#e0e0e0',
          },
          '& input[type="date"]::-webkit-datetime-edit-day-field': {
            color: '#e0e0e0',
          },
          '& input[type="date"]::-webkit-datetime-edit-year-field': {
            color: '#e0e0e0',
          },
        },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
