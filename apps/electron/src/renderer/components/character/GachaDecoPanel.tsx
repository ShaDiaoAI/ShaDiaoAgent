/**
 * GachaDecoPanel — 盲盒喜庆装饰侧面板（方案 B：纯装饰型）
 *
 * 左右各一块等高于盲盒主区域的纯装饰面板，红金中国风配色：
 * - 顶部悬挂灯笼（CSS 摇摆动画）
 * - 中央大字（福/运）+ 金色辉光呼吸
 * - 底部对联式短语
 * - 金色粒子从顶部飘落
 * - 底部均衡器跳动柱（音响音量效果）
 * - 双线描边 + 光晕脉动
 */
import * as React from 'react'

type Side = 'left' | 'right'

interface GachaDecoPanelProps {
  side: Side
}

/** 单个飘落金粒的配置 */
interface ParticleConfig {
  id: number
  leftPct: number
  width: number
  height: number
  fallDuration: number
  fallDelay: number
  drift: number
  spin: number
}

/** 单个均衡器柱的配置 */
interface EqBarConfig {
  id: number
  leftPct: number     // 水平位置 (%)
  width: number       // 柱宽 (px)
  maxHeight: number   // 最高高度 (px)
  duration: number    // 跳动周期 (s)
  delay: number       // 动画延迟 (s)
}

/** 生成一组不重复的随机粒子配置 */
function generateParticles(count: number): ParticleConfig[] {
  const particles: ParticleConfig[] = []
  for (let i = 0; i < count; i++) {
    particles.push({
      id: i,
      leftPct: Math.round((Math.random() * 80 + 10) * 10) / 10,
      width: Math.round((Math.random() * 3 + 2) * 10) / 10,
      height: Math.round((Math.random() * 4 + 3) * 10) / 10,
      fallDuration: Math.round((Math.random() * 4 + 8) * 10) / 10,
      fallDelay: Math.round(Math.random() * 6 * 10) / 10,
      drift: Math.round((Math.random() - 0.5) * 60 * 10) / 10,
      spin: Math.round(Math.random() * 360 * 10) / 10,
    })
  }
  return particles
}

/** 生成一组均衡器柱配置 — 不同节奏，错落有致 */
function generateEqBars(count: number): EqBarConfig[] {
  const bars: EqBarConfig[] = []
  // 节奏不一，模拟真实音频频谱
  const durations = [0.9, 1.2, 1.5, 0.7, 1.8, 1.1, 1.3, 0.8, 1.6]
  const maxHeights = [72, 108, 84, 132, 60, 96, 120, 78, 144]
  for (let i = 0; i < count; i++) {
    bars.push({
      id: i,
      leftPct: 8 + i * (84 / (count - 1)),  // 均匀分布在 8%-92%
      width: Math.round((Math.random() * 4 + 5) * 10) / 10,  // 5-9px
      maxHeight: maxHeights[i % maxHeights.length],
      duration: durations[i % durations.length],
      delay: Math.round(Math.random() * 1.5 * 10) / 10,  // 0-1.5s 随机延迟
    })
  }
  return bars
}

const SIDE_CONFIG: Record<Side, {
  char: string       // 中央大字
  line1: string      // 对联上句
  line2: string      // 对联下句
  gradientFrom: string
  gradientTo: string
  borderFrom: string
  borderTo: string
}> = {
  left: {
    char: '福',
    line1: '福袋一开',
    line2: '好运自来',
    gradientFrom: 'hsl(358 68% 42%)',
    gradientTo:   'hsl(358 55% 22%)',
    borderFrom:   'hsl(42 78% 58%)',
    borderTo:     'hsl(42 65% 42%)',
  },
  right: {
    char: '运',
    line1: '盲盒一出',
    line2: '欧气爆棚',
    gradientFrom: 'hsl(38 60% 38%)',
    gradientTo:   'hsl(358 55% 24%)',
    borderFrom:   'hsl(42 85% 65%)',
    borderTo:     'hsl(42 72% 48%)',
  },
}

export function GachaDecoPanel({ side }: GachaDecoPanelProps): React.ReactElement {
  const config = SIDE_CONFIG[side]
  const particles = React.useMemo(() => generateParticles(14), [])
  const eqBars = React.useMemo(() => generateEqBars(7), [])

  return (
    <div
      className="gacha-deco-panel gacha-deco-dark gacha-glow relative flex flex-col items-center justify-between overflow-hidden rounded-2xl border-2 gacha-border-shine h-full select-none"
      style={{
        background: `linear-gradient(180deg, ${config.gradientFrom} 0%, ${config.gradientTo} 100%)`,
        borderColor: config.borderFrom,
      }}
    >
      {/* 金色粒子层 */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        {particles.map((p) => (
          <div
            key={p.id}
            className="gacha-particle"
            style={{
              left: `${p.leftPct}%`,
              width: `${p.width}px`,
              height: `${p.height}px`,
              '--fall-duration': `${p.fallDuration}s`,
              '--fall-delay': `${p.fallDelay}s`,
              '--drift': `${p.drift}px`,
              '--spin': `${p.spin}deg`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* 均衡器跳动柱层 */}
      <div className="absolute bottom-0 left-0 right-0 z-[1] flex items-end justify-around px-1" aria-hidden="true"
        style={{ height: '35%' }}>
        {eqBars.map((bar) => (
          <div
            key={bar.id}
            className="gacha-eq-bar"
            style={{
              width: `${bar.width}px`,
              height: `${bar.maxHeight}px`,
              '--eq-duration': `${bar.duration}s`,
              '--eq-delay': `${bar.delay}s`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* 顶部：灯笼 */}
      <div className="relative z-10 flex flex-col items-center pt-5 gap-1">
        {/* 灯笼挂绳 */}
        <div
          className="w-px h-5"
          style={{ background: `linear-gradient(180deg, transparent, hsl(42 78% 58% / 0.8))` }}
        />
        {/* 灯笼主体 */}
        <div className="gacha-lantern text-3xl select-none drop-shadow-lg">
          🏮
        </div>
      </div>

      {/* 中间：大字 + 辉光 */}
      <div className="relative z-10 flex-1 flex items-center justify-center">
        <span
          className="gacha-char-glow text-6xl font-bold select-none"
          style={{
            color: 'hsl(42 85% 70%)',
            textShadow: `
              0 0 20px rgba(232, 180, 75, 0.5),
              0 0 40px rgba(200, 50, 40, 0.2),
              0 2px 4px rgba(0, 0, 0, 0.3)
            `,
          }}
        >
          {config.char}
        </span>
      </div>

      {/* 底部：对联短句 */}
      <div className="relative z-10 flex flex-col items-center gap-0.5 pb-5">
        <span
          className="text-xs font-medium tracking-widest select-none"
          style={{ color: 'hsl(42 80% 80% / 0.9)' }}
        >
          {config.line1}
        </span>
        <span
          className="text-xs font-medium tracking-widest select-none"
          style={{ color: 'hsl(42 80% 80% / 0.9)' }}
        >
          {config.line2}
        </span>
        {/* 底部分隔装饰线 */}
        <div
          className="mt-1 h-0.5 w-12 rounded-full"
          style={{ background: 'linear-gradient(90deg, transparent, hsl(42 78% 58% / 0.7), transparent)' }}
        />
      </div>
    </div>
  )
}
