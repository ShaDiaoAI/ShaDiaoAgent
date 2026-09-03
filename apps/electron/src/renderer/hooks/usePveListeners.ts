/**
 * usePveListeners — 全局 PvE IPC 监听器
 *
 * 全局挂载、永不销毁（对齐 useGlobalAgentListeners）。负责：
 * 1. 订阅 pve:stream-event，驱动 pveBattleAtom 状态机
 *    （battle_start 初始化 / battle_line 追加台词 / battle_end 结算 / error 兜底）
 * 2. 应用启动 + 窗口聚焦时刷新 pveStatusAtom（对齐 walletAtom 刷新时机）
 * 3. battle_end 后刷新 pveStatus / wallet / 人物（含升级回写）
 *
 * overlay 手动关闭时战斗照常后台结算——本监听器始终在，battle_end 仍会到达并触发刷新。
 */

import * as React from 'react'
import { useStore } from 'jotai'
import { toast } from 'sonner'
import {
  pveBattleAtom,
  pveBattleOverlayOpenAtom,
  pveStatusAtom,
  mapPveStatus,
  type BattleLine,
  type PveBattleResult,
} from '@/atoms/pve-atoms'
import { walletAtom, selectedCharacterAtom, charactersAtom } from '@/atoms/character-atoms'
import { createLogger } from '@shadiao/shared'

const log = createLogger('PvEListeners')

function uuid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
}

interface PveStreamEventData {
  [key: string]: unknown
}

function handleBattleStart(store: ReturnType<typeof useStore>, d: PveStreamEventData): void {
  const monster = (d.monster ?? {}) as Record<string, unknown>
  const player = (d.player ?? {}) as Record<string, unknown>
  // 后端把怪物血量/五维放在 monster_state（monster 仅 name/level/description）；兼容平铺在 monster 的情况
  const monsterState = (d.monster_state ?? {}) as Record<string, unknown>

  store.set(pveBattleAtom, (prev) => ({
    ...prev,
    phase: 'running',
    battleId: typeof d.battle_id === 'number' ? d.battle_id : null,
    player: {
      name: String(player.name ?? ''),
      level: typeof player.level === 'number' ? player.level : 0,
      hp: typeof player.hp === 'number' ? player.hp : 0,
      maxHp: typeof player.max_hp === 'number' ? player.max_hp : 0,
      stats: (player.stats as Record<string, number>) ?? {},
    },
    monster: {
      name: String(monster.name ?? ''),
      level: typeof monster.level === 'number' ? monster.level : 0,
      description: typeof monster.description === 'string' ? monster.description : '',
      hp: typeof monsterState.hp === 'number' ? monsterState.hp : (typeof monster.hp === 'number' ? monster.hp : 0),
      maxHp: typeof monsterState.max_hp === 'number' ? monsterState.max_hp : (typeof monster.max_hp === 'number' ? monster.max_hp : 0),
      stats: ((monsterState.stats ?? monster.stats) as Record<string, number>) ?? {},
    },
    firstMover: d.first_mover === 'monster' ? 'monster' : 'player',
    maxRounds: typeof d.max_rounds === 'number' ? d.max_rounds : 5,
  }))
}

function handleBattleLine(store: ReturnType<typeof useStore>, d: PveStreamEventData): void {
  const line: BattleLine = {
    id: uuid(),
    lineType: String(d.line_type ?? ''),
    text: String(d.text ?? ''),
    actor: d.actor === 'monster' ? 'monster' : d.actor === 'player' ? 'player' : null,
    damage: typeof d.damage === 'number' ? d.damage : null,
    round: typeof d.round === 'number' ? d.round : 0,
    playerHp: typeof d.player_hp === 'number' ? d.player_hp : 0,
    playerMaxHp: typeof d.player_max_hp === 'number' ? d.player_max_hp : 0,
    monsterHp: typeof d.monster_hp === 'number' ? d.monster_hp : 0,
    monsterMaxHp: typeof d.monster_max_hp === 'number' ? d.monster_max_hp : 0,
    subType: typeof d.sub_type === 'string' ? d.sub_type : null,
    detail:
      d.detail && typeof d.detail === 'object' && !Array.isArray(d.detail)
        ? (d.detail as Record<string, unknown>)
        : null,
  }
  store.set(pveBattleAtom, (prev) => ({ ...prev, lines: [...prev.lines, line] }))
}

function handleBattleEnd(
  store: ReturnType<typeof useStore>,
  d: PveStreamEventData,
  refreshStatus: () => void,
  refreshWalletAndCharacter: () => void,
): void {
  const rewards = (d.rewards ?? {}) as Record<string, unknown>
  const levelUp = (d.level_up ?? null) as Record<string, unknown> | null

  const result: PveBattleResult = {
    result: String(d.result ?? ''),
    reason: typeof d.reason === 'string' ? d.reason : null,
    rounds: typeof d.rounds === 'number' ? d.rounds : 0,
    totalTokens: typeof d.total_tokens === 'number' ? d.total_tokens : 0,
    rewards: {
      coins: typeof rewards.coins === 'number' ? rewards.coins : 0,
      xp: typeof rewards.xp === 'number' ? rewards.xp : 0,
      multiplier: typeof rewards.multiplier === 'number' ? rewards.multiplier : 0,
      firstWin: rewards.first_win === true,
    },
    levelUp: levelUp
      ? {
          levelsGained: typeof levelUp.levels_gained === 'number' ? levelUp.levels_gained : 0,
          newLevel: typeof levelUp.new_level === 'number' ? levelUp.new_level : 0,
        }
      : null,
  }

  store.set(pveBattleAtom, (prev) => ({ ...prev, phase: 'ended', result }))

  // 刷新战绩 / 钱包 / 人物（升级回写）
  refreshStatus()
  refreshWalletAndCharacter()

  // overlay 打开时由结算面板展示，关闭面板时 toast；overlay 关闭（后台结算）时这里直接 toast
  if (!store.get(pveBattleOverlayOpenAtom)) {
    const isWin = result.result === 'victory' || result.result === 'blood_win'
    toast.success(`历练已结束：${isWin ? '胜利' : '败北'}，获得 ${result.rewards.coins} 沙雕币`)
  }
}

function handleBattleError(store: ReturnType<typeof useStore>, d: PveStreamEventData): void {
  log.warn('战斗流中断:', d)
  store.set(pveBattleAtom, (prev) => ({
    ...prev,
    phase: 'error',
    errorMessage: typeof d.message === 'string' ? d.message : '网络中断',
  }))
}

export function usePveListeners(): void {
  const store = useStore()

  const refreshStatus = React.useCallback(() => {
    window.electronAPI.pveGetStatus?.()
      .then((r: any) => {
        if (r?.success && r.data) store.set(pveStatusAtom, mapPveStatus(r.data))
      })
      .catch(() => {})
  }, [store])

  const refreshWalletAndCharacter = React.useCallback(() => {
    window.electronAPI.getWallet?.()
      .then((r: any) => { if (r?.success && r.data) store.set(walletAtom, r.data) })
      .catch(() => {})
    const selected = store.get(selectedCharacterAtom)
    if (selected) {
      window.electronAPI.getCharacter?.(selected.id)
        .then((r: any) => {
          if (r?.success && r.data) {
            store.set(selectedCharacterAtom, r.data)
            store.set(charactersAtom, (prev) => prev.map((c) => (c.id === r.data.id ? r.data : c)))
          }
        })
        .catch(() => {})
    }
  }, [store])

  // 应用启动 + 窗口聚焦刷新战绩（对齐 walletAtom 刷新时机）
  React.useEffect(() => {
    refreshStatus()
    const onFocus = (): void => refreshStatus()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshStatus])

  // SSE 事件订阅（状态机）
  React.useEffect(() => {
    const cleanup = window.electronAPI.onPveStreamEvent(({ event, data }) => {
      const raw = (data ?? {}) as PveStreamEventData
      // 后端把 payload 包在 { event, data } 里；解包一层（兼容未来直接平铺）
      const nested = raw.data
      const d = (nested && typeof nested === 'object' ? nested : raw) as PveStreamEventData
      log.info('收到 PvE 事件:', event, 'data=', JSON.stringify(data))
      switch (event) {
        case 'battle_start':
          handleBattleStart(store, d)
          break
        case 'battle_line':
          handleBattleLine(store, d)
          break
        case 'battle_end':
          handleBattleEnd(store, d, refreshStatus, refreshWalletAndCharacter)
          break
        case 'error':
          handleBattleError(store, d)
          break
        default:
          break
      }
    })
    return cleanup
  }, [store, refreshStatus, refreshWalletAndCharacter])
}
