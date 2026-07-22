import { atom } from 'jotai'

/**
 * Agent 状态类型 — 驱动 Rive 动画
 */
export type RiveAgentState = 'idle' | 'thinking' | 'tool_calling' | 'streaming' | 'error' | 'reward_drop'

export const riveAgentStateAtom = atom<RiveAgentState>('idle')

/**
 * 当前皮肤对应的 rive_asset_id
 */
export const riveAssetIdAtom = atom<string | null>(null)

/**
 * Rive 动画状态标签映射（调试用）
 */
export const RIVE_STATE_LABELS: Record<RiveAgentState, string> = {
  idle: '待机',
  thinking: '思考中',
  tool_calling: '使用工具',
  streaming: '回复中',
  reward_drop: '获得奖励!',
  error: '出错了',
}

/**
 * reward_drop 动画的持续时间（毫秒），到期后自动回到 idle
 */
export const REWARD_DROP_DURATION_MS = 2500
