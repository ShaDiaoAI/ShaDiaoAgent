import * as React from 'react'
import { cn } from '@/lib/utils'

declare global {
  interface Window {
    createjs: any
    AdobeAn: any
  }
}

const BASE_PATH = './characters/'
const GACHA_ASSET_ID = '开盲盒'
const CANVAS_WIDTH = 640
const CANVAS_HEIGHT = 640

/**
 * GachaAnim 暴露给父组件的方法
 */
export interface GachaAnimHandle {
  /** 播放指定标签的动画（box1-5, box12345）。瞬态播完自动回 idle */
  play: (label: string) => void
  /** 立即回到 idle */
  reset: () => void
}

interface GachaAnimProps {
  className?: string
  /** 动画播放结束回调（标签名从非 idle 切回 idle 时触发） */
  onAnimationEnd?: (label: string) => void
  /** Bundle 加载完毕回调 */
  onReady?: () => void
}

// ===== Composition 解析 =====
function resolveComposition(an: any): { comp: any; id: string } | null {
  const comps: Record<string, any> = an?.compositions ?? {}
  const ids = Object.keys(comps)
  if (ids.length === 0) return null
  const id = ids[0]
  return { comp: comps[id], id }
}

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

async function ensureBundle(name: string, bundlePath: string): Promise<void> {
  if (loadedBundles.has(name)) return
  let p = bundleLoadPromises.get(name)
  if (!p) {
    p = ensureCreatejs().then(() => loadScript(bundlePath))
    bundleLoadPromises.set(name, p)
  }
  await p
  loadedBundles.add(name)
}

// ===== Fallback =====
function Placeholder({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
      <div className="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-400/30 to-orange-400/30 shadow-lg">
        <span className="text-3xl">🎁</span>
      </div>
      <span className="text-[10px] text-muted-foreground">{message}</span>
    </div>
  )
}

// ===== 主组件 =====
export const GachaAnim = React.forwardRef<GachaAnimHandle, GachaAnimProps>(
  function GachaAnim({ className, onAnimationEnd, onReady }, ref) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null)
    const containerRef = React.useRef<HTMLDivElement>(null)
    const stageRef = React.useRef<any>(null)
    const exportRootRef = React.useRef<any>(null)
    const loopCheckerRef = React.useRef<(() => void) | null>(null)
    const onAnimEndRef = React.useRef(onAnimationEnd)
    onAnimEndRef.current = onAnimationEnd
    const onReadyRef = React.useRef(onReady)
    onReadyRef.current = onReady
    const prevLabelRef = React.useRef<string>('idle')
    const [phase, setPhase] = React.useState<'loading' | 'ready' | 'error'>('loading')

    // 动画结束检测：当 __label 从非 idle 切到 idle 时触发回调
    const animEndChecker = React.useCallback(() => {
      const root = exportRootRef.current
      if (!root) return
      const currentLabel = root.__label
      if (prevLabelRef.current && prevLabelRef.current !== 'idle' && currentLabel === 'idle') {
        onAnimEndRef.current?.(prevLabelRef.current)
      }
      prevLabelRef.current = currentLabel
    }, [])

    // ===== 初始化 Canvas =====
    React.useEffect(() => {
      let cancelled = false

      async function init() {
        try {
          const bundlePath = `${BASE_PATH}${GACHA_ASSET_ID}/${GACHA_ASSET_ID}.bundle.js`

          const anBefore = window.AdobeAn
          clearCompositions(anBefore)

          await ensureBundle(GACHA_ASSET_ID, bundlePath)
          if (cancelled) return

          const cjs = window.createjs
          const an = window.AdobeAn
          if (!cjs || !an || !canvasRef.current) { setPhase('error'); return }

          let found = resolveComposition(an)
          if (!found) {
            if (loadedBundles.has(GACHA_ASSET_ID)) {
              const scriptEl = document.querySelector(`script[data-src="${bundlePath}"]`)
              if (scriptEl) scriptEl.remove()
              loadedBundles.delete(GACHA_ASSET_ID)
              bundleLoadPromises.delete(GACHA_ASSET_ID)
              await ensureBundle(GACHA_ASSET_ID, bundlePath)
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

          const ctx = canvasRef.current.getContext('2d')
          if (ctx) ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

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

            // Fix Adobe Animate 导出 bug：frame_0 闭包里用了未定义的 _this
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

            // tickLoopCheck（build-character.mjs 注入的循环检测）
            const loopChecker = () => {
              if (exportRoot.tickLoopCheck) exportRoot.tickLoopCheck()
            }
            loopCheckerRef.current = loopChecker
            cjs.Ticker.addEventListener('tick', loopChecker)

            // 动画结束检测（在 tickLoopCheck 之后运行）
            cjs.Ticker.addEventListener('tick', animEndChecker)

            exportRoot.gotoAndPlay('idle')
            setPhase('ready')
            onReadyRef.current?.()
            console.log('[GachaAnim] phase=ready, compId=', found.id)
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
          console.error('[GachaAnim] init error:', err)
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
        if (cjs) {
          try { cjs.Ticker.removeEventListener('tick', animEndChecker) } catch {}
        }
        if (stageRef.current && cjs) {
          try { cjs.Ticker.removeEventListener('tick', stageRef.current) } catch {}
          stageRef.current.removeAllChildren?.()
          stageRef.current.clear?.()
        }
        stageRef.current = null
        exportRootRef.current = null
      }
    }, [animEndChecker])

    // ===== 暴露方法 =====
    React.useImperativeHandle(ref, () => ({
      play(label: string) {
        const root = exportRootRef.current
        if (!root || phase !== 'ready') return
        prevLabelRef.current = label
        try { root.gotoAndPlay(label) } catch {}
      },
      reset() {
        const root = exportRootRef.current
        if (!root || phase !== 'ready') return
        prevLabelRef.current = 'idle'
        try { root.gotoAndPlay('idle') } catch {}
      },
    }), [phase])

    // ===== 响应式缩放 =====
    const [scale, setScale] = React.useState(1)
    React.useEffect(() => {
      const update = () => {
        if (!containerRef.current) return
        const w = containerRef.current.clientWidth
        if (w > 0) setScale(w / CANVAS_WIDTH)
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
          'flex items-center justify-center',
          className,
        )}
      >
        {phase !== 'ready' && (
          <Placeholder message={phase === 'loading' ? '加载中...' : '加载失败'} />
        )}
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={{
            width: Math.max(CANVAS_WIDTH * scale, 1),
            height: Math.max(CANVAS_HEIGHT * scale, 1),
            display: phase === 'ready' ? 'block' : 'none',
          }}
        />
      </div>
    )
  },
)
