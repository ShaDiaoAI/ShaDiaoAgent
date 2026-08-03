import * as React from 'react'
import { Shield, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DrawResultItem {
  skin: {
    id: number
    name: string
    rarity: string
    preview_url?: string
    rive_asset_id: string
  }
  is_new: boolean
  quantity: number
}

interface GachaResultModalProps {
  results: DrawResultItem[]
  isOpen: boolean
  onClose: () => void
}

const rarityStyles: Record<string, string> = {
  default:   'border-slate-300 bg-slate-300',
  common:    'border-emerald-400 bg-emerald-400',
  rare:      'border-blue-400 bg-blue-400',
  epic:      'border-purple-400 bg-purple-400',
  legendary: 'border-amber-400 bg-amber-400',
}

const rarityLabels: Record<string, string> = {
  default:   '默认',
  common:    '普通',
  rare:      '稀有',
  epic:      '史诗',
  legendary: '传说',
}

const rarityBgGlow: Record<string, string> = {
  default:   'from-slate-500/10 to-slate-400/5',
  common:    'from-emerald-500/10 to-emerald-400/5',
  rare:      'from-blue-500/10 to-blue-400/5',
  epic:      'from-purple-500/10 to-purple-400/5',
  legendary: 'from-amber-500/10 to-amber-400/5',
}

export function GachaResultModal({ results, isOpen, onClose }: GachaResultModalProps): React.ReactElement | null {
  if (!isOpen || results.length === 0) return null

  const isMulti = results.length > 1

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className={cn(
          'relative mx-4 max-h-[85vh] overflow-y-auto rounded-2xl border bg-card shadow-2xl',
          isMulti ? 'w-[640px]' : 'w-[340px]',
        )}
        onClick={e => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          className="absolute top-3 right-3 flex size-7 items-center justify-center rounded-full bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors z-10"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>

        {/* 头部 */}
        <div className="pt-6 pb-4 text-center">
          <Sparkles className="size-8 text-amber-400 mx-auto mb-2" />
          <h3 className="text-lg font-semibold">
            {isMulti ? '🎊 5连抽结果' : '🎁 单抽结果'}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isMulti ? '共获得 5 件皮肤' : '获得以下皮肤'}
          </p>
        </div>

        {/* 结果卡片 */}
        {isMulti ? (
          <div className="px-5 pb-6 flex flex-col gap-3">
            <div className="flex justify-center gap-3">
              {results.slice(0, 2).map((result, i) => (
                <div key={`${result.skin.id}-${i}`} className="w-[calc((100%-12px)/3)]">
                  <ResultCard result={result} />
                </div>
              ))}
            </div>
            <div className="flex justify-center gap-3">
              {results.slice(2, 5).map((result, i) => (
                <div key={`${result.skin.id}-${i + 2}`} className="w-[calc((100%-12px)/3)]">
                  <ResultCard result={result} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex justify-center px-5 pb-6">
            {results.map((result, i) => (
              <div key={`${result.skin.id}-${i}`}>
                <ResultCard result={result} />
              </div>
            ))}
          </div>
        )}

        {/* 确认按钮 */}
        <div className="px-5 pb-5">
          <button
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            onClick={onClose}
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}

function ResultCard({ result }: { result: DrawResultItem }): React.ReactElement {
  const { skin, is_new } = result
  const assetId = skin.rive_asset_id || skin.name
  const localPreviewPath = `./characters/${assetId}/preview.png`
  const [imgSrc, setImgSrc] = React.useState<string | null>(localPreviewPath)
  const [fallbackStage, setFallbackStage] = React.useState(0)

  const handleImgError = () => {
    if (fallbackStage === 0 && skin.preview_url) {
      setImgSrc(skin.preview_url)
      setFallbackStage(1)
    } else {
      setImgSrc(null)
      setFallbackStage(2)
    }
  }

  const rarityColor = rarityStyles[skin.rarity] || 'border-slate-400 bg-slate-400'

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border bg-card overflow-hidden shadow-sm',
        is_new && 'ring-2 ring-amber-400/50',
      )}
    >
      {/* 预览图 */}
      <div className={cn(
        'relative aspect-square bg-gradient-to-b flex items-center justify-center overflow-hidden',
        rarityBgGlow[skin.rarity] || rarityBgGlow.default,
      )}>
        {/* 新皮肤标记 */}
        {is_new && (
          <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-400 text-[9px] font-medium text-white shadow-sm z-10">
            <Sparkles className="size-2.5" />
            新
          </div>
        )}
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={skin.name}
            className="w-full h-full object-cover object-top"
            onError={handleImgError}
          />
        ) : (
          <Shield className="size-10 text-muted-foreground/40" />
        )}
      </div>

      {/* 信息栏 */}
      <div className="flex flex-col gap-0.5 px-2.5 py-2 border-t border-border/60">
        <span className="text-[12px] font-medium truncate">{skin.name}</span>
        <div className="flex items-center gap-1">
          <span className={cn('inline-block size-1.5 rounded-full shrink-0', rarityColor)} />
          <span className="text-[10px] text-muted-foreground">
            {rarityLabels[skin.rarity] || skin.rarity}
          </span>
        </div>
      </div>
    </div>
  )
}
