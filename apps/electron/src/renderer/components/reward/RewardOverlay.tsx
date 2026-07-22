import * as React from 'react'
import { useAtom } from 'jotai'
import { X, Coins, Shirt } from 'lucide-react'
import { rewardQueueAtom, type RewardNotification } from '@/atoms/character-atoms'
import { cn } from '@/lib/utils'

/**
 * 奖励掉落弹窗
 *
 * 当收到 SSE reward_drop 事件时，显示掉落动画弹窗
 */

export function RewardOverlay(): React.ReactElement | null {
  const [queue, setQueue] = useAtom(rewardQueueAtom)
  const [current, setCurrent] = React.useState<RewardNotification | null>(null)
  const [animating, setAnimating] = React.useState(false)

  // 从队列中取下一个奖励
  React.useEffect(() => {
    if (current || queue.length === 0) return
    const next = queue.find(q => !q.dismissed)
    if (!next) return
    setCurrent(next)
    setAnimating(true)

    // 3 秒后自动关闭
    const timer = setTimeout(() => {
      setAnimating(false)
      setTimeout(() => {
        setQueue(prev => prev.map(q => q.id === next.id ? { ...q, dismissed: true } : q))
        setCurrent(null)
      }, 300)
    }, 3000)
    return () => clearTimeout(timer)
  }, [queue, current])

  if (!current) return null

  const isCoin = current.reward_type === 'coin'
  const isSkin = current.reward_type === 'skin'

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div
        className={cn(
          'relative flex items-center gap-3 rounded-xl border bg-card p-4 shadow-2xl transition-all duration-300',
          animating ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-4 opacity-0 scale-95',
        )}
      >
        {/* 关闭按钮 */}
        <button
          className="absolute -top-2 -right-2 size-5 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
          onClick={() => {
            setAnimating(false)
            setTimeout(() => {
              setQueue(prev => prev.map(q => q.id === current.id ? { ...q, dismissed: true } : q))
              setCurrent(null)
            }, 300)
          }}
        >
          <X className="size-3" />
        </button>

        {/* 图标 */}
        <div className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          isCoin ? 'bg-amber-400/20 text-amber-500' : 'bg-purple-400/20 text-purple-500',
        )}>
          {isCoin ? <Coins className="size-5" /> : <Shirt className="size-5" />}
        </div>

        {/* 内容 */}
        <div>
          <div className="text-sm font-semibold">
            {isCoin ? `🎉 获得 ${current.amount} 沙雕币` : `🎁 获得皮肤: ${current.name}`}
          </div>
          {current.rarity && (
            <div className="text-xs text-muted-foreground mt-0.5">
              稀有度: {current.rarity}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 奖励历史列表
 */
export function RewardHistory(): React.ReactElement {
  const [rewards, setRewards] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    setLoading(true)
    window.electronAPI.getRewards?.()
      .then(r => { if (r?.success) setRewards(r.data || []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold mb-3">奖励记录</h3>
      {loading ? (
        <div className="text-xs text-muted-foreground text-center py-4">加载中...</div>
      ) : rewards.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">暂无奖励记录</div>
      ) : (
        rewards.slice(0, 20).map(r => (
          <div key={r.id} className="flex items-center gap-2.5 p-2 rounded-lg border border-border">
            <div className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full',
              r.reward_type === 'coin' ? 'bg-amber-400/10 text-amber-500' : 'bg-purple-400/10 text-purple-500',
            )}>
              {r.reward_type === 'coin' ? <Coins className="size-3.5" /> : <Shirt className="size-3.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">
                {r.reward_type === 'coin'
                  ? `${r.reward_data?.amount || '?'} 沙雕币`
                  : `皮肤: ${r.reward_data?.name || '未知'}`}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {new Date(r.triggered_at).toLocaleString()}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
