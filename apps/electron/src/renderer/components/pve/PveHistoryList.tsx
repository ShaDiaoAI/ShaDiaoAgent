/**
 * 历史战绩列表 — 最近 3 场 + 查看全部（分页）+ 单场详情 Dialog
 *
 * 结果徽章配色复用 rarityStyles 思路：胜/血胜=绿、负/血负/余额不足=红、首胜=金。
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { pveBattlesAtom, mapBattleLogItem, type PveBattleLogItem } from '@/atoms/pve-atoms'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

const RESULT_META: Record<string, { label: string; cls: string }> = {
  victory: { label: '胜', cls: 'bg-emerald-500/15 text-emerald-600' },
  blood_win: { label: '血胜', cls: 'bg-emerald-500/15 text-emerald-600' },
  defeat: { label: '负', cls: 'bg-red-500/15 text-red-600' },
  blood_lose: { label: '血负', cls: 'bg-red-500/15 text-red-600' },
  insufficient_quota: { label: '余额不足', cls: 'bg-red-500/15 text-red-600' },
}

function resultBadge(item: PveBattleLogItem): { label: string; cls: string } {
  if (item.firstWin) return { label: '首胜', cls: 'bg-amber-500/15 text-amber-600' }
  return RESULT_META[item.result] ?? { label: item.result, cls: 'bg-muted text-muted-foreground' }
}

/** 列表行时间缩短为 MM-DD HH:mm（50% 宽度下让位给怪物名；完整时间在详情弹窗） */
function shortTime(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

interface PveBattleDetail {
  id: number
  result: string
  rounds: number
  total_tokens: number
  coins_earned: number
  xp_earned: number
  first_win: boolean
  monster: { name: string; level: number; description: string } | null
  used_character_snapshot: {
    level: number
    stats: Record<string, number>
    skill_prompt: string
  } | null
  created_at: string
}

export function PveHistoryList(): React.ReactElement {
  const [battles, setBattles] = useAtom(pveBattlesAtom)
  const [total, setTotal] = React.useState(0)
  const [expanded, setExpanded] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [detail, setDetail] = React.useState<PveBattleDetail | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)

  const loadFirst = React.useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.electronAPI.pveGetBattles(PAGE_SIZE, 0)
      if (r?.success && r.data) {
        setBattles((r.data.items ?? []).map(mapBattleLogItem))
        setTotal(r.data.total ?? 0)
      }
    } catch { /* 忽略 */ } finally {
      setLoading(false)
    }
  }, [setBattles])

  React.useEffect(() => {
    loadFirst()
  }, [loadFirst])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const r = await window.electronAPI.pveGetBattles(PAGE_SIZE, battles.length)
      if (r?.success && r.data) {
        setBattles((prev) => [...prev, ...(r.data.items ?? []).map(mapBattleLogItem)])
        setTotal(r.data.total ?? total)
      }
    } catch { /* 忽略 */ } finally {
      setLoadingMore(false)
    }
  }

  const openDetail = async (id: number) => {
    setDetailLoading(true)
    setDetail(null)
    try {
      const r = await window.electronAPI.pveGetBattleDetail(id)
      if (r?.success && r.data) {
        setDetail(r.data as PveBattleDetail)
      }
    } catch { /* 忽略 */ } finally {
      setDetailLoading(false)
    }
  }

  const visible = expanded ? battles : battles.slice(0, 3)
  const hasMore = battles.length < total

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">PvE 历史战绩</h4>
        {battles.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? '收起' : '查看全部'}
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">暂无历练记录</div>
      ) : (
        <>
          <div className="space-y-1.5">
            {visible.map((item) => {
              const badge = resultBadge(item)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openDetail(item.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                >
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', badge.cls)}>
                    {badge.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{item.monsterName || '未知怪物'}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{item.rounds} 回合</span>
                  <span className="shrink-0 text-[10px] text-amber-500 tabular-nums">💰{item.coinsEarned}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                    {shortTime(item.createdAt)}
                  </span>
                </button>
              )
            })}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="flex w-full items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {loadingMore ? <Loader2 className="size-3.5 animate-spin" /> : null}
              加载更多
            </button>
          )}
        </>
      )}

      {/* 单场详情 Dialog */}
      <Dialog open={!!detail || detailLoading} onOpenChange={(o) => { if (!o) setDetail(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>历练详情</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : detail ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">对手</span>
                <span className="font-medium">{detail.monster?.name ?? '未知'}{detail.monster?.level != null ? ` · Lv.${detail.monster.level}` : ''}</span>
              </div>
              {detail.monster?.description ? (
                <p className="text-xs text-muted-foreground">{detail.monster.description}</p>
              ) : null}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <div className="text-muted-foreground">回合数</div>
                  <div className="font-medium">{detail.rounds}</div>
                </div>
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <div className="text-muted-foreground">消耗 token</div>
                  <div className="font-medium">{detail.total_tokens}</div>
                </div>
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <div className="text-muted-foreground">沙雕币</div>
                  <div className="font-medium text-amber-500">💰{detail.coins_earned}</div>
                </div>
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <div className="text-muted-foreground">经验</div>
                  <div className="font-medium">{detail.xp_earned}</div>
                </div>
              </div>
              {detail.used_character_snapshot ? (
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  <div className="text-muted-foreground">当时等级 Lv.{detail.used_character_snapshot.level}</div>
                  {detail.used_character_snapshot.skill_prompt ? (
                    <p className="mt-1 text-muted-foreground">技能：{detail.used_character_snapshot.skill_prompt}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="text-[10px] text-muted-foreground">{new Date(detail.created_at).toLocaleString()}</div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
