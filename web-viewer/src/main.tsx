import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import App from './App';
import { viewerConfig } from './config/current';

// Dark = the desktop app's theme exactly. Light (config.js theme: 'light')
// for pages with a white background, such as a data portal embedding the
// viewer in an iframe. The canvas stays dark in both (TiledViewer).
const palettes = {
  dark: {
    background: { default: '#1a1a1a', paper: '#2d2d2d' },
    divider: '#404040',
    text: { primary: '#e0e0e0', secondary: '#b0b0b0' },
  },
  light: {
    background: { default: '#f4f4f4', paper: '#ffffff' },
    divider: '#d8d8d8',
    text: { primary: '#222222', secondary: '#555555' },
  },
} as const;

const theme = createTheme({
  palette: {
    mode: viewerConfig.theme,
    primary: {
      main: '#e44c65',
      contrastText: '#fff',
    },
    ...palettes[viewerConfig.theme],
  },
  typography: {
    fontFamily: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 14,
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
      },
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>
);
