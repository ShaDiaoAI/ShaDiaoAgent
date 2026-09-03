/**
 * 加点 Dialog — 五维属性分配（人物 tab → 人物卡片 → +N 胶囊弹出）
 *
 * 本地 draft + 全量保存：点 +/− 只改本地 draft，不发请求；
 * 「保存」提交整份 5 维（POST /api/characters/{id}/allocate-point）。
 * 展示「基础 + 加点 = 有效」分解，让用户知道加的点落在哪。
 */

import * as React from 'react'
import { STAT_DIMS, getStat } from '@shadiao/shared'
import { Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { ShadiaoCharacter } from '@/atoms/character-atoms'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface StatAllocationDialogProps {
  char: ShadiaoCharacter | null
  open: boolean
  onClose: () => void
  /** 保存成功后回传更新后的人物，由父组件回写 atoms */
  onSaved: (char: ShadiaoCharacter) => void
}

export function StatAllocationDialog({
  char, open, onClose, onSaved,
}: StatAllocationDialogProps): React.ReactElement {
  // 皮肤基础属性（base）。缺省皮肤 base_stats 时优先回退 effective - allocated，再兜底全 1
  const baseStats = React.useMemo(() => {
    if (!char) return {} as Record<string, number>
    const map: Record<string, number> = {}
    const hasSkinBase = char.skin_base_stats != null
    for (const dim of STAT_DIMS) {
      if (hasSkinBase) {
        map[dim.key] = getStat(char.skin_base_stats, dim.key)
      } else {
        const eff = getStat(char.effective_stats, dim.key)
        const alloc = getStat(char.allocated_stats, dim.key)
        map[dim.key] = eff > 0 ? eff - alloc : 1
      }
    }
    return map
  }, [char])

  const [draft, setDraft] = React.useState<Record<string, number>>({})
  const [remaining, setRemaining] = React.useState(0)
  const [saving, setSaving] = React.useState(false)

  // 打开时初始化 draft + remaining（本地快照，取消即丢弃）
  React.useEffect(() => {
    if (!open || !char) return
    const d: Record<string, number> = {}
    for (const dim of STAT_DIMS) d[dim.key] = getStat(char.allocated_stats, dim.key)
    setDraft(d)
    setRemaining(char.unspent_points ?? 0)
  }, [open, char])

  const inc = (key: string) => {
    if (saving || remaining <= 0) return
    setDraft((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }))
    setRemaining((r) => r - 1)
  }

  const dec = (key: string) => {
    if (saving || (draft[key] ?? 0) <= 0) return
    setDraft((prev) => ({ ...prev, [key]: (prev[key] ?? 0) - 1 }))
    setRemaining((r) => r + 1)
  }

  const save = async () => {
    if (!char) return
    setSaving(true)
    try {
      const r = await window.electronAPI.allocatePoint(char.id, draft)
      if (r?.success && r.data) {
        onSaved(r.data)
        toast.success('已保存加点')
        onClose()
      } else {
        const err = r?.error ?? ''
        if (err.includes('400') || err.includes('超出') || err.includes('上限')) {
          toast.error('加点超出上限，请重新分配')
        } else {
          toast.error('加点保存失败，请重试')
        }
      }
    } catch {
      toast.error('加点保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>加点 — {char?.name}</DialogTitle>
        </DialogHeader>

        {/* 顶部 legend + 剩余点数 */}
        <div className="space-y-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {STAT_DIMS.map((d) => `${d.label}=${d.desc}`).join(' · ')}
          </p>
          <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2">
            <span className="text-xs text-muted-foreground">剩余点数</span>
            <span className={cn(
              'text-sm font-semibold tabular-nums',
              remaining > 0 ? 'text-amber-500' : 'text-muted-foreground',
            )}>
              {remaining}
            </span>
          </div>
        </div>

        {/* 五维行 */}
        <div className="space-y-1.5">
          {STAT_DIMS.map((dim) => {
            const base = baseStats[dim.key] ?? 1
            const alloc = draft[dim.key] ?? 0
            const effective = base + alloc
            return (
              <div key={dim.key} className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5">
                <div className="w-12 shrink-0">
                  <div className="text-[13px] font-medium">{dim.label}</div>
                  <div className="text-[9px] text-muted-foreground/70">{dim.desc}</div>
                </div>
                <div className="flex-1 text-[11px] text-muted-foreground tabular-nums">
                  基础 {base} + {alloc} ={' '}
                  <span className="text-[12px] font-semibold text-foreground">{effective}</span>
                </div>
                <button
                  type="button"
                  onClick={() => dec(dim.key)}
                  disabled={(draft[dim.key] ?? 0) <= 0 || saving}
                  className="flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={`${dim.label}减一`}
                >
                  <Minus className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => inc(dim.key)}
                  disabled={remaining <= 0 || saving}
                  className="flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={`${dim.label}加一`}
                >
                  <Plus className="size-3" />
                </button>
              </div>
            )
          })}
        </div>

        <p className="text-[10px] text-muted-foreground">换肤会返还全部已加点</p>

        <DialogFooter>
          <button
            type="button"
            className="flex-1 rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </button>
          <button
            type="button"
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            onClick={save}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
