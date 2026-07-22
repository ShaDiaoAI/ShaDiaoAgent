/**
 * AI Elements - 上下文分隔线
 *
 * 虚线分隔 + "清除上下文" 标签 + 删除按钮。
 * 移植自 proma-frontend 的 ai-elements/context-divider.tsx。
 */

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import type { ComponentProps } from 'react'

export interface ContextDividerProps extends ComponentProps<'div'> {
  /** 分隔线对应的 messageId */
  messageId: string
  /** 删除分隔线的回调 */
  onDelete?: (messageId: string) => void
}

export function ContextDivider({
  messageId,
  onDelete,
  className,
  ...props
}: ContextDividerProps): React.ReactElement {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center py-2',
        className
      )}
      {...props}
    >
      {/* 左侧虚线 */}
      <div className="flex-1 border-t border-dashed border-muted-foreground/30" />

      {/* 中间文字和关闭按钮 */}
      <div className="mx-3 flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground select-none">
          清除上下文
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-4 w-4 rounded-full hover:bg-muted"
          onClick={() => onDelete?.(messageId)}
          aria-label="删除分隔线"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>

      {/* 右侧虚线 */}
      <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
    </div>
  )
}
