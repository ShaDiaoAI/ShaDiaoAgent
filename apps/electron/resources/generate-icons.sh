#!/bin/bash

# Proma Icon Generation Script
# Generates all required icon formats from icon.svg
# Requires: rsvg-convert (librsvg), iconutil (macOS), magick (ImageMagick)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🎨 Generating ShaDiaoAgent icons..."

# Check required tools
if ! command -v rsvg-convert &> /dev/null; then
    echo "❌ rsvg-convert not found. Install with: brew install librsvg"
    exit 1
fi

if ! command -v magick &> /dev/null; then
    echo "❌ ImageMagick (magick) not found. Install with: brew install imagemagick"
    exit 1
fi

if ! command -v iconutil &> /dev/null; then
    echo "⚠️  iconutil not found (macOS only). Skipping .icns generation"
fi

# 1. Generate icon.png (1024x1024) from SVG
echo "📦 Generating icon.png (1024x1024)..."
rsvg-convert -w 1024 -h 1024 icon.svg -o icon.png

# 2. Generate "沙" character tray icons (Template images for macOS menu bar)
echo "📦 Generating 沙 character tray icons..."

# macOS Template 图标必须是黑色前景+透明背景，系统自动根据深浅模式着色
mkdir -p shadiao-logos

for SIZE in 22 44 66; do
  SUFFIX=""
  [ "$SIZE" = "44" ] && SUFFIX="@2x"
  [ "$SIZE" = "66" ] && SUFFIX="@3x"

  # 尝试多种 macOS 中文字体路径
  FONT_PATH=""
  for FONT in "/System/Library/Fonts/PingFang.ttc" "/System/Library/Fonts/STHeiti Light.ttc" "/System/Library/Fonts/Hiragino Sans GB.ttc"; do
    if [ -f "$FONT" ]; then
      FONT_PATH="$FONT"
      break
    fi
  done

  if [ -n "$FONT_PATH" ]; then
    magick -size "${SIZE}x${SIZE}" -background none \
      -fill black -gravity center \
      -font "$FONT_PATH" -pointsize "$((SIZE * 3 / 4))" \
      label:"沙" \
      "shadiao-logos/iconTemplate${SUFFIX}.png"
  else
    # 如果没有中文系统字体，用 magick 内置字体生成英文回退
    echo "⚠️  No CJK font found, using fallback"
    magick -size "${SIZE}x${SIZE}" -background none \
      -fill black -gravity center \
      label:"S" \
      "shadiao-logos/iconTemplate${SUFFIX}.png"
  fi
done

echo "✅ Tray icons generated:"
echo "   - shadiao-logos/iconTemplate.png (22x22 @1x)"
echo "   - shadiao-logos/iconTemplate@2x.png (44x44 @2x Retina)"
echo "   - shadiao-logos/iconTemplate@3x.png (66x66 @3x)"

# 3. Generate .icns (macOS app icon)
if command -v iconutil &> /dev/null; then
    echo "📦 Generating icon.icns..."

    # Create iconset directory
    mkdir -p icon.iconset

    # Generate all required sizes for macOS
    # Standard resolutions
    sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png      > /dev/null 2>&1
    sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png   > /dev/null 2>&1
    sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png      > /dev/null 2>&1
    sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png   > /dev/null 2>&1
    sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png    > /dev/null 2>&1
    sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png > /dev/null 2>&1
    sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png    > /dev/null 2>&1
    sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png > /dev/null 2>&1
    sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png    > /dev/null 2>&1
    sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png > /dev/null 2>&1

    # Convert to .icns
    iconutil -c icns icon.iconset -o icon.icns

    # Clean up
    rm -rf icon.iconset

    echo "✅ icon.icns generated"
else
    echo "⚠️  Skipping .icns generation (iconutil not available)"
fi

# 4. Generate .ico (Windows app icon)
echo "📦 Generating icon.ico..."
magick icon.png -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico
echo "✅ icon.ico generated"

echo ""
echo "✅ All icons generated successfully!"
echo ""
echo "Generated files:"
echo "  - icon.png (1024x1024) - Linux &amp; macOS Dock"
echo "  - icon.icns - macOS app icon"
echo "  - icon.ico - Windows app icon"
echo "  - shadiao-logos/iconTemplate.png - macOS tray 沙字 (22x22 @1x)"
echo "  - shadiao-logos/iconTemplate@2x.png - macOS tray 沙字 (44x44 @2x Retina)"
echo "  - shadiao-logos/iconTemplate@3x.png - macOS tray 沙字 (66x66 @3x)"
