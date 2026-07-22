import * as React from 'react'
import { Bot } from 'lucide-react'
import Rive from '@rive-app/react-canvas'
import { riveAgentStateAtom, riveAssetIdAtom, RIVE_STATE_LABELS, type RiveAgentState } from '@/atoms/rive-atoms'
import { useRiveAgentState } from '@/hooks/useRiveAgentState'
import { cn } from '@/lib/utils'

/**
 * Rive 角色画布组件
 *
 * - 如果有 riveAssetId 且加载成功 → 渲染真实 Rive 动画
 * - 如果无 rive 文件或加载失败 → fallback 到 CSS 动画占位
 * - 外层包裹"相框"样式
 */

// ===== CSS 动画占位样式（无 .riv 文件时的 fallback） =====

const placeholderStateStyles: Record<RiveAgentState, string> = {
  idle: 'animate-pulse opacity-70',
  thinking: 'animate-spin [animation-duration:3s] opacity-90 hue-rotate-15',
  tool_calling: 'animate-pulse [animation-duration:0.5s] opacity-100 brightness-110',
  streaming: 'animate-bounce [animation-duration:1s] opacity-100',
  reward_drop: 'animate-bounce [animation-duration:0.4s] opacity-100 brightness-125 saturate-150',
  error: 'animate-[shake_0.5s_ease-in-out] opacity-100 hue-rotate-330 brightness-90',
}

const placeholderStateColors: Record<RiveAgentState, string> = {
  idle: 'from-blue-400/30 to-purple-400/30',
  thinking: 'from-amber-400/40 to-orange-400/40',
  tool_calling: 'from-cyan-400/50 to-blue-500/50',
  streaming: 'from-emerald-400/50 to-teal-400/50',
  reward_drop: 'from-yellow-400/60 to-amber-400/60',
  error: 'from-red-400/50 to-rose-500/50',
}

interface RiveCanvasProps {
  className?: string
}

function CSSPlaceholder({ state }: { state: RiveAgentState }): React.ReactElement {
  return (
    <div className="relative flex flex-col items-center justify-center size-full">
      <div
        className={cn(
          'relative flex size-28 items-center justify-center rounded-full',
          'bg-gradient-to-br shadow-lg transition-all duration-500',
          placeholderStateColors[state],
          placeholderStateStyles[state],
        )}
      >
        <Bot className="size-12 text-white/80" />
        <div
          className={cn(
            'absolute inset-0 rounded-full border-2 border-white/20',
            state === 'thinking' && 'animate-spin [animation-duration:2s]',
            state === 'streaming' && 'animate-ping opacity-30',
          )}
        />
      </div>
      <span className="mt-2 text-[10px] text-muted-foreground font-medium">
        {RIVE_STATE_LABELS[state]}
      </span>
    </div>
  )
}

export function RiveCanvas({ className }: RiveCanvasProps): React.ReactElement {
  const state = useRiveAgentState()
  const riveAssetId = '' // TODO: 从 selectedCharacter.equipped_skin?.rive_asset_id 获取

  const [hasRiveError, setHasRiveError] = React.useState(false)

  // 不使用 Rive 的情况：没有 assetId 或加载失败
  const usePlaceholder = !riveAssetId || hasRiveError

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border-2 border-border/60 bg-muted/30 shadow-inner',
        'flex items-center justify-center',
        className,
      )}
    >
      {usePlaceholder ? (
        <CSSPlaceholder state={state} />
      ) : (
        <Rive
          src={riveAssetId}
          stateMachines="AgentStateMachine"
          onError={() => setHasRiveError(true)}
          className="size-full"
        />
      )}

      {/* 底部状态标签 */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-background/80 backdrop-blur-sm text-[10px] text-muted-foreground font-medium select-none">
        {RIVE_STATE_LABELS[state]}
      </div>

      {/* CSS 动画注入 */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-4px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
      `}</style>
    </div>
  )
}
