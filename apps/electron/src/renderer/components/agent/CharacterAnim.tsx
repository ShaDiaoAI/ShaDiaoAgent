import * as React from 'react'
import { useRiveAgentState } from '@/hooks/useRiveAgentState'
import { RIVE_STATE_LABELS, type RiveAgentState } from '@/atoms/rive-atoms'
import { useAtomValue } from 'jotai'
import { selectedCharacterAtom } from '@/atoms/character-atoms'
import { pveStatusAtom } from '@/atoms/pve-atoms'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { createLogger } from '@shadiao/shared'

const log = createLogger('CharacterAnim')

declare global {
  interface Window {
    createjs: any
    AdobeAn: any
  }
}

const BASE_PATH = './characters/'
const COMPOSITION_ID = 'AE1281ADA8D741A4A82ACA3070D49490'

/**
 * 获取当前加载的 composition。
 * 策略：加载新 bundle 前清掉 AdobeAn.compositions 中的旧条目，
 * 加载后 compositions 中唯一的新条目就是当前 bundle 的。
 */
function resolveComposition(an: any): { comp: any; id: string } | null {
  const comps: Record<string, any> = an?.compositions ?? {}
  const ids = Object.keys(comps)
  if (ids.length === 0) return null
  // 加载后应该只剩一个
  const id = ids[0]
  return { comp: comps[id], id }
}

/**
 * 清空 AdobeAn 中所有已注册的 composition。
 * 在新 bundle 加载前调用，确保加载后只有当前 bundle 的条目。
 */
function clearCompositions(an: any): Set<string> {
  const comps: Record<string, any> = an?.compositions ?? {}
  const removed = new Set(Object.keys(comps))
  for (const key of removed) {
    delete comps[key]
  }
  return removed
}

// ===== 脚本加载 =====
let createjsLoadPromise: Promise<void> | null = null
const bundleLoadPromises = new Map<string, Promise<void>>()
const loadedBundles = new Set<string>()

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.setAttribute('data-src', src)
    s.src = src

    let settled = false
    const done = (err?: Error) => {
      if (settled) return
      settled = true
      window.removeEventListener('error', onWindowError)
      if (err) reject(err)
      else resolve()
    }

    const onWindowError = (evt: ErrorEvent) => {
      // evt.filename 在动态 script 中可能为空，直接 reject
      if (!settled) {
        done(new Error(`Bundle 运行时错误: ${evt.message}`))
      }
    }
    window.addEventListener('error', onWindowError)

    s.onload = () => done()
    s.onerror = () => done(new Error(`加载失败: ${src}`))
    document.head.appendChild(s)
  })
}

async function ensureCreatejs(): Promise<void> {
  if (window.createjs) return
  if (!createjsLoadPromise) {
    createjsLoadPromise = loadScript(BASE_PATH + 'createjs.min.js')
  }
  return createjsLoadPromise
}

async function ensureBundle(name: string): Promise<void> {
  if (loadedBundles.has(name)) return
  let p = bundleLoadPromises.get(name)
  if (!p) {
    p = ensureCreatejs().then(() => loadScript(`${BASE_PATH}${name}/${name}.bundle.js`))
    bundleLoadPromises.set(name, p)
  }
  await p
  loadedBundles.add(name)
}

// ===== Fallback =====
const placeholderColors: Record<RiveAgentState, string> = {
  idle: 'from-blue-400/30 to-purple-400/30',
  thinking: 'from-amber-400/40 to-orange-400/40',
  tool_calling: 'from-cyan-400/50 to-blue-500/50',
  streaming: 'from-emerald-400/50 to-teal-400/50',
  reward_drop: 'from-yellow-400/60 to-amber-400/60',
  error: 'from-red-400/50 to-rose-500/50',
}

function Placeholder({ state }: { state: RiveAgentState }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className={cn(
        'flex size-28 items-center justify-center rounded-full bg-gradient-to-br shadow-lg transition-all duration-500',
        placeholderColors[state],
      )}>
        <span className="text-4xl">🦐</span>
      </div>
    </div>
  )
}

// ===== 主组件 =====
interface CharacterAnimProps { className?: string; coins?: number; onCanvasClick?: () => void }

/** 浮动 +N 文字实例 */
interface FloatingText {
  id: string
  amount: number
}

export function CharacterAnim({ className, coins, onCanvasClick }: CharacterAnimProps): React.ReactElement {
  const state = useRiveAgentState()
  const selectedChar = useAtomValue(selectedCharacterAtom)
  const pveStatus = useAtomValue(pveStatusAtom)
  const animAssetId = selectedChar?.equipped_skin?.rive_asset_id || '乞丐虾仁'
  const currentSkinId = selectedChar?.equipped_skin?.id

  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const stageRef = React.useRef<any>(null)
  const exportRootRef = React.useRef<any>(null)
  const prevStateRef = React.useRef<RiveAgentState>('idle')
  const prevSkinIdRef = React.useRef<number | undefined>(undefined)
  const loopCheckerRef = React.useRef<(() => void) | null>(null)
  const [phase, setPhase] = React.useState<'loading' | 'ready' | 'error'>('loading')
  const [skinFlash, setSkinFlash] = React.useState(false)

  // ===== 沙雕币动画状态 =====
  const prevCoinsRef = React.useRef<number | undefined>(undefined)
  const animationFrameRef = React.useRef<number>(0)
  const [displayCoins, setDisplayCoins] = React.useState<number | undefined>(coins)
  const [floatingTexts, setFloatingTexts] = React.useState<FloatingText[]>([])

  log.info('render:', { charName: selectedChar?.name, animAssetId, skinId: currentSkinId, phase })

  // ===== 初始化 =====
  // 只有当 selectedChar 就绪后才初始化 Canvas，跳过 fallback 竞态
  React.useEffect(() => {
    if (!selectedChar) return  // 等人物数据加载完
    let cancelled = false

    async function init() {
      try {
        // 加载新 bundle 前清除旧 composition，确保加载后只有当前这一个
        const anBefore = window.AdobeAn
        clearCompositions(anBefore)

        await ensureBundle(animAssetId)
        if (cancelled) return

        const cjs = window.createjs
        const an = window.AdobeAn  // ensureBundle 之后重新读取
        if (!cjs || !an || !canvasRef.current) { setPhase('error'); return }

        let found = resolveComposition(an)
        if (!found) {
          // 切回已加载过的皮肤时，bundle 命中缓存未重新执行，
          // 但 composition 已被之前的 clearCompositions 销毁。
          // 此时需要强制重新加载 bundle。
          if (loadedBundles.has(animAssetId)) {
            const scriptEl = document.querySelector(`script[data-src="${BASE_PATH}${animAssetId}/${animAssetId}.bundle.js"]`)
            if (scriptEl) scriptEl.remove()
            loadedBundles.delete(animAssetId)
            bundleLoadPromises.delete(animAssetId)
            await ensureBundle(animAssetId)
            if (cancelled) return
            found = resolveComposition(window.AdobeAn)
            if (!found) { setPhase('error'); return }
          } else {
            setPhase('error'); return
          }
        }
        const comp = found.comp

        const lib = comp.getLibrary()
        const images = comp.getImages()
        const ss = comp.getSpriteSheet()
        const manifest: Array<{ src: string; id: string }> = lib.properties.manifest || []

        // 强制清空 Canvas 像素缓冲区，避免旧 Stage 残留帧覆盖新内容
        const ctx = canvasRef.current.getContext('2d')
        if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)

        const stage = new lib.Stage(canvasRef.current)
        stageRef.current = stage

        const setupMovieClip = () => {
          if (cancelled) return
          const ssMetadata = lib.ssMetadata || []
          for (const meta of ssMetadata) {
            const img = images[meta.name]
            if (img) ss[meta.name] = new cjs.SpriteSheet({ images: [img], frames: meta.frames })
          }

          // 找主类（有 tickLoopCheck 注入方法）
          const mainClassName = Object.keys(lib).find(
            k => typeof lib[k] === 'function' && lib[k].prototype?.tickLoopCheck
          )
          if (!mainClassName) { setPhase('error'); return }
          const MainClass = lib[mainClassName]
          if (!MainClass) { setPhase('error'); return }

          const exportRoot = new MainClass()
          exportRootRef.current = exportRoot

          // Fix Adobe Animate 导出 bug：frame_0 闭包里用了未定义的 _this。
          // 该引用已被 timeline tween 持有，无法替换。覆盖 gotoAndPlay 兜底。
          if (typeof (exportRoot as any).frame_0 === 'function') {
            const origGAP = exportRoot.gotoAndPlay.bind(exportRoot)
            exportRoot.gotoAndPlay = function (this: any, label: string) {
              try { origGAP(label) } catch (e: any) {
                if (e instanceof ReferenceError && String(e.message).includes('_this')) return
                throw e
              }
            }
          }

          stage.addChild(exportRoot)
          cjs.Ticker.setFPS(lib.properties.fps || 30)
          cjs.Ticker.addEventListener('tick', stage)

          // 方案 B：每帧检测边界，自动循环/归位
          const loopChecker = () => {
            if (exportRoot.tickLoopCheck) exportRoot.tickLoopCheck()
          }
          loopCheckerRef.current = loopChecker
          cjs.Ticker.addEventListener('tick', loopChecker)

          exportRoot.gotoAndPlay('idle')
          setPhase('ready')
          log.info('phase=ready, compId=', found.id, 'assetId=', animAssetId)
        }

        if (manifest.some(e => !e.src.startsWith('data:'))) {
          const loader = new cjs.LoadQueue(false)
          loader.addEventListener('fileload', (evt: any) => {
            if (evt?.item?.type === 'image') images[evt.item.id] = evt.result
          })
          loader.addEventListener('complete', () => setupMovieClip())
          loader.loadManifest(manifest)
        } else {
          await Promise.all(manifest.map(e => new Promise<void>(resolve => {
            if (e.src.startsWith('data:')) {
              const img = new Image()
              img.onload = () => { images[e.id] = img; resolve() }
              img.onerror = () => resolve()
              img.src = e.src
            } else resolve()
          })))
          setupMovieClip()
        }
      } catch (err) {
        log.error('init error:', err, 'animAssetId=', animAssetId)
        if (!cancelled) setPhase('error')
      }
    }

    init()
    return () => {
      cancelled = true
      const cjs = window.createjs
      if (loopCheckerRef.current && cjs) {
        try { cjs.Ticker.removeEventListener('tick', loopCheckerRef.current) } catch {}
      }
      if (stageRef.current && cjs) {
        try { cjs.Ticker.removeEventListener('tick', stageRef.current) } catch {}
        stageRef.current.removeAllChildren?.()
        stageRef.current.clear?.()
      }
      stageRef.current = null
      exportRootRef.current = null
    }
  }, [selectedChar, animAssetId])

  // ===== 皮肤切换闪烁反馈 =====
  React.useEffect(() => {
    if (prevSkinIdRef.current !== currentSkinId) {
      setSkinFlash(true)
      const timer = setTimeout(() => setSkinFlash(false), 1500)
      prevSkinIdRef.current = currentSkinId
      return () => clearTimeout(timer)
    }
  }, [currentSkinId])

  // ===== 沙雕币获得：浮动 +N + 数字翻滚 =====
  // 首次加载时同步 displayCoins，避免页面刷新后残留 0
  React.useEffect(() => {
    if (coins !== undefined && prevCoinsRef.current === undefined) {
      prevCoinsRef.current = coins
      setDisplayCoins(coins)
    }
  }, [coins])

  React.useEffect(() => {
    if (coins === undefined) return
    const prev = prevCoinsRef.current
    if (prev === undefined) {
      prevCoinsRef.current = coins
      setDisplayCoins(coins)
      return
    }
    if (coins <= prev) {
      // 余额未增加（不变/减少）→ 直接更新，不加动画
      prevCoinsRef.current = coins
      setDisplayCoins(coins)
      return
    }

    const delta = coins - prev
    prevCoinsRef.current = coins

    // 浮动 "+N" 文字
    const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
    setFloatingTexts((prevFloats) => [...prevFloats, { id, amount: delta }])
    // 900ms 后清理（与 CSS animation 时长对齐）
    setTimeout(() => {
      setFloatingTexts((prevFloats) => prevFloats.filter((f) => f.id !== id))
    }, 950)

    // 数字翻滚动画
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    const startValue = prev
    const endValue = coins
    const duration = 360 // ms
    const startTime = performance.now()

    const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutCubic(progress)
      const current = Math.round(startValue + (endValue - startValue) * eased)
      setDisplayCoins(current)

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        setDisplayCoins(endValue)
      }
    }
    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [coins])

  // ===== 状态变化 — 方案 B：只需 gotoAndPlay，循环/归位由注入的 tickLoopCheck 自动处理 =====
  React.useEffect(() => {
    const root = exportRootRef.current
    if (!root || phase !== 'ready') return
    if (state === prevStateRef.current) return
    prevStateRef.current = state

    try { root.gotoAndPlay(state) } catch {}
  }, [state, phase])

  // ===== 响应式缩放 =====
  const [scale, setScale] = React.useState(1)
  React.useEffect(() => {
    const update = () => {
      if (!containerRef.current) return
      const w = containerRef.current.clientWidth
      if (w > 0) setScale(w / 360)
    }
    update()
    const obs = new ResizeObserver(update)
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden rounded-2xl border-2 border-border/60 bg-muted/30',
        'flex items-center justify-center transition-shadow duration-300',
        onCanvasClick && 'cursor-pointer hover:ring-2 hover:ring-primary/30',
        skinFlash && 'ring-2 ring-primary/40 shadow-lg shadow-primary/20',
        className,
      )}
      onClick={onCanvasClick}
    >
      {phase !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <Placeholder state={state} />
          <span className="text-[10px] text-muted-foreground">
            {phase === 'loading' ? '加载中...' : '加载失败'}
          </span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={360}
        height={640}
        style={{
          width: Math.max(360 * scale, 1),
          height: Math.max(640 * scale, 1),
          display: phase === 'ready' ? 'block' : 'none',
        }}
      />
      {/* 状态文字 — Canvas 内部左上角 */}
      <div className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-background/80 backdrop-blur-sm text-[10px] text-muted-foreground font-medium select-none pointer-events-none">
        {skinFlash ? `✨ 已更换：${selectedChar?.equipped_skin?.name ?? ''}` : RIVE_STATE_LABELS[state]}
      </div>
      {/* 战绩 badge — Canvas 内部右下角（用户级终身战绩，点击与 canvas 同行为 → 打开历练 tab） */}
      {pveStatus && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-background/80 backdrop-blur-sm text-[10px] text-sky-500 font-medium select-none">
          <span className="pointer-events-none">🏆 {pveStatus.pveWins} · 💀 {pveStatus.pveLosses}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                className="pointer-events-auto cursor-help inline-flex size-3.5 items-center justify-center rounded-full bg-sky-500/15 text-sky-500 hover:bg-sky-500/25 transition-colors text-[9px] font-bold leading-none"
                aria-label="什么是战绩？"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}
              >
                ?
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[220px]">
              <p className="text-xs leading-relaxed">终身 PvE 战绩，胜/负累计，不随切人物清零</p>
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      {/* 沙雕币 — Canvas 内部左下角（含右侧的 ? 帮助 tooltip） */}
      {displayCoins !== undefined && (
        <div className="absolute bottom-2 left-2 px-2.5 py-0.5 rounded-full bg-background/80 backdrop-blur-sm text-[10px] text-amber-500 font-medium select-none flex items-center gap-1">
          {/* 浮动 +N 文字 */}
          {floatingTexts.map((ft) => (
            <span key={ft.id} className="coin-float-text">
              +{ft.amount.toLocaleString()}
            </span>
          ))}
          {/* 币值展示 — 非交互 */}
          <span className="pointer-events-none flex items-center gap-1">
            <span>💰</span>
            <span className="tabular-nums">{displayCoins.toLocaleString()}</span>
          </span>
          {/* 沙雕币帮助 tooltip — 合并到沙雕币右侧 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                className="pointer-events-auto cursor-help inline-flex size-3.5 items-center justify-center rounded-full bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 transition-colors text-[9px] font-bold leading-none"
                aria-label="什么是沙雕币？"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}
              >
                ?
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px]">
              <p className="text-xs leading-relaxed">
                与沙雕智能体 Agent 对话自动获得沙雕币（不可直接购买）
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                消耗词元即百分百掉落沙雕币。收集沙雕币可在「皮肤盲盒」抽皮肤！
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
