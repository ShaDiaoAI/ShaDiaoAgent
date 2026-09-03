/**
 * PvE / PvP 双卡片 — 横条背景图海报卡（2026-09-02 改版）
 *
 * - 两张横条卡（aspect-[16/9]），山洞图 / 军帐图 object-cover 铺满 + 暗化渐变遮罩
 * - 前景：图标 + 白字标题叠在遮罩上；hover 上浮 + 图片轻微放大
 * - PvE 卡可点（开始历练）；PvP 卡禁用（敬请期待，背景图弱化展示）
 */

import * as React from 'react'
import { Swords, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PveBattleCardProps {
  onStartPve: () => void
}

export function PveBattleCard({ onStartPve }: PveBattleCardProps): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* PvE 卡片 */}
      <button
        type="button"
        onClick={onStartPve}
        className={cn(
          'group relative aspect-[16/9] overflow-hidden rounded-xl border border-border',
          'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40',
        )}
      >
        <img
          src="./pve/pve-bg.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10" />
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2 text-white">
          <div className="flex size-11 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
            <Swords className="size-5" />
          </div>
          <span className="text-sm font-medium drop-shadow">开始 PvE 历练</span>
        </div>
      </button>

      {/* PvP 卡片（置灰禁用） */}
      <div
        className={cn(
          'group relative aspect-[16/9] overflow-hidden rounded-xl border border-border',
          'opacity-60 saturate-50 cursor-not-allowed',
        )}
      >
        <img
          src="./pve/pvp-bg.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/15" />
        <span className="absolute top-2 right-2 z-20 rounded-full bg-black/50 px-2 py-0.5 text-[9px] text-white">
          敬请期待
        </span>
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2 text-white/85">
          <div className="flex size-11 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
            <Shield className="size-5" />
          </div>
          <span className="text-sm font-medium drop-shadow">开始 PvP 历练</span>
        </div>
      </div>
    </div>
  )
}
