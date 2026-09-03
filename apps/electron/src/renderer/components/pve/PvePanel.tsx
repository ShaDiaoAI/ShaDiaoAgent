/**
 * 历练 tab 主体 — 今日首胜 + PvE/PvP 双卡片 + 技能区 + 历史战绩（左右拆）
 *
 * - skillAtom 惰性拉取（切换到 train tab 时 skillGet()，已缓存则不重复）
 * - pveStatusAtom 由全局 PvE 监听器刷新（应用启动 / 战斗结束 / 窗口聚焦）
 * - 开始 PvE：校验 selected 人物 → pveStartBattle → 打开 PveBattleOverlay
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai'
import { toast } from 'sonner'
import { Coins, Shield } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { selectedCharacterAtom } from '@/atoms/character-atoms'
import {
  pveStatusAtom, skillAtom, pveBattleAtom, pveBattleOverlayOpenAtom, emptyPveBattle, mapSkill,
} from '@/atoms/pve-atoms'
import { PveSkillEditor } from './PveSkillEditor'
import { PveBattleCard } from './PveBattleCard'
import { PveHistoryList } from './PveHistoryList'

/** 今日首胜 ? 说明（每日首次 PvE 胜利奖励翻倍） */
function FirstWinHelpTooltip({ multiplier }: { multiplier: number }): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          className="inline-flex size-3.5 items-center justify-center rounded-full bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 text-[9px] font-bold leading-none cursor-help"
          aria-label="今日首胜说明"
        >
          ?
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px]">
        <p className="text-xs leading-relaxed">每日首次 PvE 胜利，奖励按 {multiplier}× 结算；每天 0 点重置。</p>
      </TooltipContent>
    </Tooltip>
  )
}

export function PvePanel(): React.ReactElement {
  const selected = useAtomValue(selectedCharacterAtom)
  const pveStatus = useAtomValue(pveStatusAtom)
  const [skill, setSkill] = useAtom(skillAtom)
  const setBattle = useSetAtom(pveBattleAtom)
  const setOverlayOpen = useSetAtom(pveBattleOverlayOpenAtom)
  const store = useStore()

  // 技能惰性拉取（只服务于历练 tab，已缓存则不重复）
  React.useEffect(() => {
    if (skill) return
    window.electronAPI.skillGet?.()
      .then((r: any) => {
        if (r?.success && r.data) setSkill(mapSkill(r.data))
      })
      .catch(() => {})
  }, [skill, setSkill])

  const startPve = async () => {
    if (!selected) {
      toast.error('请先选择人物')
      return
    }
    // 并发锁：已有进行中战斗直接 return
    if (store.get(pveBattleAtom).phase === 'running') {
      toast.error('已有进行中的历练')
      return
    }

    // 复位战斗状态并立即打开 overlay（显示"正在进入战斗…"），
    // 避免后端缓冲 SSE 时 await 卡住整场战斗、用户看不到任何反馈。
    setBattle({ ...emptyPveBattle(), phase: 'running' })
    setOverlayOpen(true)

    const r = await window.electronAPI.pveStartBattle(selected.id)
    if (!r?.success) {
      // 402 开场余额不足 / 409 并发 / 网络错误：关闭 overlay + toast 拒绝
      setBattle(emptyPveBattle())
      setOverlayOpen(false)
      toast.error(r?.error || '发起历练失败')
    }
  }

  return (
    <div className="space-y-5">
      {/* ① 今日首胜状态（置顶） */}
      {pveStatus && (
        <section className="flex items-center gap-2">
          <Coins className="size-4 text-amber-500" />
          <span className="text-xs text-muted-foreground">今日首胜</span>
          <FirstWinHelpTooltip multiplier={pveStatus.firstWinMultiplier} />
          {pveStatus.firstWinAvailable ? (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600">
              {pveStatus.firstWinMultiplier}×（未领取）
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              已领取
            </span>
          )}
        </section>
      )}

      {/* ② PvE / PvP 双卡片 */}
      <section>
        <PveBattleCard onStartPve={startPve} />
      </section>

      {/* ③ 技能区 */}
      <section className="rounded-xl border border-border bg-card p-4">
        <PveSkillEditor />
      </section>

      {/* ④ 历史战绩（左右拆：PvE 列表 + PvP 占位） */}
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <PveHistoryList />
        </div>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-4 text-center">
          <Shield className="size-5 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">PvP 历史战绩</p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">敬请期待</span>
        </div>
      </section>
    </div>
  )
}
