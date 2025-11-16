/// <reference types="vite/client" />

declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.jpeg' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}

declare module '*.gif' {
  const value: string;
  export default value;
}

// Electron API declarations
interface Window {
  api?: {
    version: string;
    onNewProject: (callback: () => void) => void;
    onOpenProject: (callback: () => void) => void;
    onEditProject: (callback: () => void) => void;
    onShowProjectDebug: (callback: () => void) => void;
    onClearProject: (callback: () => void) => void;
    openTiffDialog: () => Promise<string | null>;
    loadTiffImage: (filePath: string) => Promise<{
      width: number;
      height: number;
      data: string;
      filePath: string;
      filename: string;
    }>;
    setWindowTitle: (title: string) => void;
    onThemeChange: (callback: (theme: 'dark' | 'light' | 'system') => void) => void;
    notifyThemeChanged: (theme: 'dark' | 'light' | 'system') => void;
  };
}
