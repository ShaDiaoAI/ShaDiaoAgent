/**
 * 战斗舞台 Overlay — SSE 驱动全屏模态（z-[99999]）
 *
 * 对阵区（2026-09-01 第二版）：
 * - 左右两张竖卡（玩家左 / 怪物右，固定 w-44）+ 中间 VS / 回合进度 / 先手
 * - 怪物无图，黑影 + 白问号 + 引号登场台词（图区内）
 * - 血条内嵌卡片，五维紧凑单行明示（静态入场快照）
 * - 出手高亮 + 受击特效（震动 + 闪红边 + 刀光 + 弹伤害）+ 压制反馈
 *
 * 节奏控制（第二版核心）：
 * - 「事件到达 ≠ UI 播放」：SSE 台词进 buffer，串行播放器逐条消费
 * - playedCount 播放指针；casting 打字后挂起等 LLM，血条/特效/结算全绑定播放进度
 * - 点击台词流立即完成当前打字（跳过打字动画，不跳等待）
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { X, Loader2, TrendingUp, Coins, RotateCw } from 'lucide-react'
import { STAT_DIMS, getStat } from '@shadiao/shared'
import { selectedCharacterAtom } from '@/atoms/character-atoms'
import {
  pveBattleAtom, pveBattleOverlayOpenAtom, emptyPveBattle,
  type BattleLine, type PveBattleResult,
} from '@/atoms/pve-atoms'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const OUTCOME_LINE_TYPES = new Set(['victory', 'defeat', 'blood_win', 'blood_lose'])

/**
 * 受击特效 keyframes（内联，避免污染全局 CSS）
 * shake-left/right：卡片震动（玩家向左歪、怪物向右歪，呼应攻击方向）
 * float-damage：伤害数字上浮淡出（弹一下即消失）
 * slash：刀光斜线扫过
 * breathe：怪物黑影问号的呼吸脉动
 */
const BATTLE_CSS = `
@keyframes pve-shake-left {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  15% { transform: translateX(-4px) rotate(-1.2deg); }
  30% { transform: translateX(3px) rotate(0.6deg); }
  45% { transform: translateX(-3px) rotate(-0.5deg); }
  60% { transform: translateX(2px) rotate(0.3deg); }
  75% { transform: translateX(-1px) rotate(-0.2deg); }
}
@keyframes pve-shake-right {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  15% { transform: translateX(4px) rotate(1.2deg); }
  30% { transform: translateX(-3px) rotate(-0.6deg); }
  45% { transform: translateX(3px) rotate(0.5deg); }
  60% { transform: translateX(-2px) rotate(-0.3deg); }
  75% { transform: translateX(1px) rotate(0.2deg); }
}
@keyframes pve-float-damage {
  0% { opacity: 0; transform: translateY(6px) scale(0.7); }
  18% { opacity: 1; transform: translateY(-6px) scale(1.15); }
  100% { opacity: 0; transform: translateY(-28px) scale(1); }
}
@keyframes pve-slash {
  0% { opacity: 0; transform: translateX(-60%) rotate(-24deg); }
  30% { opacity: 0.9; }
  100% { opacity: 0; transform: translateX(60%) rotate(-24deg); }
}
@keyframes pve-breathe {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 0.95; }
}
.pve-shake-left { animation: pve-shake-left 340ms ease-in-out; }
.pve-shake-right { animation: pve-shake-right 340ms ease-in-out; }
.pve-float-damage { animation: pve-float-damage 700ms ease-out forwards; }
.pve-slash { animation: pve-slash 500ms ease-in-out forwards; }
.pve-breathe { animation: pve-breathe 2.4s ease-in-out infinite; }
`

function HpBar({ current, max, accent }: { current: number; max: number; accent: 'player' | 'monster' }): React.ReactElement {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            accent === 'player'
              ? 'bg-gradient-to-r from-emerald-400 to-teal-400'
              : 'bg-gradient-to-r from-red-400 to-rose-400',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[9px] tabular-nums text-muted-foreground">{current}/{max}</span>
    </div>
  )
}

/** 单次受击信息（用于驱动震动 / 刀光 / 浮动伤害数字） */
interface CombatantHit {
  id: string
  damage: number
  crit: boolean
}

/** 五维 ? 兜底说明（hover 弹全称 + 作用） */
function StatHelpTooltip(): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          className="ml-auto inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 text-[9px] font-bold leading-none cursor-help"
          aria-label="五维属性说明"
        >
          ?
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px]">
        <div className="space-y-0.5">
          {STAT_DIMS.map((d) => (
            <div key={d.key} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{d.label}</span>
              <span className="text-muted-foreground/70">{d.desc}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * 战斗双方竖卡（玩家 / 怪物）
 *
 * - 图区 aspect-square：玩家铺皮肤图（fallback 🦐），怪物黑影 + 白问号 + 引号登场台词
 * - 信息栏：名字/Lv → 血条 → 五维单行（+ ? 兜底 + ↓被压制）
 * - 受击：震动（方向性）+ 闪红边 + 刀光 + 浮动伤害数字（key 重挂载触发，弹一下即消失）
 */
function BattleCombatantCard({
  side, name, level, hp, maxHp, stats, description, imageSrc, active, winner, hit, suppressed, highlightStats,
}: {
  side: 'player' | 'monster'
  name: string
  level: number | undefined
  hp: number
  maxHp: number
  stats: Record<string, number> | undefined
  description?: string
  imageSrc?: string | null
  active: boolean
  winner?: boolean
  hit: CombatantHit | null
  suppressed: boolean
  highlightStats?: string[]
}): React.ReactElement {
  const [imgFailed, setImgFailed] = React.useState(false)
  const [shaking, setShaking] = React.useState(false)
  const isMonster = side === 'monster'
  const highlighted = active || winner

  // 每次受击（hit.id 变化）触发一次震动，360ms 后复位
  React.useEffect(() => {
    if (!hit) return
    setShaking(true)
    const t = setTimeout(() => setShaking(false), 360)
    return () => clearTimeout(t)
  }, [hit?.id])

  return (
    <div
      className={cn(
        'relative flex w-full max-w-[280px] justify-self-center flex-col rounded-xl border-2 bg-card overflow-hidden transition-all duration-200',
        'border-border/60',
        highlighted && (isMonster
          ? 'ring-4 ring-red-500/60 shadow-[0_0_24px_3px_rgba(239,68,68,0.35)]'
          : 'ring-4 ring-emerald-500/60 shadow-[0_0_24px_3px_rgba(16,185,129,0.35)]'),
        shaking && (isMonster ? 'pve-shake-right' : 'pve-shake-left'),
        shaking && (hit?.crit ? 'ring-4 ring-red-500/70' : 'ring-2 ring-red-500/50'),
      )}
    >
      {highlighted && (
        <div className={cn(
          'pointer-events-none absolute top-1.5 left-1/2 z-10 -translate-x-1/2 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white shadow animate-pulse',
          isMonster ? 'bg-red-500' : 'bg-emerald-500',
        )}>
          {winner ? '🏆 胜利' : '⚡ 行动中'}
        </div>
      )}
      {/* 图区 */}
      <div className="relative aspect-square bg-muted/30 flex items-center justify-center overflow-hidden">
        {isMonster ? (
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-800 to-zinc-950 flex flex-col items-center justify-center gap-2 px-3">
            <span className="pve-breathe text-5xl font-black text-white/80 select-none">?</span>
            {description && (
              <p className="text-center text-[10px] italic leading-snug text-white/50 line-clamp-2">“{description}”</p>
            )}
          </div>
        ) : imageSrc && !imgFailed ? (
          <img
            src={imageSrc}
            alt={name}
            className="absolute inset-0 h-full w-full object-cover object-top"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="text-5xl select-none">🦐</span>
        )}

        {/* 刀光 slash（受击时，key 重挂载播一次） */}
        {hit && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
            <div
              key={hit.id}
              className="pve-slash h-[170%] w-[60%] bg-gradient-to-r from-transparent via-white/80 to-transparent"
            />
          </div>
        )}

        {/* 浮动伤害数字（弹一下即消失） */}
        {hit && (
          <div className="pointer-events-none absolute inset-x-0 top-8 flex justify-center">
            <div
              key={hit.id}
              className={cn(
                'pve-float-damage font-black tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]',
                hit.crit ? 'text-2xl text-amber-400' : 'text-xl text-red-500',
              )}
            >
              -{hit.damage}
              {hit.crit && <span className="ml-1 text-xs font-bold">暴击!</span>}
            </div>
          </div>
        )}
      </div>

      {/* 信息栏 */}
      <div className="flex flex-col gap-1 px-2.5 py-2 border-t border-border/60">
        <div className="flex items-baseline gap-1 min-w-0">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">Lv.{level ?? '?'}</span>
        </div>
        <HpBar current={hp} max={maxHp} accent={side} />
        <div className="flex items-center gap-1">
          <span className={cn('text-[9px] tabular-nums', suppressed ? 'text-red-500' : 'text-muted-foreground/70')}>
            {STAT_DIMS.map((d, i) => {
              const hl = highlightStats?.includes(d.key)
              return (
                <span key={d.key}>
                  {i > 0 && <span className="text-muted-foreground/40"> · </span>}
                  <span className={cn(hl && 'font-semibold text-amber-400')}>
                    {d.short}
                    {getStat(stats, d.key)}
                  </span>
                </span>
              )
            })}
          </span>
          {suppressed && <span className="shrink-0 text-[9px] font-medium text-red-500">↓被压制</span>}
          <StatHelpTooltip />
        </div>
      </div>
    </div>
  )
}

/** 中间 VS 标识 + 回合进度 + 先手箭头 */
function VsBadge({
  firstMover, round, maxRounds,
}: {
  firstMover: 'player' | 'monster' | null
  round: number
  maxRounds: number
}): React.ReactElement {
  return (
    <div className="flex w-20 shrink-0 flex-col items-center gap-1 px-1">
      <span className="select-none text-4xl font-black italic text-muted-foreground/60">VS</span>
      {round > 0 && (
        <span className="text-[10px] tabular-nums text-muted-foreground">第 {round} / {maxRounds} 回合</span>
      )}
      {firstMover && (
        <span className="text-[10px] text-muted-foreground" title="先手方">
          {firstMover === 'player' ? '←' : '→'} 先手
        </span>
      )}
    </div>
  )
}

/** 单条台词打字机（受控：active 逐字播放，非 active 完整显示） */
function TypewriterLine({
  line, active, onDone,
}: {
  line: BattleLine
  active: boolean
  onDone: () => void
}): React.ReactElement {
  const [shown, setShown] = React.useState(0)
  const total = line.text.length
  const onDoneRef = React.useRef(onDone)
  onDoneRef.current = onDone

  // active 时逐字；非 active 完整显示
  React.useEffect(() => {
    if (!active) {
      setShown(total)
      return
    }
    if (total === 0) {
      setShown(0)
      onDoneRef.current()
      return
    }
    setShown(0)
    const timer = setInterval(() => setShown((s) => Math.min(s + 1, total)), 50)
    return () => clearInterval(timer)
  }, [active, line.id, total])

  // 打字完成 → onDone（推进由父组件决定）
  React.useEffect(() => {
    if (active && total > 0 && shown >= total) {
      onDoneRef.current()
    }
  }, [active, shown, total])

  const isCasting = line.lineType === 'casting'
  const isOutcome = OUTCOME_LINE_TYPES.has(line.lineType)
  const isWin = line.lineType === 'victory' || line.lineType === 'blood_win'
  const display = active ? line.text.slice(0, shown) : line.text
  const typing = active && shown < total

  return (
    <div className={cn('flex items-start gap-2 rounded-lg px-3 py-1.5 text-sm leading-relaxed', isOutcome && 'bg-muted/40')}>
      {line.actor != null && (
        <span className={cn(
          'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
          line.actor === 'player' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-red-500/15 text-red-600',
        )}>
          {line.actor === 'player' ? '你' : '怪'}
        </span>
      )}
      <span className={cn(
        'min-w-0 break-words',
        isOutcome && (isWin ? 'font-semibold text-emerald-600' : 'font-semibold text-red-500'),
      )}>
        <span className={isCasting ? 'text-muted-foreground' : undefined}>{display}</span>
        {typing && <span className="text-muted-foreground">▌</span>}
        {!isCasting && line.damage != null && (
          <span className="ml-1.5 rounded bg-red-500/10 px-1 text-[11px] font-semibold text-red-500 tabular-nums">
            -{line.damage}
          </span>
        )}
      </span>
    </div>
  )
}

/** system 台词（计算明细）兜底取数：detail 原样透传，字段可能缺失/类型漂移 */
function pickNum(d: Record<string, unknown>, k: string, fb = 0): number {
  const v = d[k]
  return typeof v === 'number' && Number.isFinite(v) ? v : fb
}
function pickBool(d: Record<string, unknown>, k: string): boolean {
  return d[k] === true
}
function fmt2(x: number): string {
  return x.toFixed(2)
}

/** 摘要行里的一个「数值(属性)」因子 */
function CalcFactor({ value, label, accent }: { value: string; label: string; accent?: boolean }): React.ReactElement {
  return (
    <span className={cn(accent && 'font-semibold text-amber-500')}>
      <span className="tabular-nums">{value}</span>
      <span className="text-muted-foreground/70">({label})</span>
    </span>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground/70">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

/** system 行折叠摘要（核心教学：伤害 = 基础 × 武功 × 气运 × 魅力） */
function renderSystemSummary(subType: string | null, d: Record<string, unknown>, actor: 'player' | 'monster' | null): React.ReactElement | null {
  if (subType === 'damage_calc') {
    const isToken = d.base_kind !== 'base_damage'
    const isCrit = pickBool(d, 'is_crit')
    const reductionRoll = pickNum(d, 'reduction_roll')
    return (
      <>
        <span className="font-medium">伤害 {pickNum(d, 'damage')}</span>
        <span className="text-muted-foreground/70"> = </span>
        <CalcFactor value={String(pickNum(d, 'base'))} label={isToken ? '文治' : '基础'} />
        <span className="text-muted-foreground/70"> × </span>
        <CalcFactor value={fmt2(pickNum(d, 'x'))} label="武功" />
        <span className="text-muted-foreground/70"> × </span>
        <CalcFactor value={fmt2(pickNum(d, 'y'))} label="气运" accent={isCrit} />
        {isCrit && <span className="font-semibold text-amber-500">⚡</span>}
        <span className="text-muted-foreground/70"> × </span>
        <CalcFactor value={fmt2(1 + pickNum(d, 'boost'))} label="魅力" />
        {reductionRoll > 0 && (
          <>
            <span className="text-muted-foreground/70"> × </span>
            <CalcFactor value={fmt2(pickNum(d, 'reduction', 1))} label="减伤" />
          </>
        )}
      </>
    )
  }
  if (subType === 'charm') {
    const stunned = pickBool(d, 'stunned')
    const me = actor === 'monster' ? '怪魅' : '你魅'
    const opp = actor === 'monster' ? '你魅' : '怪魅'
    return (
      <>
        魅惑：{me} {pickNum(d, 'u_mei')} &lt; {opp} {pickNum(d, 'm_mei')}，概率 {Math.round(pickNum(d, 'threshold') * 100)}% →{' '}
        {stunned ? <span className="font-medium text-red-500">被魅惑跳过</span> : '抵抗'}
      </>
    )
  }
  if (subType === 'suppress') {
    const me = actor === 'monster' ? '怪' : '你'
    const opp = actor === 'monster' ? '你' : '怪'
    return (
      <>
        气运压制：{opp}气运领先 {pickNum(d, 'lead')} → {me}{' '}
        <span className="text-red-500">武/魅/运 各 -{pickNum(d, 'total')}</span>
      </>
    )
  }
  return null
}

/** system 行展开拆解（完整字段） */
function renderSystemDetail(subType: string | null, d: Record<string, unknown>): React.ReactElement[] | null {
  if (subType === 'damage_calc') {
    const isToken = d.base_kind !== 'base_damage'
    const isCrit = pickBool(d, 'is_crit')
    const rows = [
      <DetailRow key="base" label="基础伤害" value={`${pickNum(d, 'base')}（${isToken ? '文治·技能 token' : '怪物 base_damage'}）`} />,
      <DetailRow key="x" label="武功乘数" value={`1 + (${pickNum(d, 'u_wu')} - ${pickNum(d, 'm_wu')})/10 = ${fmt2(pickNum(d, 'x'))}`} />,
      <DetailRow key="y" label={`气运暴击${isCrit ? ' ⚡' : ''}`} value={`y = ${fmt2(pickNum(d, 'y'))}（d=${fmt2(pickNum(d, 'crit_d'))}，掷 ${fmt2(pickNum(d, 'crit_roll'))} vs ${fmt2(pickNum(d, 'crit_threshold'))}）`} />,
      <DetailRow key="boost" label="魅力增伤" value={`+${Math.round(pickNum(d, 'boost') * 100)}%（× ${fmt2(1 + pickNum(d, 'boost'))}）`} />,
    ]
    if (pickNum(d, 'reduction_roll') > 0) {
      rows.push(<DetailRow key="reduction" label="怪物减伤" value={`roll ${pickNum(d, 'reduction_roll')} → × ${fmt2(pickNum(d, 'reduction', 1))}`} />)
    }
    rows.push(<DetailRow key="damage" label="最终伤害" value={pickNum(d, 'damage')} />)
    return rows
  }
  if (subType === 'charm') {
    return [
      <DetailRow key="mei" label="魅力对比" value={`我方 ${pickNum(d, 'u_mei')} vs 对方 ${pickNum(d, 'm_mei')}`} />,
      <DetailRow key="z" label="z" value={`(${pickNum(d, 'm_mei')} - ${pickNum(d, 'u_mei')})/10 = ${fmt2(pickNum(d, 'z'))}`} />,
      <DetailRow key="roll" label="判定" value={`掷 ${fmt2(pickNum(d, 'roll'))} vs 阈值 ${fmt2(pickNum(d, 'threshold'))}`} />,
      <DetailRow key="result" label="结果" value={pickBool(d, 'stunned') ? '被魅惑，跳过回合' : '抵抗，正常出手'} />,
    ]
  }
  if (subType === 'suppress') {
    return [
      <DetailRow key="lead" label="气运落后" value={`${pickNum(d, 'lead')} 点`} />,
      <DetailRow key="guaranteed" label="必触发" value={`${pickNum(d, 'guaranteed')} 次（lead ${pickNum(d, 'lead')} / divisor ${pickNum(d, 'divisor')}）`} />,
      <DetailRow key="extra" label="额外触发" value={`余数 ${pickNum(d, 'remainder')}，掷 ${fmt2(pickNum(d, 'roll'))} → +${pickNum(d, 'extra')}`} />,
      <DetailRow key="total" label="合计" value={`${pickNum(d, 'total')} 次：武/魅/运 各 -${pickNum(d, 'total')}`} />,
    ]
  }
  return null
}

/** 五维联动：system 行播放时返回某张卡要高亮的属性 key */
function systemHighlight(line: BattleLine | null, side: 'player' | 'monster'): string[] {
  if (!line || line.lineType !== 'system') return []
  const d = line.detail ?? {}
  switch (line.subType) {
    case 'damage_calc':
      if (line.actor !== side) return []
      return d.base_kind !== 'base_damage' ? ['wu_gong', 'qi_yun', 'mei_li', 'wen_zhi'] : ['wu_gong', 'qi_yun', 'mei_li']
    case 'charm':
      return ['mei_li']
    case 'suppress':
      return ['qi_yun']
    default:
      return []
  }
}

/** system 台词行：不逐字打，折叠摘要 + 展开拆解，点击展开（stopPropagation 与「跳过」隔离） */
function SystemLine({
  line, active, onDone, expanded, onToggle,
}: {
  line: BattleLine
  active: boolean
  onDone: () => void
  expanded: boolean
  onToggle: () => void
}): React.ReactElement {
  const onDoneRef = React.useRef(onDone)
  onDoneRef.current = onDone
  // system 行不逐字打：active 即视为完成（推进由父组件 500ms 短停控制）
  React.useEffect(() => {
    if (active) onDoneRef.current()
  }, [active])

  const detail = line.detail
  if (!detail) {
    // detail 缺失：兜底渲染后端 text
    return (
      <div className="flex items-start gap-1.5 px-3 py-0.5 pl-6 text-xs leading-relaxed text-muted-foreground">
        <span className="mt-0.5 shrink-0 opacity-70">📊</span>
        <span className="min-w-0 break-words">{line.text}</span>
      </div>
    )
  }

  const summary = renderSystemSummary(line.subType, detail, line.actor)
  if (summary == null) {
    // 未知 subType：兜底渲染后端 text
    return (
      <div className="flex items-start gap-1.5 px-3 py-0.5 pl-6 text-xs leading-relaxed text-muted-foreground">
        <span className="mt-0.5 shrink-0 opacity-70">📊</span>
        <span className="min-w-0 break-words">{line.text}</span>
      </div>
    )
  }

  const detailRows = expanded ? renderSystemDetail(line.subType, detail) : null
  const icon = line.subType === 'charm' ? '🎯' : line.subType === 'suppress' ? '⛓' : '📊'

  return (
    <div className="px-3 py-0.5 pl-6 text-xs leading-relaxed text-muted-foreground">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        className="flex items-start gap-1.5 text-left"
      >
        <span className="mt-0.5 shrink-0 opacity-70">{icon}</span>
        <span className="min-w-0 break-words">
          {summary}
          <span className={cn('ml-1 inline-block text-muted-foreground/60 transition-transform', expanded && 'rotate-180')}>▾</span>
        </span>
      </button>
      {detailRows && <div className="mt-1 space-y-0.5 pl-5 text-[11px]">{detailRows}</div>}
    </div>
  )
}

/** 流末战果卡片（battle_end 后延迟出场，分阶段揭晓） */
function BattleResultCard({
  result, onRematch, onClose, rematching,
}: {
  result: PveBattleResult
  onRematch: () => void
  onClose: () => void
  rematching: boolean
}): React.ReactElement {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    const t = setTimeout(() => setMounted(true), 400)
    return () => clearTimeout(t)
  }, [])

  const isWin = result.result === 'victory' || result.result === 'blood_win'
  const isQuota = result.result === 'insufficient_quota'

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 overflow-hidden">
      {/* 结果标题（大字弹入，带回弹） */}
      <div
        className={cn(
          'flex items-center justify-between transition-all duration-500',
          mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-50',
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      >
        <span className={cn('text-2xl font-black', isWin ? 'text-emerald-500' : 'text-red-500')}>
          {isQuota ? '余额不足' : isWin ? '胜利' : '败北'}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{result.rounds} 回合</span>
      </div>
      {isQuota && (
        <p className={cn('text-xs text-muted-foreground transition-all duration-500', mounted ? 'opacity-100' : 'opacity-0')}>
          本场已消耗的 token 已按失败结算
        </p>
      )}

      {/* 奖励（延迟淡入上移） */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 text-sm transition-all duration-500',
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
        )}
        style={{ transitionDelay: mounted ? '160ms' : '0ms' }}
      >
        <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-amber-600 tabular-nums">
          <Coins className="size-3.5" /> +{result.rewards.coins}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-blue-400/15 px-2 py-0.5 text-blue-600 tabular-nums">
          <TrendingUp className="size-3.5" /> +{result.rewards.xp}
        </span>
        {result.rewards.firstWin && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-600">
            首胜 {result.rewards.multiplier}×
          </span>
        )}
        {result.levelUp && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
            🎉 升级 Lv.{result.levelUp.newLevel}
          </span>
        )}
      </div>

      {/* 操作（最后浮现） */}
      <div
        className={cn('flex gap-2 transition-all duration-500', mounted ? 'opacity-100' : 'opacity-0')}
        style={{ transitionDelay: mounted ? '320ms' : '0ms' }}
      >
        <button
          type="button"
          onClick={onRematch}
          disabled={rematching}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {rematching ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
          再来一场
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          关闭
        </button>
      </div>
    </div>
  )
}

export function PveBattleOverlay(): React.ReactElement | null {
  const open = useAtomValue(pveBattleOverlayOpenAtom)
  const battle = useAtomValue(pveBattleAtom)
  const setOverlayOpen = useSetAtom(pveBattleOverlayOpenAtom)
  const setBattle = useSetAtom(pveBattleAtom)
  const selectedChar = useAtomValue(selectedCharacterAtom)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [rematching, setRematching] = React.useState(false)

  // ===== 串行播放器状态 =====
  const lines = battle.lines
  const [playedCount, setPlayedCount] = React.useState(0)
  const [activeTyped, setActiveTyped] = React.useState(false) // 当前 activeLine 是否已打完字
  const [expandedLineId, setExpandedLineId] = React.useState<string | null>(null) // 手动展开的 system 行（默认全部折叠）
  const [resultRevealed, setResultRevealed] = React.useState(false) // 结算揭示（allPlayed 后延迟 400ms，与结算卡片淡入同步）
  const activeLine = playedCount < lines.length ? lines[playedCount] : null

  // battleId 变化（新战斗）时重置播放器
  React.useEffect(() => {
    setPlayedCount(0)
    setActiveTyped(false)
    setExpandedLineId(null)
  }, [battle.battleId])

  // 推进：播下一条（同批次重置 activeTyped，根除连跳竞态）
  const advance = React.useCallback(() => {
    setPlayedCount((c) => c + 1)
    setActiveTyped(false)
  }, [])

  // 打字完成回调（TypewriterLine → 父组件）
  const handleLineDone = React.useCallback(() => setActiveTyped(true), [])

  // 推进逻辑：打字完成且可推进 → 停 300ms 再播下一条；casting 挂起等后续
  React.useEffect(() => {
    if (!activeLine || !activeTyped) return
    if (activeLine.lineType === 'casting' && lines.length <= playedCount + 1) return
    const t = setTimeout(advance, activeLine.lineType === 'system' ? 500 : 300)
    return () => clearTimeout(t)
  }, [activeLine, activeTyped, lines.length, playedCount, advance])

  // 自动滚底：跟随播放进度（非到达进度）
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [playedCount, battle.phase])

  // 结算揭示：allPlayed 后延迟 400ms，与 BattleResultCard 内部 400ms 淡入同步（赢方高亮不早于结算卡片）
  React.useEffect(() => {
    const allPlayed = playedCount >= lines.length
    if (!allPlayed) {
      setResultRevealed(false)
      return
    }
    const t = setTimeout(() => setResultRevealed(true), 400)
    return () => clearTimeout(t)
  }, [playedCount, lines.length])

  // 跳过打字（不跳等待）：立即推进当前台词
  const handleSkip = (): void => {
    if (!activeLine) return
    if (activeLine.lineType === 'casting' && lines.length <= playedCount + 1) return
    advance()
  }

  if (!open) return null

  const close = () => {
    if (battle.phase === 'ended' && battle.result) {
      const isWin = battle.result.result === 'victory' || battle.result.result === 'blood_win'
      toast.success(`${isWin ? '胜利' : '败北'}！获得 ${battle.result.rewards.coins} 沙雕币`)
      setBattle(emptyPveBattle())
    } else if (battle.phase === 'error') {
      setBattle(emptyPveBattle())
    }
    setOverlayOpen(false)
  }

  const rematch = async () => {
    if (!selectedChar) {
      toast.error('请先选择人物')
      return
    }
    setRematching(true)
    setBattle({ ...emptyPveBattle(), phase: 'running' })
    try {
      const r = await window.electronAPI.pveStartBattle(selectedChar.id)
      if (!r?.success) {
        setBattle(emptyPveBattle())
        setOverlayOpen(false)
        toast.error(r?.error || '发起历练失败')
      }
    } finally {
      setRematching(false)
    }
  }

  // 血条只认 flavor 命中行（damage/crit）；system 行不驱动血条（后端可能不下发 hp，避免归零）
  const lastHitLine = [...lines.slice(0, playedCount + 1)].reverse().find(
    (l) => l.lineType !== 'system' && l.damage != null,
  )
  const playerHp = lastHitLine ? lastHitLine.playerHp : (battle.player?.hp ?? 0)
  const playerMaxHp = lastHitLine ? lastHitLine.playerMaxHp : (battle.player?.maxHp ?? 0)
  const monsterHp = lastHitLine ? lastHitLine.monsterHp : (battle.monster?.hp ?? 0)
  const monsterMaxHp = lastHitLine ? lastHitLine.monsterMaxHp : (battle.monster?.maxHp ?? 0)

  // 动态视觉全部绑定 activeLine（播放进度）
  const activeSide = activeLine?.actor ?? null
  // 战斗结束（ended）时，赢方卡片保持高亮（绿=玩家/红=怪物身份色）；与结算卡片同步揭示（resultRevealed）
  const winnerSide: 'player' | 'monster' | null =
    resultRevealed && battle.result
      ? (battle.result.result === 'victory' || battle.result.result === 'blood_win' ? 'player' : 'monster')
      : null
  const suppressedSide =
    activeLine?.lineType === 'suppressed' ||
    (activeLine?.lineType === 'system' && activeLine.subType === 'suppress')
      ? activeLine.actor
      : null
  // 受击特效只认 flavor 的 damage/crit（system 的 damage_calc 不重复触发）
  const hitInfo: (CombatantHit & { side: 'player' | 'monster' }) | null =
    activeLine && (activeLine.lineType === 'damage' || activeLine.lineType === 'crit') && activeLine.damage != null
      ? {
          id: activeLine.id,
          damage: activeLine.damage,
          crit: activeLine.lineType === 'crit',
          side: activeLine.actor === 'player' ? 'monster' : 'player',
        }
      : null

  const playerAssetId = selectedChar?.equipped_skin?.rive_asset_id
  const playerImgSrc = playerAssetId ? `./characters/${playerAssetId}/preview.png` : null
  const allPlayed = playedCount >= lines.length

  return (
    <TooltipProvider delayDuration={120}>
      <div className="fixed inset-0 z-[99999] flex flex-col bg-background/95 backdrop-blur-sm">
      <style>{BATTLE_CSS}</style>

      {/* 顶栏：仅关闭按钮 */}
      <div className="flex items-center justify-end px-6 py-4">
        <button
          type="button"
          onClick={close}
          className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          aria-label="关闭"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* 主体 */}
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-hidden px-6 pt-2 pb-8">
        {battle.phase === 'error' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="text-4xl">⚠️</div>
            <div className="text-base font-medium">网络意外中断，本次历练已结束</div>
            <div className="text-sm text-muted-foreground">
              战斗已在服务端完成结算，可到「历史战绩」查看结果。
            </div>
            <button
              type="button"
              onClick={close}
              className="mt-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              关闭
            </button>
          </div>
        ) : (
          <>
            {/* 对阵区：左玩家卡 | VS/回合/先手 | 右怪物卡 */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              <BattleCombatantCard
                side="player"
                name={battle.player?.name ?? '？？？'}
                level={battle.player?.level}
                hp={playerHp}
                maxHp={playerMaxHp}
                stats={battle.player?.stats}
                imageSrc={playerImgSrc}
                active={activeSide === 'player'}
                winner={winnerSide === 'player'}
                hit={hitInfo?.side === 'player' ? hitInfo : null}
                suppressed={suppressedSide === 'player'}
                highlightStats={systemHighlight(activeLine, 'player')}
              />
              <VsBadge
                firstMover={battle.firstMover}
                round={activeLine?.round ?? 0}
                maxRounds={battle.maxRounds}
              />
              <BattleCombatantCard
                side="monster"
                name={battle.monster?.name ?? '？？？'}
                level={battle.monster?.level}
                hp={monsterHp}
                maxHp={monsterMaxHp}
                stats={battle.monster?.stats}
                description={battle.monster?.description}
                active={activeSide === 'monster'}
                winner={winnerSide === 'monster'}
                hit={hitInfo?.side === 'monster' ? hitInfo : null}
                suppressed={suppressedSide === 'monster'}
                highlightStats={systemHighlight(activeLine, 'monster')}
              />
            </div>

            {/* 台词流（主体，点击跳过当前打字） */}
            <div
              ref={scrollRef}
              onClick={handleSkip}
              className="flex-1 cursor-pointer overflow-y-auto rounded-xl border border-border/60 bg-card/50 p-2"
            >
              {!battle.player && !battle.monster && lines.length === 0 ? (
                <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  正在进入战斗…
                </div>
              ) : (
                <div className="space-y-0.5">
                  {lines.slice(0, playedCount + 1).map((line, i) => {
                    const isActive = i === playedCount
                    return line.lineType === 'system' ? (
                      <SystemLine
                        key={line.id}
                        line={line}
                        active={isActive}
                        onDone={handleLineDone}
                        expanded={expandedLineId === line.id}
                        onToggle={() => setExpandedLineId((prev) => (prev === line.id ? null : line.id))}
                      />
                    ) : (
                      <TypewriterLine
                        key={line.id}
                        line={line}
                        active={isActive}
                        onDone={handleLineDone}
                      />
                    )
                  })}
                  {/* casting 挂起等待指示 */}
                  {activeLine?.lineType === 'casting' && activeTyped && (
                    <div className="flex items-center gap-2 px-3 py-1 text-sm text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      正在等待出招…
                    </div>
                  )}
                  {/* 战果卡片：全部台词播完才淡入 */}
                  {battle.phase === 'ended' && battle.result && allPlayed && (
                    <div className="pt-2">
                      <BattleResultCard
                        result={battle.result}
                        onRematch={rematch}
                        onClose={close}
                        rematching={rematching}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
        </div>
      </div>
    </TooltipProvider>
  )
}
