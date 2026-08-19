#!/usr/bin/env bash
# 把从 GitHub Releases 下载的 macOS arm64 + Windows x64 安装包上传到 COS
#
# 用法：apps/electron/scripts/upload-cos-github.sh <下载目录> <版本号>
#   例：apps/electron/scripts/upload-cos-github.sh ~/Downloads/release 1.0.7
#
# 下载目录里应包含（从 GitHub Release 下载）：
#   ShaDiaoAgent-{v}-arm64.dmg / .zip / .dmg.blockmap / .zip.blockmap
#   latest-mac.yml                       ← arm64 的元数据（与 x64 的区分开，x64 走 release-cos-x64.sh）
#   ShaDiaoAgent-Setup-{v}-x64.exe / .exe.blockmap
#   ShaDiaoAgent-{v}-x64-portable.zip      ← Windows 免安装便携版
#   latest.yml                           ← Windows 的元数据
set -euo pipefail

BUCKET="shadiaoai-1451923852"   # bucket 全名（短名-appid）
REGION="ap-shanghai"
COS_ALIAS="${BUCKET}"

DIR="${1:?用法: $0 <下载目录> <版本号>}"
VERSION="${2:?用法: $0 <下载目录> <版本号>}"

if ! command -v coscli >/dev/null 2>&1; then
  echo "❌ 未找到 coscli，请先安装并加入 PATH"
  exit 1
fi

# macOS arm64 → downloads/mac-arm64/
echo "==> 上传 macOS arm64 → downloads/mac-arm64/"
for f in \
  "ShaDiaoAgent-${VERSION}-arm64.dmg" \
  "ShaDiaoAgent-${VERSION}-arm64.zip" \
  "ShaDiaoAgent-${VERSION}-arm64.dmg.blockmap" \
  "ShaDiaoAgent-${VERSION}-arm64.zip.blockmap" \
  "latest-mac.yml"; do
  [ -f "${DIR}/${f}" ] && coscli cp "${DIR}/${f}" "cos://${COS_ALIAS}/downloads/mac-arm64/${f}" \
    || echo "  ⚠️ 跳过缺失: ${f}"
done

# Windows x64 → downloads/windows/
echo "==> 上传 Windows x64 → downloads/windows/"
for f in \
  "ShaDiaoAgent-Setup-${VERSION}-x64.exe" \
  "ShaDiaoAgent-Setup-${VERSION}-x64.exe.blockmap" \
  "ShaDiaoAgent-${VERSION}-x64-portable.zip" \
  "latest.yml"; do
  [ -f "${DIR}/${f}" ] && coscli cp "${DIR}/${f}" "cos://${COS_ALIAS}/downloads/windows/${f}" \
    || echo "  ⚠️ 跳过缺失: ${f}"
done

echo ""
echo "✅ arm64 + Windows 上传完成"
echo "   macOS Intel(x64) 请用 release-cos-x64.sh 单独打包上传"
