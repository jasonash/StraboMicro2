# Debugging Guide for StraboMicro

This guide covers the debugging tools available in the StraboMicro Electron application.

## Table of Contents
- [React DevTools](#react-devtools)
- [Redux DevTools (Zustand)](#redux-devtools-zustand)
- [Electron Log](#electron-log)
- [Built-in Chrome DevTools](#built-in-chrome-devtools)

---

## React DevTools

**What it is:** Browser extension for inspecting React component trees, props, state, and hooks.

**How to access:**
1. Run the app in development mode: `npm run dev`
2. React DevTools automatically installs on first run
3. Open DevTools: Debug → Toggle DevTools (or Cmd/Ctrl+Shift+I)
4. Look for the "Components" and "Profiler" tabs

**Features:**
- **Components Tab**: Browse the React component tree
- **Props & State**: Inspect current values for any component
- **Hooks**: See all hooks (useState, useEffect, etc.) for each component
- **Search**: Find components by name
- **Edit Props**: Temporarily change prop values to test behavior
- **Performance Profiling**: Identify slow renders

**Common Use Cases:**
```
✓ Check if a component is receiving the correct props
✓ Debug state updates in real-time
✓ Find which component is causing re-renders
✓ Verify hook dependencies
```

---

## Redux DevTools (Zustand)

**What it is:** Time-travel debugging for your Zustand store (already configured with `devtools` middleware).

**How to access:**
1. Install Redux DevTools browser extension:
   - Chrome: https://chrome.google.com/webstore/detail/redux-devtools/
   - Firefox: https://addons.mozilla.org/en-US/firefox/addon/reduxdevtools/
2. Run the app: `npm run dev`
3. Open DevTools: Debug → Toggle DevTools
4. Look for the "Redux" tab

**Features:**
- **Action History**: See every state change (addSpot, updateProject, etc.)
- **Time Travel**: Jump back to previous states
- **State Inspector**: View current store state as JSON
- **Diff View**: See exactly what changed between actions
- **Export/Import**: Save and reload state snapshots

**Common Use Cases:**
```
✓ Debug why a project isn't saving correctly
✓ Replay user actions to reproduce a bug
✓ Inspect the exact state before a crash
✓ Compare state before/after an action
```

**Store Actions You'll See:**
- `loadProject` - New project loaded
- `addMicrograph` - Micrograph added to sample
- `addSpot` - Spot annotation created
- `updateSpotData` - Spot metadata changed
- `selectMicrograph` - Navigation state changed

---

## Electron Log

**What it is:** File-based logging for the Electron main process (Node.js side).

**Log Locations:**
```bash
# macOS
~/Library/Logs/StraboMicro2/main.log

# Windows
%USERPROFILE%\AppData\Roaming\StraboMicro2\logs\main.log

# Linux
~/.config/StraboMicro2/logs/main.log
```

**How to use:**
Logs are written automatically. Check the file after:
- App crashes or errors
- TIFF loading issues
- File I/O problems
- IPC handler errors

**Example Log Output:**
```
[2025-11-14 16:12:28.962] [info] StraboMicro application starting...
[2025-11-14 16:12:28.968] [info] Electron version: 28.3.3
[2025-11-14 16:12:28.969] [info] Node version: 18.18.2
[2025-11-14 16:12:29.964] [info] Added DevTools Extension: React Developer Tools
[2025-11-14 16:13:45.123] [info] Loading TIFF: /path/to/image.tif
[2025-11-14 16:13:45.456] [info] TIFF decoded: 2048x1536, 9437184 bytes, 3 bytes/pixel
[2025-11-14 16:13:45.567] [info] Converting RGB to RGBA
[2025-11-14 16:13:46.234] [info] TIFF loaded successfully: 2048x1536, 12582912 bytes RGBA
```

**Log Levels:**
- `log.error()` - Errors (always written)
- `log.warn()` - Warnings
- `log.info()` - Important events (default level)
- `log.debug()` - Verbose debugging (console only)

**Viewing Logs in Real-Time:**
```bash
# macOS/Linux
tail -f ~/Library/Logs/StraboMicro2/main.log

# Windows (PowerShell)
Get-Content -Path "$env:USERPROFILE\AppData\Roaming\StraboMicro2\logs\main.log" -Wait
```

---

## Built-in Chrome DevTools

**How to access:**
1. Debug → Toggle DevTools (or Cmd/Ctrl+Shift+I)
2. DevTools opens automatically in development mode

**Useful Tabs:**

### **Console Tab**
- View `console.log()`, errors, and warnings from renderer process
- Test JavaScript expressions
- Access React components via `$r` (select element first)

### **Sources Tab**
- Set breakpoints in TypeScript source files
- Step through code execution
- Inspect variable values at breakpoints
- Debug IPC communication

### **Network Tab**
- Monitor Vite HMR requests
- Debug slow resource loading
- Check if assets are cached

### **Performance Tab**
- Record CPU/memory usage
- Find slow renders
- Identify performance bottlenecks

### **Application Tab**
- Inspect localStorage (where Zustand persists state)
- View IndexedDB (if used for tile caching later)
- Check service workers (if added)

---

## Debug Menu Items

StraboMicro includes custom debug tools in the **Debug** menu:

### **Show Project Structure** (Cmd/Ctrl+Shift+D)
Opens a modal showing:
- Current project JSON structure
- File path and dirty state
- Hierarchy counts (datasets, samples, micrographs)
- Copy to clipboard button

**Use this to:**
- Verify project data after wizard completion
- Debug state persistence issues
- Share project structure in bug reports

### **Clear Project**
Clears the current project from localStorage.

**Use this to:**
- Reset to clean state for testing
- Fix corrupted state issues
- Start fresh without restarting the app

### **Force Reload** (Cmd/Ctrl+Shift+R)
Reloads the app ignoring cache (harder reload than Cmd+R).

---

## Debugging Common Issues

### **App Won't Load / White Screen**
1. Open DevTools (Cmd/Ctrl+Shift+I)
2. Check Console tab for errors
3. Check Network tab for failed requests
4. Check electron-log file for main process errors

### **State Not Updating**
1. Open Redux DevTools
2. Check if action was dispatched
3. Look at "Diff" view to see what changed
4. Use "State" view to inspect current store

### **Component Not Re-rendering**
1. Open React DevTools → Components tab
2. Find the component in the tree
3. Check if props/state changed
4. Use Profiler to see if it rendered

### **TIFF Loading Fails**
1. Check electron-log file for error details
2. Look for "Error loading TIFF" messages
3. Verify file path and format (RGB/RGBA)
4. Check bytes-per-pixel detection

### **IPC Communication Issues**
1. Set breakpoints in Sources tab
2. Check electron-log for handler execution
3. Verify IPC channel names match (main.js vs preload.js)
4. Use Console to test `window.api` methods

---

## Tips & Tricks

### **Find Memory Leaks**
1. Performance tab → Memory
2. Take heap snapshot
3. Perform actions (load project, add spots)
4. Take another snapshot
5. Compare to find retained objects

### **Debug Zustand Store**
```javascript
// In Console tab
const state = window.__ZUSTAND_STORE__?.getState();
console.log(state.project);
```

### **Inspect React Component**
1. Right-click element → Inspect
2. In Console: `$r` gives you the React component instance
3. Access props: `$r.props`
4. Access hooks: visible in React DevTools

### **Performance Profiling**
1. React DevTools → Profiler tab
2. Click "Record"
3. Perform slow action
4. Stop recording
5. View flamegraph to find slow components

---

## Additional Resources

- **Electron DevTools**: https://www.electronjs.org/docs/latest/tutorial/devtools-extension
- **React DevTools**: https://react.dev/learn/react-developer-tools
- **Redux DevTools**: https://github.com/reduxjs/redux-devtools
- **electron-log**: https://github.com/megahertz/electron-log
- **Chrome DevTools**: https://developer.chrome.com/docs/devtools/

---

## Troubleshooting DevTools

### **React DevTools Not Showing**
- Check Console for installation errors
- Restart Electron: `npm run dev` (DevTools install on first run)
- Verify in electron-log: "Added DevTools Extension: React Developer Tools"

### **Redux DevTools Not Connecting**
- Install browser extension (see link above)
- Check that Zustand store has `devtools` middleware (already configured)
- Refresh page after installing extension

### **Logs Not Writing**
- Check file permissions in log directory
- Verify `electron-log` is imported in main.js
- Check console for electron-log errors
