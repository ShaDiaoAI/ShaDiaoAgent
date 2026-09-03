/**
 * PvE（历练）状态 atoms
 *
 * - pveStatusAtom：首胜状态 + 倍率 + 用户级终身战绩（应用启动 + 战斗结束 + 窗口聚焦刷新）
 * - skillAtom：用户级唯一技能（切换到 train tab 时惰性拉取）
 * - pveBattleAtom：战斗状态机（SSE 驱动）
 * - pveBattlesAtom：历史战绩列表
 * - pveBattleOverlayOpenAtom：战斗舞台 overlay 显隐
 */

import { atom } from 'jotai'

// ===== 类型（renderer 侧统一 camelCase） =====

/** 14.3 PVE 状态（首胜 + 倍率 + 战绩） */
export interface PveStatus {
  firstWinAvailable: boolean
  firstWinMultiplier: number
  winMultiplier: number
  loseMultiplier: number
  pveWins: number
  pveLosses: number
}

/** 14.5 技能（用户级唯一） */
export interface SkillInfo {
  name: string
  prompt: string
  updatedAt: string
}

/** 单条战斗台词（SSE battle_line 事件） */
export interface BattleLine {
  id: string
  lineType: string
  text: string
  /** 出手方；intro/defeat/victory/blood 等无出手方的台词为 null */
  actor: 'player' | 'monster' | null
  damage: number | null
  round: number
  playerHp: number
  playerMaxHp: number
  monsterHp: number
  monsterMaxHp: number
  /** system 台词子类型（charm / suppress / damage_calc）；非 system 行为 null */
  subType: string | null
  /** 结构化计算明细（后端 §16.4，原样 snake_case 透传） */
  detail: Record<string, unknown> | null
}

export type PveBattlePhase = 'idle' | 'running' | 'ended' | 'error'

/** 14.4 战斗结算（battle_end 事件 data） */
export interface PveBattleResult {
  result: string
  reason: string | null
  rounds: number
  totalTokens: number
  rewards: { coins: number; xp: number; multiplier: number; firstWin: boolean }
  levelUp: { levelsGained: number; newLevel: number } | null
}

export interface PveBattlePlayer {
  name: string
  level: number
  hp: number
  maxHp: number
  stats: Record<string, number>
}

export interface PveBattleMonster {
  name: string
  level: number
  description: string
  hp: number
  maxHp: number
  stats: Record<string, number>
}

export interface PveBattleState {
  phase: PveBattlePhase
  battleId: number | null
  player: PveBattlePlayer | null
  monster: PveBattleMonster | null
  firstMover: 'player' | 'monster' | null
  maxRounds: number
  lines: BattleLine[]
  result: PveBattleResult | null
  errorMessage: string | null
}

/** 14.4 历史战绩列表项 */
export interface PveBattleLogItem {
  id: number
  result: string
  rounds: number
  totalTokens: number
  coinsEarned: number
  xpEarned: number
  firstWin: boolean
  monsterName: string
  characterName: string
  createdAt: string
}

// ===== Atoms =====

export const pveStatusAtom = atom<PveStatus | null>(null)

export const skillAtom = atom<SkillInfo | null>(null)

export const pveBattleAtom = atom<PveBattleState>({
  phase: 'idle',
  battleId: null,
  player: null,
  monster: null,
  firstMover: null,
  maxRounds: 5,
  lines: [],
  result: null,
  errorMessage: null,
})

/** 战斗舞台 overlay 显隐（关闭 overlay 不取消战斗，后台继续结算） */
export const pveBattleOverlayOpenAtom = atom<boolean>(false)

export const pveBattlesAtom = atom<PveBattleLogItem[]>([])

/** 空战斗状态（发起前 / 关闭后复位用） */
export function emptyPveBattle(): PveBattleState {
  return {
    phase: 'idle',
    battleId: null,
    player: null,
    monster: null,
    firstMover: null,
    maxRounds: 5,
    lines: [],
    result: null,
    errorMessage: null,
  }
}

// ===== 工具：后端 snake_case → renderer camelCase =====

/** 后端 PveStatus(snake_case) → PveStatus(camelCase) */
export function mapPveStatus(raw: Record<string, unknown>): PveStatus {
  return {
    firstWinAvailable: raw.first_win_available === true,
    firstWinMultiplier: toNum(raw.first_win_multiplier, 20),
    winMultiplier: toNum(raw.win_multiplier, 10),
    loseMultiplier: toNum(raw.lose_multiplier, 5),
    pveWins: toNum(raw.pve_wins, 0),
    pveLosses: toNum(raw.pve_losses, 0),
  }
}

/** 后端 SkillInfo(snake_case) → SkillInfo(camelCase) */
export function mapSkill(raw: Record<string, unknown>): SkillInfo {
  return {
    name: typeof raw.name === 'string' ? raw.name : '无名招式',
    prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : '',
  }
}

/** 后端 PveBattleLogItem(snake_case) → PveBattleLogItem(camelCase) */
export function mapBattleLogItem(raw: Record<string, unknown>): PveBattleLogItem {
  return {
    id: toNum(raw.id, 0),
    result: String(raw.result ?? ''),
    rounds: toNum(raw.rounds, 0),
    totalTokens: toNum(raw.total_tokens, 0),
    coinsEarned: toNum(raw.coins_earned, 0),
    xpEarned: toNum(raw.xp_earned, 0),
    firstWin: raw.first_win === true,
    monsterName: String(raw.monster_name ?? ''),
    characterName: String(raw.character_name ?? ''),
    createdAt: String(raw.created_at ?? ''),
  }
}

function toNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

// ===== system 台词 detail 类型（后端 §16.4，字段原样 snake_case） =====
// detail 原样透传、渲染侧用 pickNum/pickBool 兜底读取（见 PveBattleOverlay.tsx），
// 此处接口用于记录字段形状与语义，不作为强制 cast 的依据。

export type SystemSubType = 'charm' | 'suppress' | 'damage_calc'

/** charm — 魅惑判定明细 */
export interface CharmDetail {
  u_mei: number        // 出手方魅力
  m_mei: number        // 受击方魅力
  z: number            // z = (m_mei - u_mei) / 10，>0 才可能被魅惑
  roll: number         // 本回合掷点
  threshold: number    // 魅惑概率阈值 = min(0.9, z)
  stunned: boolean     // 是否被魅惑跳过回合
}

/** suppress — 气运压制明细 */
export interface SuppressDetail {
  lead: number         // 气运落后点数（领先方视角）
  divisor: number      // luck_divisor（默认 10）
  guaranteed: number   // ⌊lead / divisor⌋ 必触发次数
  remainder: number    // lead % divisor
  roll: number         // 余数段概率掷点
  extra: number        // 余数段是否额外 +1（0 或 1）
  total: number        // 本回合总压制次数 = guaranteed + extra，武/魅/运 各扣此值
}

/** damage_calc — 伤害计算明细 */
export interface DamageCalcDetail {
  base: number             // 基础伤害：玩家 = 本回合技能请求 token 总数，怪物 = base_damage
  base_kind: 'token' | 'base_damage'
  x: number                // 武功乘数 = 1 + (u_wu - m_wu) / 10，保底 1
  u_wu: number             // 出手方武功
  m_wu: number             // 受击方武功
  y: number                // 气运暴击乘数（已含 +1 掷点结果）
  is_crit: boolean         // 是否暴击（摘要里加 ⚡）
  crit_d: number           // 气运差 d = (u_qi - m_qi) / 10
  crit_roll: number        // 暴击 +1 概率段掷点
  crit_threshold: number   // 暴击 +1 概率阈值（d 的小数部分）
  boost: number            // 魅力增伤比例（0 = 无加成，0.1 = +10%，实际乘数 = 1 + boost）
  reduction_roll: number   // 怪物减伤掷点（玩家恒 0）
  reduction: number        // 怪物减伤系数（玩家恒 1.0，实际伤害再 × reduction）
  damage: number           // 最终伤害
}
