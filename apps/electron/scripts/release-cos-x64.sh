#!/usr/bin/env bash
# 本地打包 macOS x64 并上传到 COS（mac-x64 前缀）
#
# 用法：apps/electron/scripts/release-cos-x64.sh
# 前置：coscli 已安装并在 PATH（coscli config init 配好子账号密钥 + bucket）
# 发版前先把 apps/electron/package.json 的 version 升到目标版本（如 1.0.7）
#
# 上传产物（一整套，不是只传 dmg）：
#   downloads/mac-x64/latest-mac.yml
#   downloads/mac-x64/ShaDiaoAgent-{v}-x64.dmg / .zip / .dmg.blockmap / .zip.blockmap
set -euo pipefail

BUCKET="shadiaoai-1451923852"   # bucket 全名（短名-appid）
REGION="ap-shanghai"
COS_ALIAS="${BUCKET}"           # coscli config 里的 alias（默认 = 短名-appid）

# 切到 apps/electron 目录
cd "$(dirname "$0")/.."

# 检查 coscli
if ! command -v coscli >/dev/null 2>&1; then
  echo "❌ 未找到 coscli，请先安装并加入 PATH"
  exit 1
fi

# 读版本号（bun 优先，node 兜底）
VERSION=$(bun -e "console.log(require('./package.json').version)" 2>/dev/null \
  || node -p "require('./package.json').version" 2>/dev/null || true)
if [ -z "$VERSION" ]; then
  echo "❌ 无法读取版本号，请确认 package.json 里 version 字段"
  exit 1
fi

# ① 设 update URL（关键：x64 用户自动更新指向这里）
export SHADIAO_UPDATE_URL="https://${BUCKET}.cos.${REGION}.myqcloud.com/downloads/mac-x64/"
echo "==> update URL: ${SHADIAO_UPDATE_URL}"
echo "==> version: ${VERSION}"

# ② 打包（产出 x64 的 dmg + zip + blockmap + latest-mac.yml）
bun run dist:mac

# ③ 上传一整套到 mac-x64 前缀（不是只传 dmg！）
for f in \
  "ShaDiaoAgent-${VERSION}-x64.dmg" \
  "ShaDiaoAgent-${VERSION}-x64.zip" \
  "ShaDiaoAgent-${VERSION}-x64.dmg.blockmap" \
  "ShaDiaoAgent-${VERSION}-x64.zip.blockmap" \
  "latest-mac.yml"; do
  echo "==> 上传 ${f}"
  coscli cp "out/${f}" "cos://${COS_ALIAS}/downloads/mac-x64/${f}"
done

echo ""
echo "✅ x64 已上传到 downloads/mac-x64/"
echo "   下载 URL: https://${BUCKET}.cos.${REGION}.myqcloud.com/downloads/mac-x64/ShaDiaoAgent-${VERSION}-x64.dmg"
