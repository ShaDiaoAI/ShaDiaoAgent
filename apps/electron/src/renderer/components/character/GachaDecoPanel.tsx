/**
 * GachaDecoPanel — 盲盒对联卷轴装饰条幅
 *
 * 左右各一条竖排对联，红金中国风：
 * - 卷轴纸身（竖排大字，淡金流光偶尔扫过）
 *
 * 上联「盒家欢乐」在左，下联「开盒大吉」在右。
 */
import * as React from 'react'

type Side = 'left' | 'right'

interface GachaDecoPanelProps {
  side: Side
}

const SIDE_CONFIG: Record<Side, {
  couplet: string
  gradientFrom: string
  gradientTo: string
  borderFrom: string
  borderTo: string
}> = {
  left: {
    couplet: '盒家欢乐',
    gradientFrom: 'hsl(358 62% 40%)',
    gradientTo: 'hsl(358 52% 20%)',
    borderFrom: 'hsl(42 78% 58%)',
    borderTo: 'hsl(42 65% 42%)',
  },
  right: {
    couplet: '开盒大吉',
    gradientFrom: 'hsl(38 56% 36%)',
    gradientTo: 'hsl(358 52% 22%)',
    borderFrom: 'hsl(42 85% 65%)',
    borderTo: 'hsl(42 72% 48%)',
  },
}

export function GachaDecoPanel({ side }: GachaDecoPanelProps): React.ReactElement {
  const config = SIDE_CONFIG[side]

  return (
    <div
      className="gacha-deco-panel gacha-couplet relative flex h-full flex-col items-center overflow-hidden rounded-2xl border-2 select-none"
      style={{
        background: `linear-gradient(180deg, ${config.gradientFrom} 0%, ${config.gradientTo} 100%)`,
        borderColor: config.borderFrom,
      }}
    >
      {/* 卷轴纸身（竖排大字 + 流光） */}
      <div className="gacha-couplet-body relative flex flex-1 items-center justify-center my-4 px-3 py-6">
        <span
          className="gacha-couplet-text"
          style={{ color: 'hsl(42 85% 72%)' }}
        >
          {config.couplet}
        </span>
        <span className="gacha-couplet-sheen" aria-hidden="true" />
      </div>
    </div>
  )
}
