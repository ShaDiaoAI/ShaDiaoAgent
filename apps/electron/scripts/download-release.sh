#!/usr/bin/env bash
# 下载 ShaDiaoAgent 某个版本的 GitHub Release 安装包（断点续传 + 重试容错）
#
# 用法：
#   ./download-release.sh -v 1.0.11                 # 下载全部 4 个主资产
#   ./download-release.sh -v 1.0.11 -a mac-arm64    # 只下 macOS Apple Silicon 安装包
#   ./download-release.sh -v 1.0.11 --list          # 只列可用资产，不下载
#
# 认证：优先 -t/--token，其次环境变量 GITHUB_TOKEN，最后尝试 gh auth token。
# 注意：私有仓库的 fine-grained PAT 不能走 releases/download URL（404），必须走 API 资产端点。
#
# 兼容 macOS 自带 bash 3.2（不用关联数组）。
set -uo pipefail

REPO="ShaDiaoAI/ShaDiaoAgent"
VERSION="1.0.11"
OUTDIR=""
SELECTED=()          # 语义名，可为空（=全部）
LIST_ONLY=0
TOKEN=""
MAX_RETRIES=0        # 0 = 无限重试（过夜推荐）
SPEED_LIMIT=1024     # 字节/秒，连续 SPEED_TIME 秒低于此值视为卡死
SPEED_TIME=60
LOG=""

usage() {
  cat <<'EOF'
用法: download-release.sh [选项]

  -v, --version <v>     版本号（默认 1.0.11）
  -a, --asset <key>     下载指定资产（可多次，或逗号分隔；缺省=全部 4 个）
                        可选: mac-arm64 | mac-arm64-zip | win-setup | win-portable
      --list            只列出可用资产，不下载
  -o, --outdir <dir>    输出目录（默认 ./downloads-<版本>）
  -t, --token <PAT>     GitHub token（优先环境变量 GITHUB_TOKEN / gh auth token）
  -r, --max-retries <n> 每个资产最大重试次数（0=无限，过夜推荐 0）
      --speed-limit <b> 卡死判定速度，字节/秒（默认 1024）
      --speed-time <s>  连续多少秒低于 speed-limit 判定卡死（默认 60）
      --log <file>      日志文件（默认 <输出目录>/download.log）
  -h, --help            显示帮助
EOF
}

# ---- 参数解析 ----
while [ $# -gt 0 ]; do
  case "$1" in
    -v|--version)      VERSION="$2"; shift 2;;
    -a|--asset)        SELECTED+=("$2"); shift 2;;
    -o|--outdir)       OUTDIR="$2"; shift 2;;
    -t|--token)        TOKEN="$2"; shift 2;;
    -r|--max-retries)  MAX_RETRIES="$2"; shift 2;;
    --speed-limit)     SPEED_LIMIT="$2"; shift 2;;
    --speed-time)      SPEED_TIME="$2"; shift 2;;
    --log)             LOG="$2"; shift 2;;
    --list)            LIST_ONLY=1; shift;;
    -h|--help)         usage; exit 0;;
    *) echo "未知参数: $1"; usage; exit 1;;
  esac
done

# ---- 认证 ----
[ -z "$TOKEN" ] && TOKEN="${GITHUB_TOKEN:-}"
if [ -z "$TOKEN" ] && command -v gh >/dev/null 2>&1; then
  TOKEN="$(gh auth token 2>/dev/null)" || TOKEN=""
fi
if [ -z "$TOKEN" ]; then
  echo "❌ 未提供 GitHub token：请用 -t/--token 或环境变量 GITHUB_TOKEN（或先 gh auth login）"
  exit 1
fi

# ---- 日志函数 ----
log() {
  if [ -n "$LOG" ]; then
    printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG"
  else
    printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
  fi
}

# ---- 语义名 → 文件名 ----
asset_filename() {
  case "$1" in
    mac-arm64)      echo "ShaDiaoAgent-${VERSION}-arm64.dmg";;
    mac-arm64-zip)  echo "ShaDiaoAgent-${VERSION}-arm64.zip";;
    win-setup)      echo "ShaDiaoAgent-Setup-${VERSION}-x64.exe";;
    win-portable)   echo "ShaDiaoAgent-${VERSION}-x64-portable.zip";;
    *)              echo "";;
  esac
}
ALL_KEYS="mac-arm64 mac-arm64-zip win-setup win-portable"

# ---- 拉取 release 资产列表 ----
log "==> 查询 $REPO v$VERSION 资产..."
release_json="$(curl -sS -f -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/releases/tags/v$VERSION")" || {
  log "❌ 拉取 release 信息失败（token 无效或版本不存在？）"
  exit 1
}
assets_tsv="$(printf '%s' "$release_json" | python3 -c 'import sys,json; d=json.load(sys.stdin); [print(a["name"], a["id"], a["size"], sep="\t") for a in d.get("assets",[])]')"

# ---- --list ----
if [ "$LIST_ONLY" = 1 ]; then
  echo "v$VERSION 可下载资产（$REPO）:"
  for key in $ALL_KEYS; do
    fname="$(asset_filename "$key")"
    size="$(printf '%s\n' "$assets_tsv" | awk -F'\t' -v n="$fname" '$1==n{print $3; exit}')"
    if [ -n "$size" ]; then
      printf "  %-16s %7s MB  %s\n" "$key" "$((size/1024/1024))" "$fname"
    else
      printf "  %-16s  （缺失）  %s\n" "$key" "$fname"
    fi
  done
  echo ""
  echo "下载: $0 -a <key>（不加 -a 下载全部）"
  exit 0
fi

# ---- 输出目录 / 日志 ----
[ -z "$OUTDIR" ] && OUTDIR="downloads-$VERSION"
mkdir -p "$OUTDIR"
[ -z "$LOG" ] && LOG="$OUTDIR/download.log"

# ---- 确定目标资产 ----
if [ ${#SELECTED[@]} -eq 0 ]; then
  SELECTED=($ALL_KEYS)
fi
keys=()
for s in "${SELECTED[@]}"; do
  IFS=',' read -ra parts <<< "$s"
  keys+=("${parts[@]}")
done

targets=()   # "文件名|id|size"
for key in "${keys[@]}"; do
  fname="$(asset_filename "$key")"
  if [ -z "$fname" ]; then
    log "❌ 未知资产 key: $key（可选: $ALL_KEYS）"
    continue
  fi
  line="$(printf '%s\n' "$assets_tsv" | awk -F'\t' -v n="$fname" '$1==n{print; exit}')"
  if [ -z "$line" ]; then
    log "⚠️  v$VERSION 无资产 $fname，跳过"
    continue
  fi
  id="$(printf '%s' "$line" | cut -f2)"
  size="$(printf '%s' "$line" | cut -f3)"
  targets+=("$fname|$id|$size")
done

if [ ${#targets[@]} -eq 0 ]; then
  log "❌ 没有可下载的目标资产"
  exit 1
fi

file_size() { stat -f%z "$1" 2>/dev/null || stat -c%s "$1" 2>/dev/null || echo 0; }

download_one() {
  local fname="$1" id="$2" size="$3"
  local out="$OUTDIR/$fname"
  local attempt=0 cur=0

  # 幂等：已完整则跳过
  if [ -f "$out" ]; then
    cur="$(file_size "$out")"
    if [ "$cur" -eq "$size" ] 2>/dev/null; then
      log "⏭️  SKIP $fname（已完整）"
      return 0
    elif [ "$cur" -gt "$size" ] 2>/dev/null; then
      log "⚠️  $fname 本地文件异常（$cur > $size），删除重下"
      rm -f "$out"; cur=0
    fi
  fi

  local t0
  t0="$(date +%s)"
  log "⬇️  $fname 下载中（已下 $cur / $size B）"
  while :; do
    attempt=$((attempt+1))
    curl -sS -L -C - \
      -H "Authorization: Bearer $TOKEN" \
      -H "Accept: application/octet-stream" \
      --connect-timeout 30 \
      --speed-limit "$SPEED_LIMIT" --speed-time "$SPEED_TIME" \
      -o "$out" \
      "https://api.github.com/repos/$REPO/releases/assets/$id"
    local rc=$?
    cur="$(file_size "$out")"

    if [ "$cur" -eq "$size" ] 2>/dev/null; then
      local sha t1
      t1="$(date +%s)"
      sha="$( (shasum -a 256 "$out" 2>/dev/null || sha256sum "$out" 2>/dev/null) | awk '{print $1}')"
      log "✅ OK   $fname  ${size} B  sha256=${sha}  用时 $((t1-t0))s"
      return 0
    fi

    if [ "$MAX_RETRIES" -gt 0 ] && [ "$attempt" -ge "$MAX_RETRIES" ]; then
      log "❌ FAIL $fname（重试 $attempt 次，已下 $cur/$size B，最后 rc=$rc）"
      return 1
    fi

    local delay=$((5 * (2 ** (attempt-1))))   # 5,10,20,40,80...
    [ "$delay" -gt 300 ] && delay=300
    delay=$((delay + RANDOM % 10))
    log "🔄 RETRY $fname（第 $attempt 次，rc=$rc，已下 $cur/$size B）${delay}s 后重试"
    sleep "$delay"
  done
}

log "==> 开始下载 ${#targets[@]} 个资产 → $OUTDIR/"
ok=0; fail=0
for t in "${targets[@]}"; do
  IFS='|' read -r fname id size <<< "$t"
  if download_one "$fname" "$id" "$size"; then
    ok=$((ok+1))
  else
    fail=$((fail+1))
  fi
done

log ""
log "========== 汇总 =========="
log "成功 $ok / ${#targets[@]}，失败 $fail"
log "目录: $OUTDIR"
log "日志: $LOG"
[ "$fail" -gt 0 ] && exit 1 || exit 0
