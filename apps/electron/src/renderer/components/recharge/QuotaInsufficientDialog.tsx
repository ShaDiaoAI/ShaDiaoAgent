/**
 * QuotaInsufficientDialog — 调用额度不足阻断弹窗
 *
 * 当 Agent/Chat 返回 HTTP 402 或余额不足时触发。
 * 展示当前额度 + 推荐充值档位 + 跳转充值 CTA。
 */

import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Zap, AlertTriangle, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { callQuotaAtom } from '@/atoms/quota-atoms'
import { activeViewAtom } from '@/atoms/active-view'

interface Props {
  open: boolean
  onClose: () => void
  /** 可选：本次请求预估消耗（¥），用于展示"约需要 ¥x.xx" */
  estimatedCost?: number
}

export function QuotaInsufficientDialog({ open, onClose, estimatedCost }: Props): React.ReactElement | null {
  const balance = useAtomValue(callQuotaAtom)
  const setActiveView = useAtom(activeViewAtom)[1]

  if (!open) return null

  const handleRecharge = () => {
    onClose()
    setActiveView('recharge')
  }

  const displayBalance = balance != null ? `${balance.toFixed(2)}` : '--'

  const products = [
    { id: 1, amount_rmb: '6.00', label: '快速充值' },
    { id: 2, amount_rmb: '24.00', label: '更耐用' },
  ]

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40">
      <div className="w-[380px] p-6 rounded-2xl border bg-card shadow-2xl space-y-5">
        {/* 图标 + 标题 */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center size-12 mx-auto rounded-full bg-amber-100">
            <AlertTriangle className="size-6 text-amber-600" />
          </div>
          <h3 className="text-base font-semibold text-foreground">调用额度不足</h3>
        </div>

        {/* 余额 + 预估消耗 */}
        <div className="rounded-xl bg-muted/30 p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">当前额度</span>
            <span className="font-semibold tabular-nums text-foreground">{displayBalance}</span>
          </div>
          {estimatedCost != null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">本次约需</span>
              <span className="font-medium tabular-nums text-foreground/80">
                {estimatedCost.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          余额不足以完成本次请求。请充值后继续使用。
        </p>

        {/* 推荐档位 */}
        <div className="grid grid-cols-2 gap-3">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={handleRecharge}
              className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:border-primary/40 hover:shadow-sm"
            >
              <span className="text-lg font-bold tabular-nums text-foreground">{p.amount_rmb}</span>
              <span className="text-[10px] text-muted-foreground">{p.label}</span>
            </button>
          ))}
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleRecharge}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Zap size={15} />
            去充值
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
