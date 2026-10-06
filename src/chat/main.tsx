/**
 * The chat window's page (chat.html; collaboration spec v3 17bd, 17be).
 * A small React app apart from the main one: no project, no canvas. The
 * main process keeps the chat (electron/sync/chat.js); this page shows it.
 * The theme follows the main window's setting through localStorage (both
 * pages share the origin, and a change there fires 'storage' here).
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { getTheme } from '../theme';
import { ChatApp } from './ChatApp';

const STORE_KEY = 'strabomicro-storage';

function themeSetting(): 'dark' | 'light' | 'system' {
  try {
    const t = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')?.state?.theme;
    return t === 'light' || t === 'system' ? t : 'dark';
  } catch {
    return 'dark';
  }
}

function effective(setting: 'dark' | 'light' | 'system'): 'dark' | 'light' {
  if (setting !== 'system') return setting;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function ThemedChat() {
  const [mode, setMode] = React.useState(() => effective(themeSetting()));
  React.useEffect(() => {
    const update = () => setMode(effective(themeSetting()));
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORE_KEY) update();
    };
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    window.addEventListener('storage', onStorage);
    media.addEventListener('change', update);
    return () => {
      window.removeEventListener('storage', onStorage);
      media.removeEventListener('change', update);
    };
  }, []);
  React.useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);
  const theme = React.useMemo(() => getTheme(mode), [mode]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ChatApp />
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemedChat />
  </React.StrictMode>
);
