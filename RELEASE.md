# 发布流程（Release）

沙雕智能体（ShaDiaoAgent）安装包发布 + 应用内自动更新的完整 checklist。

## 架构

```
推 tag → GitHub Actions 打包
  ├─ macOS arm64 ──┐
  └─ Windows x64 ──┤→ 发布到 GitHub Releases（站内快）
                   │
本地 macOS x64 ────┤（本地打包）
                   │
        ┌──────────▼──────────┐
        │ 手工下载 + 手工传 COS │（国内快）
        └──────────┬──────────┘
                   ▼
            腾讯云 COS（公有读）
              ├─ downloads/mac-arm64/
              ├─ downloads/mac-x64/
              └─ downloads/windows/
                   │
        ┌──────────┴──────────┐
        ▼                      ▼
    网页下载按钮            应用内自动更新
    （shadiao-website）    （electron-updater 读 latest*.yml）
```

> CI 不直传 COS 的原因：GitHub runner 在境外、COS 在上海，跨境外网上传太慢（常规域名 1.5h+，全球加速也提速有限）。故 CI 只发到 GitHub Releases，本地手工传 COS。

## 前置条件（一次性）

- COS bucket `shadiaoai-1451923852`（ap-shanghai，公有读私有写）
- GitHub repo secrets：`COS_BUCKET`、`COS_REGION`、`MAC_CERTS` + `MAC_CERTS_PASSWORD`（macOS 签名）、`APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`（macOS 公证）
- 本地已装 coscli 并配置好（`coscli config init`，APPID=`1451923852`、Bucket=`shadiaoai`、Endpoint=`cos.ap-shanghai.myqcloud.com`）

## 发版步骤

### 1. 升版本号

编辑 `apps/electron/package.json` 的 `version`（如 `1.0.6` → `1.0.7`）。

### 2. 打 tag 触发 CI（macOS arm64 + Windows x64）

```bash
git add apps/electron/package.json
git commit -m "release: v1.0.7"
git push origin main
git tag v1.0.7
git push origin v1.0.7
```

CI 自动打包 macOS arm64 + Windows x64，上传到 GitHub Releases（`https://github.com/ShaDiaoAI/ShaDiaoAgent/releases`）。产物包括 dmg/zip/exe + blockmap + `latest*.yml`，外加 Windows 免安装便携版 `ShaDiaoAgent-{v}-x64-portable.zip`（给装不上 NSIS 的用户解压即用）。

### 3. 本地打包 + 上传 macOS x64 到 COS

```bash
apps/electron/scripts/release-cos-x64.sh
```

脚本自动读 package.json 版本号 → 设 update URL → `bun run dist:mac` → 上传 dmg/zip/blockmap/`latest-mac.yml` 到 `downloads/mac-x64/`。

### 4. 下载 arm64 + Windows，手工上传到 COS

从 GitHub Release 下载 arm64 和 win 的产物（dmg/zip/blockmap/`latest-mac.yml`、exe/blockmap/`latest.yml`、`*-portable.zip`）到一个目录，然后：

```bash
apps/electron/scripts/upload-cos-github.sh <下载目录> 1.0.7
```

上传到 `downloads/mac-arm64/` 和 `downloads/windows/`。

### 5. 更新官网下载按钮版本号

编辑 `shadiao-website/index.html`，把 3 处下载 URL 里的版本号改成新版本（搜旧版本号全局替换）。

### 6. 推送官网

```bash
cd workspace-files/shadiao-website
git add index.html
git commit -m "release: 更新下载链接到 v1.0.7"
git push
```

## 验证

- 浏览器打开下载 URL 能正常下载，例如：
  `https://shadiaoai-1451923852.cos.ap-shanghai.myqcloud.com/downloads/mac-arm64/ShaDiaoAgent-1.0.7-arm64.dmg`
- 应用内「关于 → 检查更新」能检测到新版本（需装一个旧版本实测）。

## 注意事项

- **版本号三处一致**：package.json version、git tag、官网 URL 里的版本号。
- **mac 自动更新实际下载的是 `.zip`**（不是 `.dmg`），所以 `.zip` 必须一起上传，漏了自动更新会失败。
- **blockmap** 是可选的差量更新文件，缺了自动回退全量下载；但脚本/CI 已自动带上，无需手动处理。
- **COS bucket 是公有读**，只放安装包，别放任何敏感文件。
- **老版本用户断档**：切到 COS 后，已装的旧版本（`app-update.yml` 指向 GitHub 私有仓库）不会自动更新，需手动下载一次新版本，之后自动更新才接上。
- **Windows 免安装便携版**：`ShaDiaoAgent-{v}-x64-portable.zip` 是解压即用的兜底包，用户解压后直接运行里面的 `沙雕智能体.exe`，不需要安装器。主要用于 NSIS 安装器被杀软拦截（未签名 Electron 应用的常见症状）时给用户一条绕过路径；它**不参与自动更新**（无 `latest.yml`），所以发给用户时记得提醒：装了便携版的用户以后要手动换新版本。
