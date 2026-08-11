import * as React from 'react'
import { cn } from '@/lib/utils'
import { createLogger } from '@shadiao/shared'

const log = createLogger('AuthCharacterAnim')

declare global {
  interface Window {
    createjs: any
    AdobeAn: any
  }
}

const BASE_PATH = './characters/'

/** 「普通」稀有度角色列表 — 每次组件挂载随机选一个 */
const COMMON_CHARACTERS = [
  '乞丐虾仁',
  '寻芳阁女子',
  '大魏小卒虾仁',
  '大魏山匪',
  '村花小翠',
  '村草小刘',
]

function pickRandomCharacter(): string {
  return COMMON_CHARACTERS[Math.floor(Math.random() * COMMON_CHARACTERS.length)]
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

function resolveComposition(an: any): { comp: any; id: string } | null {
  const comps: Record<string, any> = an?.compositions ?? {}
  const ids = Object.keys(comps)
  if (ids.length === 0) return null
  const id = ids[0]
  return { comp: comps[id], id }
}

function clearCompositions(an: any): void {
  const comps: Record<string, any> = an?.compositions ?? {}
  for (const key of Object.keys(comps)) {
    delete comps[key]
  }
}

interface AuthCharacterAnimProps { className?: string }

export function AuthCharacterAnim({ className }: AuthCharacterAnimProps): React.ReactElement {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const stageRef = React.useRef<any>(null)
  const loopCheckerRef = React.useRef<(() => void) | null>(null)
  const [phase, setPhase] = React.useState<'loading' | 'ready' | 'error'>('loading')
  const [characterName, setCharacterName] = React.useState('')

  // 随机选角色（只选一次）
  const animAssetIdRef = React.useRef<string>('')

  React.useEffect(() => {
    const picked = pickRandomCharacter()
    animAssetIdRef.current = picked
    let cancelled = false

    async function init() {
      try {
        const anBefore = window.AdobeAn
        clearCompositions(anBefore)

        await ensureBundle(picked)
        if (cancelled) return

        const cjs = window.createjs
        const an = window.AdobeAn
        if (!cjs || !an || !canvasRef.current) { setPhase('error'); return }

        let found = resolveComposition(an)
        if (!found) {
          // 重新加载
          const scriptEl = document.querySelector(`script[data-src="${BASE_PATH}${picked}/${picked}.bundle.js"]`)
          if (scriptEl) scriptEl.remove()
          loadedBundles.delete(picked)
          bundleLoadPromises.delete(picked)
          await ensureBundle(picked)
          if (cancelled) return
          found = resolveComposition(window.AdobeAn)
          if (!found) { setPhase('error'); return }
        }
        const comp = found.comp

        const lib = comp.getLibrary()
        const images = comp.getImages()
        const ss = comp.getSpriteSheet()
        const manifest: Array<{ src: string; id: string }> = lib.properties.manifest || []

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

          const mainClassName = Object.keys(lib).find(
            k => typeof lib[k] === 'function' && lib[k].prototype?.tickLoopCheck
          )
          if (!mainClassName) { setPhase('error'); return }
          const MainClass = lib[mainClassName]
          if (!MainClass) { setPhase('error'); return }

          const exportRoot = new MainClass()

          // Fix Adobe Animate 导出 bug
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

          const loopChecker = () => {
            if (exportRoot.tickLoopCheck) exportRoot.tickLoopCheck()
          }
          loopCheckerRef.current = loopChecker
          cjs.Ticker.addEventListener('tick', loopChecker)

          // 只播放 idle，永远不切换到其他状态
          exportRoot.gotoAndPlay('idle')
          setCharacterName(picked)
          setPhase('ready')
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
        log.error('AuthCharacterAnim init error:', err)
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
    }
  }, [])

  // ===== 响应式缩放（取宽高较小比例，确保完全适配容器） =====
  const [scale, setScale] = React.useState(1)
  React.useEffect(() => {
    const update = () => {
      if (!containerRef.current) return
      const w = containerRef.current.clientWidth
      const h = containerRef.current.clientHeight
      if (w > 0 && h > 0) setScale(Math.min(w / 360, h / 640))
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
        'relative overflow-hidden rounded-2xl border border-border/40 bg-muted/20',
        'flex items-center justify-center',
        className,
      )}
    >
      {/* 加载 / 错误占位 */}
      {phase !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <div className="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-400/20 to-orange-400/20">
            <span className="text-3xl">
              {phase === 'loading' ? '🦐' : '😵'}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {phase === 'loading' ? '人物加载中...' : '加载失败'}
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
      {/* 人物名标签 */}
      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-background/80 backdrop-blur-sm text-[10px] text-muted-foreground font-medium select-none pointer-events-none">
        {characterName}
      </div>
      {/* 底部标语 */}
      <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-amber-500/10 text-[10px] text-amber-500 font-medium select-none pointer-events-none whitespace-nowrap">
        🎁 注册即送 50,000 沙雕币
      </div>
    </div>
  )
}
