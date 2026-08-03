/**
 * 角色动画资源管理（主进程）
 *
 * 与旧 rive-manager.ts 的区别：
 * - 不再需要下载/缓存（bundle 随客户端分发）
 * - 只维护 anim_asset_id → bundle 路径的映射表
 * - 提供 bundle 文件的存在性检查
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

// 资源根目录（构建时 resources/ 被复制到 dist/resources/）
function getResourcesDir(): string {
  // __dirname 在 esbuild bundle 后指向 dist/
  return join(__dirname, 'resources', 'characters')
}

/**
 * 已知的角色动画 bundle 注册表
 *
 * 添加新皮肤的步骤：
 * 1. 将 Adobe Animate 导出的 bundle.js 放到 resources/characters/{skin-name}/
 * 2. 在此注册表中新增条目，key 必须与 Django 皮肤表的 rive_asset_id 一致
 * 3. 重新构建客户端分发
 *
 * 注意：rendered 端的 CharacterAnim 组件通过 selectedChar.equipped_skin.rive_asset_id
 * 查找对应的 bundle 文件。如果 Django 返回的 rive_asset_id 不在注册表中，
 * 动画将 fallback 到 CSS 占位符。
 */
const BUNDLE_REGISTRY: Record<string, { name: string; bundle: string }> = {
  '乞丐虾仁': { name: '虾仁（默认）', bundle: '乞丐虾仁/乞丐虾仁.bundle.js' },
  '大魏太子虾仁': { name: '大魏太子虾仁', bundle: '大魏太子虾仁/大魏太子虾仁.bundle.js' },
  '大魏小卒虾仁': { name: '大魏小卒虾仁', bundle: '大魏小卒虾仁/大魏小卒虾仁.bundle.js' },
  '大魏山匪': { name: '大魏山匪', bundle: '大魏山匪/大魏山匪.bundle.js' },
  '大魏朝廷官员': { name: '大魏朝廷官员', bundle: '大魏朝廷官员/大魏朝廷官员.bundle.js' },
  '大魏朝廷钦犯': { name: '大魏朝廷钦犯', bundle: '大魏朝廷钦犯/大魏朝廷钦犯.bundle.js' },
  '大魏权臣嫡女': { name: '大魏权臣嫡女', bundle: '大魏权臣嫡女/大魏权臣嫡女.bundle.js' },
  '大魏百夫长': { name: '大魏百夫长', bundle: '大魏百夫长/大魏百夫长.bundle.js' },
  '大魏紫霞郡主': { name: '大魏紫霞郡主', bundle: '大魏紫霞郡主/大魏紫霞郡主.bundle.js' },
  '寻芳阁女子': { name: '寻芳阁女子', bundle: '寻芳阁女子/寻芳阁女子.bundle.js' },
  '村花小翠': { name: '村花小翠', bundle: '村花小翠/村花小翠.bundle.js' },
  '村草小刘': { name: '村草小刘', bundle: '村草小刘/村草小刘.bundle.js' },
  '村里红衣青年': { name: '村里红衣青年', bundle: '村里红衣青年/村里红衣青年.bundle.js' },
  '开盲盒': { name: '开盲盒', bundle: '开盲盒/开盲盒.bundle.js' },
}

export interface CharacterAnimAsset {
  assetId: string
  name: string
  bundlePath: string
  exists: boolean
}

/** 获取所有可用的动画资源 */
export function listAnimAssets(): CharacterAnimAsset[] {
  const baseDir = getResourcesDir()
  return Object.entries(BUNDLE_REGISTRY).map(([assetId, info]) => ({
    assetId,
    name: info.name,
    bundlePath: join(baseDir, info.bundle),
    exists: existsSync(join(baseDir, info.bundle)),
  }))
}

/** 检查某个 anim_asset_id 是否可用 */
export function isAnimAssetAvailable(assetId: string): boolean {
  const info = BUNDLE_REGISTRY[assetId]
  if (!info) return false
  return existsSync(join(getResourcesDir(), info.bundle))
}

/** 获取默认人物动画资源 ID */
export function getDefaultAnimAssetId(): string {
  return '乞丐虾仁'
}

/** 获取盲盒动画资源 ID */
export function getGachaAnimAssetId(): string {
  return '开盲盒'
}

/** 获取 createjs 运行时路径 */
export function getCreatejsRuntimePath(): string {
  return join(getResourcesDir(), 'createjs.min.js')
}
