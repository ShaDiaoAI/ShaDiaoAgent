import {
  fetchCharacters, getCharacter, createCharacter, updateCharacter, deleteCharacter,
  fetchSkinCatalog, fetchMySkins, equipSkin,
  fetchInventory, equipItem, unequipItem,
  fetchWallet, fetchRewards,
  drawGacha, fetchGachaProgress, fetchCreationLimit,
  getCachedCharacters,
} from './django-client.js'
import type { ShadiaoCharacter, Skin, UserItem, WalletInfo, RewardLog, DrawOutput, GachaProgress, CreationLimit } from './django-client.js'
import { existsSync, mkdirSync, writeFileSync, readdirSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getConfigDir } from './config-paths'
import { rmSyncWithRetry } from './fs-retry'
import { readJsonFileSafe, writeJsonFileAtomic } from './safe-file'
import { skillCopyFilter, updateAgentWorkspace } from './agent-workspace-manager'

// Re-export types
export type { ShadiaoCharacter, Skin, UserItem, WalletInfo, RewardLog }

// ===== Character Workspace 初始化 =====

/**
 * 获取人物 workspace 根目录
 * ~/.shadiao-agent/agent-workspaces/char-{characterId}/
 */
function getCharacterWorkspacePath(characterId: number): string {
  const dir = join(getConfigDir(), 'agent-workspaces', `char-${characterId}`)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * 获取默认 Skills 模板目录路径
 * ~/.shadiao-agent/default-skills/
 */
function getDefaultSkillsDir(): string {
  const dir = join(getConfigDir(), 'default-skills')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * 复制默认 Skills 到人物 workspace
 */
function copyDefaultSkillsToCharacter(characterId: number, options: { throwOnError?: boolean } = {}): void {
  const defaultDir = getDefaultSkillsDir()
  const targetDir = join(getCharacterWorkspacePath(characterId), 'skills')

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true })
  }

  try {
    const entries = readdirSync(defaultDir, { withFileTypes: true })
    if (entries.length === 0) {
      console.warn(`[沙雕人物] 默认 Skills 模板为空，人物 ${characterId} Skills 未初始化`)
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const source = join(defaultDir, entry.name)
      const target = join(targetDir, entry.name)
      try {
        cpSync(source, target, { recursive: true, filter: skillCopyFilter })
      } catch (err) {
        console.warn(`[沙雕人物] 复制默认 Skill 失败 (char-${characterId}/${entry.name}):`, err)
        if (options.throwOnError) throw err
      }
    }
    console.log(`[沙雕人物] 已复制默认 Skills 到人物 ${characterId}`)
  } catch (err) {
    console.error(`[沙雕人物] 复制默认 Skills 失败 (char-${characterId}):`, err)
    if (options.throwOnError) throw err
  }
}

/**
 * 初始化人物 workspace 的 plugin manifest
 * ~/.shadiao-agent/agent-workspaces/char-{id}/.claude-plugin/plugin.json
 */
function ensureCharacterPluginManifest(characterId: number, characterName: string): void {
  const wsPath = getCharacterWorkspacePath(characterId)
  const pluginDir = join(wsPath, '.claude-plugin')
  const manifestPath = join(pluginDir, 'plugin.json')

  if (existsSync(manifestPath)) return

  if (!existsSync(pluginDir)) {
    mkdirSync(pluginDir, { recursive: true })
  }

  const manifest = {
    name: `shadiao-character-${characterId}`,
    version: '1.0.0',
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
  console.log(`[沙雕人物] 已创建 plugin manifest: char-${characterId}`)
}

/**
 * 初始化人物 workspace 的 MCP 配置文件（空模板）
 * ~/.shadiao-agent/agent-workspaces/char-{id}/mcp.json
 */
function ensureCharacterMcpConfig(characterId: number): void {
  const wsPath = getCharacterWorkspacePath(characterId)
  const mcpPath = join(wsPath, 'mcp.json')

  if (existsSync(mcpPath)) return

  const defaultConfig = {
    servers: {},
  }

  writeFileSync(mcpPath, JSON.stringify(defaultConfig, null, 2), 'utf-8')
  console.log(`[沙雕人物] 已初始化 MCP 配置: char-${characterId}`)
}

/**
 * 初始化人物 workspace 的 Auto Memory 目录
 * ~/.shadiao-agent/agent-workspaces/char-{id}/.claude/memory/
 */
function ensureCharacterAutoMemory(characterId: number): void {
  const wsPath = getCharacterWorkspacePath(characterId)
  const memoryDir = join(wsPath, '.claude', 'memory')

  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true })
  }

  // 创建空的 MEMORY.md 入口文件（如果不存在）
  const indexPath = join(memoryDir, 'MEMORY.md')
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, '', 'utf-8')
  }

  console.log(`[沙雕人物] 已初始化 Auto Memory: char-${characterId}`)
}

/**
 * 确保人物 workspace 在 agent-workspaces.json 中有注册条目
 *
 * 这是关键步骤：让 session-manager、orchestrator、prompt-builder
 * 能通过 workspaceId 查找到人物 workspace 目录、Skills、MCP、Memory。
 */
function ensureCharacterWorkspaceEntry(characterId: number, characterName: string): void {
  const indexPath = join(getConfigDir(), 'agent-workspaces.json')
  let index: { version: number; workspaces: Array<{ id: string; name: string; slug: string; createdAt: number; updatedAt: number }> }

  const data = readJsonFileSafe<{ version: number; workspaces: any[] }>(indexPath)
  if (data) {
    index = data
  } else {
    index = { version: 2, workspaces: [] }
  }

  const wsId = `char-${characterId}`
  const existing = index.workspaces.find((w) => w.id === wsId)
  if (!existing) {
    const now = Date.now()
    index.workspaces.unshift({
      id: wsId,
      name: characterName,
      slug: wsId,
      characterId,
      createdAt: now,
      updatedAt: now,
    })
    writeJsonFileAtomic(indexPath, index)
    console.log(`[沙雕人物] 已注册 workspace 条目: ${wsId}`)
  } else {
    // 🆕 回填：已有 workspace 可能缺少 characterId（旧版创建），或名称不一致
    let changed = false
    if (existing.characterId === undefined) {
      existing.characterId = characterId
      changed = true
    }
    if (existing.name !== characterName) {
      existing.name = characterName
      changed = true
    }
    if (changed) {
      writeJsonFileAtomic(indexPath, index)
      console.log(`[沙雕人物] 已回填 workspace 条目: ${wsId} (characterId=${characterId}, name=${characterName})`)
    }
  }
}

/**
 * 完整初始化人物 workspace —— 新建人物时调用
 *
 * 目录结构：
 *   ~/.shadiao-agent/agent-workspaces/char-{id}/
 *   ├── .claude-plugin/plugin.json   ← plugin manifest
 *   ├── .claude/memory/MEMORY.md     ← auto memory 目录 + 入口
 *   ├── skills/                      ← 默认 skills（从模板复制）
 *   ├── workspace-files/             ← 工作文件目录
 *   └── mcp.json                     ← MCP 配置模板
 */
function initCharacterWorkspace(characterId: number, characterName: string): void {
  // 0. 注册 workspace 条目（agent-workspaces.json），让 session-manager 可以找到
  ensureCharacterWorkspaceEntry(characterId, characterName)

  // 确保根目录存在
  const wsPath = getCharacterWorkspacePath(characterId)

  // 确保 workspace-files 子目录
  const filesDir = join(wsPath, 'workspace-files')
  if (!existsSync(filesDir)) {
    mkdirSync(filesDir, { recursive: true })
  }

  // 1. Plugin manifest
  ensureCharacterPluginManifest(characterId, characterName)

  // 2. 默认 Skills（从模板复制）
  copyDefaultSkillsToCharacter(characterId, { throwOnError: false })

  // 3. MCP 配置（空模板）
  ensureCharacterMcpConfig(characterId)

  // 4. Auto Memory 目录 + MEMORY.md
  ensureCharacterAutoMemory(characterId)

  console.log(`[沙雕人物] 人物 ${characterId} (${characterName}) workspace 初始化完成`)
}

/**
 * 清理人物 workspace 目录（删除人物时调用）
 */
function cleanupCharacterWorkspace(characterId: number): void {
  const wsPath = join(getConfigDir(), 'agent-workspaces', `char-${characterId}`)
  try {
    rmSyncWithRetry(wsPath, { recursive: true, force: true })
    console.log(`[沙雕人物] 已清理人物 ${characterId} workspace`)
  } catch (err) {
    console.warn(`[沙雕人物] 清理人物 ${characterId} workspace 失败:`, err)
  }
}

/**
 * 确保人物 workspace 存在（幂等）。
 * 如果目录已存在则跳过，否则补建。用于已有老人物懒初始化。
 */
function ensureCharacterWorkspace(characterId: number, characterName: string): void {
  const wsPath = join(getConfigDir(), 'agent-workspaces', `char-${characterId}`)
  // 检查 workspace 是否已初始化（以 mcp.json 存在为准）
  if (!existsSync(join(wsPath, 'mcp.json'))) {
    initCharacterWorkspace(characterId, characterName)
  }
}

// ===== Characters =====

export async function listCharacters(): Promise<ShadiaoCharacter[]> {
  const chars = await fetchCharacters()
  // 🆕 确保所有人物都有 workspace（懒初始化，已有则跳过）
  for (const char of chars) {
    try { ensureCharacterWorkspace(char.id, char.name) } catch {}
  }
  return chars
}

export async function getCharById(id: number): Promise<ShadiaoCharacter> {
  return getCharacter(id)
}

export async function createChar(data: {
  name: string; character_class_id?: number
  bound_model?: string; system_prompt?: string
}): Promise<ShadiaoCharacter> {
  const char = await createCharacter(data)
  // 🆕 创建人物后立即初始化 workspace
  try {
    initCharacterWorkspace(char.id, char.name)
  } catch (err) {
    console.error(`[沙雕人物] 初始化人物 ${char.id} workspace 失败:`, err)
    // 不阻塞人物创建流程，workspace 缺失后续按需补建
  }
  return char
}

export async function updateChar(id: number, data: {
  name?: string; bound_model?: string; system_prompt?: string
}): Promise<ShadiaoCharacter> {
  const updated = await updateCharacter(id, data)
  // 如果人物名称变更，同步更新 agent-workspaces.json 中的 workspace 名称
  if (data.name) {
    const wsId = `char-${id}`
    try {
      updateAgentWorkspace(wsId, { name: data.name })
    } catch (err) {
      // workspace 条目可能不存在（旧人物），不阻塞主流程
      console.warn(`[沙雕人物] 同步人物 ${id} workspace 名称失败:`, err)
    }
  }
  return updated
}

export async function deleteChar(id: number): Promise<void> {
  await deleteCharacter(id)
  // 🆕 删除人物后清理 workspace
  try {
    cleanupCharacterWorkspace(id)
  } catch (err) {
    console.warn(`[沙雕人物] 清理人物 ${id} workspace 失败:`, err)
  }
}

export function getCachedChars(): ShadiaoCharacter[] {
  return getCachedCharacters()
}

// ===== Skins =====

export async function listSkinCatalog(): Promise<Skin[]> {
  return fetchSkinCatalog()
}

export async function listMySkins(): Promise<Skin[]> {
  return fetchMySkins()
}

export async function equipCharSkin(characterId: number, skinId: number | string): Promise<void> {
  return equipSkin(characterId, skinId)
}

// ===== Items =====

export async function listInventory(): Promise<UserItem[]> {
  return fetchInventory()
}

export async function equipInvItem(inventoryId: number): Promise<void> {
  return equipItem(inventoryId)
}

export async function unequipInvItem(inventoryId: number): Promise<void> {
  return unequipItem(inventoryId)
}

// ===== Wallet & Rewards =====

export async function getWallet(): Promise<WalletInfo> {
  return fetchWallet()
}

export async function getRewards(): Promise<RewardLog[]> {
  return fetchRewards()
}

// ===== Gacha =====

export async function doGachaDraw(count: number): Promise<DrawOutput> {
  return drawGacha(count)
}

export async function getGachaProgress(): Promise<GachaProgress> {
  return fetchGachaProgress()
}

// ===== Creation Limit =====

export async function getCreationLimit(): Promise<CreationLimit> {
  return fetchCreationLimit()
}
