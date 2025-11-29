# Build Assets

This folder contains assets needed for building the application.

## Required Icons

Before building, you need to add application icons:

### macOS (`icon.icns`)
- Required for macOS builds
- Must be in `.icns` format
- Should contain multiple sizes (16x16 to 1024x1024)
- Generate from a 1024x1024 PNG using:
  ```bash
  # On macOS, you can use iconutil
  mkdir icon.iconset
  sips -z 16 16 source.png --out icon.iconset/icon_16x16.png
  sips -z 32 32 source.png --out icon.iconset/icon_16x16@2x.png
  sips -z 32 32 source.png --out icon.iconset/icon_32x32.png
  sips -z 64 64 source.png --out icon.iconset/icon_32x32@2x.png
  sips -z 128 128 source.png --out icon.iconset/icon_128x128.png
  sips -z 256 256 source.png --out icon.iconset/icon_128x128@2x.png
  sips -z 256 256 source.png --out icon.iconset/icon_256x256.png
  sips -z 512 512 source.png --out icon.iconset/icon_256x256@2x.png
  sips -z 512 512 source.png --out icon.iconset/icon_512x512.png
  sips -z 1024 1024 source.png --out icon.iconset/icon_512x512@2x.png
  iconutil -c icns icon.iconset -o icon.icns
  rm -rf icon.iconset
  ```

### Windows (`icon.ico`)
- Required for Windows builds
- Must be in `.ico` format
- Should contain multiple sizes (16x16 to 256x256)
- You can generate using online tools or ImageMagick:
  ```bash
  convert source.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
  ```

### Linux (`icons/` folder)
- PNG files at different sizes
- Required files:
  - `icons/16x16.png`
  - `icons/32x32.png`
  - `icons/48x48.png`
  - `icons/64x64.png`
  - `icons/128x128.png`
  - `icons/256x256.png`
  - `icons/512x512.png`

## Other Files

### `entitlements.mac.plist`
Contains macOS entitlements for hardened runtime. Required for notarization.
This file is already configured - no changes needed.

## Quick Icon Generation Script

If you have ImageMagick installed, run this from the project root:

```bash
# Source should be a 1024x1024 PNG
SOURCE="src/assets/strabo-logo.png"

# Generate Linux icons
for size in 16 32 48 64 128 256 512; do
  convert "$SOURCE" -resize ${size}x${size} "build/icons/${size}x${size}.png"
done

# Generate Windows icon
convert "$SOURCE" -define icon:auto-resize=256,128,64,48,32,16 build/icon.ico

# Generate macOS icon (on macOS only)
mkdir -p build/icon.iconset
sips -z 16 16 "$SOURCE" --out build/icon.iconset/icon_16x16.png
sips -z 32 32 "$SOURCE" --out build/icon.iconset/icon_16x16@2x.png
sips -z 32 32 "$SOURCE" --out build/icon.iconset/icon_32x32.png
sips -z 64 64 "$SOURCE" --out build/icon.iconset/icon_32x32@2x.png
sips -z 128 128 "$SOURCE" --out build/icon.iconset/icon_128x128.png
sips -z 256 256 "$SOURCE" --out build/icon.iconset/icon_128x128@2x.png
sips -z 256 256 "$SOURCE" --out build/icon.iconset/icon_256x256.png
sips -z 512 512 "$SOURCE" --out build/icon.iconset/icon_256x256@2x.png
sips -z 512 512 "$SOURCE" --out build/icon.iconset/icon_512x512.png
sips -z 1024 1024 "$SOURCE" --out build/icon.iconset/icon_512x512@2x.png
iconutil -c icns build/icon.iconset -o build/icon.icns
rm -rf build/icon.iconset
```
