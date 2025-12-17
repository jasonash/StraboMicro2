# StraboMicro2

<p align="center">
  <img src=".github/assets/strabomicro_icon.png" alt="StraboMicro Logo" width="128" height="128">
</p>

<p align="center">
  <strong>A modern desktop application for geological microanalysis</strong>
</p>

<p align="center">
  <a href="https://github.com/jasonash/StraboMicro2/releases/tag/dev-latest">
    <img src="https://img.shields.io/badge/Download-Dev%20Build-blue" alt="Download Dev Build">
  </a>
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>

---

StraboMicro2 is a complete rewrite of the original [StraboMicro](https://www.strabospot.org/strabomicro) JavaFX application, rebuilt from the ground up using modern web technologies. It enables geologists to manage, annotate, and analyze thin section micrographs with sophisticated hierarchical image organization and spatial registration.

## Features

### Image Management
- **Large Image Support** - Handle 100MB+ TIFF micrographs with tiled rendering for smooth performance
- **Hierarchical Overlays** - Place child micrographs on parent images with drag, resize, and rotate
- **3-Point Registration** - Precise overlay alignment using affine transforms (handles translation, rotation, scale, and shear)
- **Multi-format Import** - Support for TIFF, JPEG, PNG, and BMP image formats
- **Drill-down Navigation** - Click overlays to navigate into them, with back button support
- **Image Comparator** - Full-screen side-by-side (2 or 4 panel) comparison of micrographs with independent pan/zoom
- **Micrograph Opacity** - Adjustable opacity for overlays with batch editing support

### Annotation Tools
- **Spot Types** - Create point, line, and polygon annotations
- **78 Feature Types** - Comprehensive geological classification (grains, fractures, fabrics, veins, folds, and more)
- **Real-time Measurements** - Automatic calculation of length, area, and perimeter with scale calibration
- **Recursive Spots** - View child micrograph spots on parent view with correct transformations
- **Multi-select** - Cmd+Click for additive selection, Shift+Drag for lasso selection
- **Batch Edit** - Edit multiple spots simultaneously (color, classification, tags)
- **Merge & Split** - Combine overlapping polygons or split with a cutting line
- **Archived Spots** - Hide spots without deleting them (toggle via View menu)

### Point Counting System
- **Modal Analysis** - Dedicated point counting mode separate from spot annotations
- **Grid Generation** - Regular, random, or stratified point placement
- **Quick Classify Toolbar** - Keyboard-driven mineral classification (letter keys for shortcuts)
- **Lasso Selection** - Batch classify points by drawing selection area
- **Arrow Key Navigation** - Spatial navigation through grid points
- **Statistics Panel** - Real-time counts, percentages, and confidence intervals
- **Session Management** - Save, load, rename, and delete counting sessions

### Grain Detection (AI-Assisted)
- **Automated Detection** - OpenCV.js computer vision for grain boundary identification
- **Detection Presets** - Built-in settings for common rock types (granite, basalt, sandstone, etc.)
- **Adjustable Parameters** - Sensitivity, minimum grain size, edge contrast sliders
- **Interactive Preview** - Live visualization with zoom/pan before committing
- **Polygon Simplification** - Douglas-Peucker algorithm to reduce vertex count
- **Quick Edit Integration** - Automatically opens Quick Edit to classify detected grains

### Quick Edit Mode
- **Keyboard-driven Workflow** - Rapidly classify spots using letter key shortcuts
- **Visual States** - Gold (current), lime (classified), cyan (unclassified)
- **Spatial Navigation** - Arrow keys move through spots in reading order
- **Statistics Panel** - Progress tracking with mineral distribution
- **Filter Options** - Show all spots or only unclassified

### Project Organization
- **Hierarchical Structure** - Organize work as Project → Dataset → Sample → Micrograph → Spot
- **Version History** - Full project snapshots with restore capability and diff preview
- **Autosave** - Automatic saving with 5-minute inactivity timer
- **Recent Projects** - Quick access menu with relative dates (Today, Yesterday, etc.)
- **Session Persistence** - Remembers last open project across app restarts

### Import & Export
- **SMZ Archives** - Full project export/import as .smz files (ZIP format)
- **SVG Export** - Vector export with editable spots and labels for publication
- **JPEG Export** - Composite images with overlays baked in
- **PDF Reports** - Project documentation export
- **JSON Export** - Raw data export for analysis
- **Incomplete Micrograph Protection** - Warns before export if micrographs are missing required metadata

### Cloud Integration
- **StraboSpot Sync** - Upload and download projects from [strabospot.org](https://strabospot.org)
- **Shared Projects** - Import projects shared by colleagues via 6-character codes
- **Instrument Database** - Access shared instrument configurations
- **Automatic Token Refresh** - Seamless authentication for long sessions

### User Interface
- **Dark/Light/System Themes** - Full theme support with View menu toggle
- **Collapsible Panels** - Resizable left, right, and bottom panels
- **Inline Notes Editing** - Edit detailed notes directly in the bottom panel
- **Properties Panel Tabs** - Separate views for Micrograph/Spot and Project metadata
- **Rulers & Scale Bar** - Visual reference overlays (toggleable)
- **Memory Monitor** - Real-time memory usage display (Debug menu)

### Application
- **Automatic Updates** - In-app update notifications with one-click install
- **Error Logging** - Persistent error logs with viewer dialog
- **Error Reporting** - Send error reports directly to developers
- **Cross-platform** - macOS (Universal), Windows, and Linux support

## Screenshots

<p align="center">
  <img src=".github/assets/new_app_screenshot.png" alt="StraboMicro2 Interface" width="800">
</p>

## Installation

### Download Pre-built Binaries

Download the latest development build for your platform:

**[Download from GitHub Releases](https://github.com/jasonash/StraboMicro2/releases/tag/dev-latest)**

- **macOS**: DMG installer (Universal - works on Intel and Apple Silicon)
- **Windows**: NSIS installer (.exe)
- **Linux**: AppImage and .deb package

> **Note for Linux AppImage users**: Due to sandbox restrictions, you may need to run with `--no-sandbox`:
> ```bash
> ./StraboMicro2-*.AppImage --no-sandbox
> ```

### Build from Source

#### Prerequisites
- Node.js 18+
- npm 9+

#### Steps

```bash
# Clone the repository
git clone https://github.com/jasonash/StraboMicro2.git
cd StraboMicro2

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Package for your platform
npm run package:mac    # macOS
npm run package:win    # Windows
npm run package:linux  # Linux
```

## Keyboard Shortcuts

### General
| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl+S | Save Project |
| Cmd/Ctrl+Z | Undo |
| Cmd/Ctrl+Shift+Z | Redo |

### Drawing Tools
| Shortcut | Action |
|----------|--------|
| P | Point tool |
| L | Line tool |
| G | Polygon tool |
| M | Measure tool |
| Escape | Cancel current action |

### Quick Edit Mode
| Shortcut | Action |
|----------|--------|
| Arrow keys | Navigate spots spatially |
| Letter keys | Classify with mineral |
| Space | Skip (mark reviewed) |
| Delete | Delete current spot |
| Escape | Exit Quick Edit |

### Point Counting
| Shortcut | Action |
|----------|--------|
| Arrow keys | Navigate grid points |
| Letter keys | Classify point |
| Delete | Clear classification |
| Escape | Exit Point Count mode |

## Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | [Electron](https://www.electronjs.org/) |
| UI | [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Canvas | [Konva.js](https://konvajs.org/) |
| State | [Zustand](https://zustand-demo.pmnd.rs/) |
| Components | [Material UI](https://mui.com/) |
| Image Processing | [Sharp](https://sharp.pixelplumbing.com/) |
| Computer Vision | [OpenCV.js](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html) |
| Build | [Vite](https://vitejs.dev/) + [electron-builder](https://www.electron.build/) |
| Error Tracking | [Sentry](https://sentry.io/) |

## Data Storage

- **Projects**: `~/Documents/StraboMicro2Data/`
- **Tile Cache**: `~/Library/Application Support/StraboMicro2/tile-cache/` (macOS)
- **App Settings**: `~/Library/Application Support/StraboMicro2/` (macOS)
- **Error Logs**: `~/Library/Application Support/StraboMicro2/app.log`
- **Version History**: Per-project in app settings folder

## Related Projects

- [StraboSpot](https://strabospot.org) - Field data collection for structural geology
- [StraboMicro (Legacy)](https://www.strabospot.org/strabomicro) - Original JavaFX version

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

StraboMicro2 is developed by the [StraboSpot](https://strabospot.org) team with support from the National Science Foundation.
