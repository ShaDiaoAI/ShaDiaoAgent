/**
 * QuotaBar — 侧边栏底部额度条
 *
 * 单行设计：⚡ 调用额度 ? · ██████░░░░ 23 该充电了
 * 点击跳转独立充值页。
 */

import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { callQuotaAtom, quotaPercentAtom, getQuotaStatusText, getQuotaColor } from '@/atoms/quota-atoms'
import { activeViewAtom } from '@/atoms/active-view'

export function QuotaBar(): React.ReactElement {
  const [balance, setBalance] = useAtom(callQuotaAtom)
  const percent = useAtomValue(quotaPercentAtom)
  const activeView = useAtomValue(activeViewAtom)
  const setActiveView = useAtom(activeViewAtom)[1]

  // 初始加载
  React.useEffect(() => {
    if (balance !== null) return
    window.electronAPI.getQuotaBalance?.().then((r: any) => {
      if (r?.success && r.data?.balance != null) {
        setBalance(r.data.balance)
      }
    }).catch(() => {})
  }, [])

  const isLoading = balance === null
  const statusText = getQuotaStatusText(balance)
  const colors = getQuotaColor(balance)

  const handleClick = () => {
    if (activeView === 'recharge') {
      setActiveView('conversations')
    } else {
      setActiveView('recharge')
    }
  }

  return (
    <div className="px-3 pb-2">
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-2 w-full group"
      >
        {/* 标签：⚡ 调用额度 */}
        <Zap className={cn('size-3 shrink-0', isLoading ? 'text-muted-foreground/40' : colors.text)} />
        <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground/70 transition-colors whitespace-nowrap">
          调用额度
        </span>

        {/* ? 帮助（仿沙雕币样式：圆圈背景） */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="button"
              tabIndex={0}
              className="inline-flex size-3.5 items-center justify-center rounded-full bg-amber-500/15 text-white hover:bg-amber-500/25 transition-colors text-[9px] font-bold leading-none cursor-help shrink-0"
              aria-label="什么是调用额度？"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}
            >
              ?
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px]">
            <p className="text-xs leading-relaxed">
              调用额度用于 AI 调用的词元消耗，通过转账充值获得
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              每次沙雕智能体的调用按实际词元消耗扣减额度。支持微信扫码充值
            </p>
          </TooltipContent>
        </Tooltip>

        {/* 分隔 */}
        <span className="text-[8px] text-muted-foreground/40 select-none">·</span>

        {/* 进度条 */}
        {isLoading ? (
          <div className="flex-1 h-1 rounded-full bg-muted animate-pulse" />
        ) : (
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden min-w-0">
            <div
              className={cn('h-full rounded-full transition-all duration-500', colors.fill)}
              style={{ width: `${percent}%` }}
            />
          </div>
        )}

        {/* 数字 */}
        <span className={cn(
          'text-[11px] font-medium tabular-nums min-w-[1.5em] text-right',
          isLoading ? 'text-muted-foreground/40' : colors.text,
        )}>
          {isLoading ? '--' : percent}
        </span>

        {/* 状态词 */}
        <span className="text-[10px] text-muted-foreground whitespace-nowrap group-hover:text-foreground/70 transition-colors">
          {statusText}
        </span>
      </button>
    </div>
  )
}
