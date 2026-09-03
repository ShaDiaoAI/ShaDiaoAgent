/**
 * PvE（历练）SSE 消费（main 进程）
 *
 * 原则：SSE 由 main 消费，renderer 不直连。理由：
 * ① Django token 在 main（django-client getAuthState）；
 * ② 复用 agent 流式 webContents.send 范式；
 * ③ 断线时战斗照常结算，main 持流更稳。
 *
 * 并发锁（双保险）：main 维护 activeBattle 引用，已有进行中战斗则返回
 * { success:false, error:'已有进行中的历练' }；前端 pveStartBattle 也会在
 * phase !== 'idle' 时直接 return（按钮禁用）。
 */

import type { WebContents } from 'electron'
import { getAuthState } from './django-client.js'
import { createLogger } from '@shadiao/shared'

const log = createLogger('PvE')

/** 进行中的战斗 AbortController（并发锁）。overlay 手动关闭不 abort，仅应用退出可 abort。 */
let activeBattle: AbortController | null = null

export function hasActiveBattle(): boolean {
  return activeBattle !== null
}

/** 仅在应用退出/窗口关闭时调用（后端断线照常结算，不 abort 也不丢结果）。 */
export function abortActiveBattle(): void {
  if (activeBattle) {
    activeBattle.abort()
    activeBattle = null
  }
}

export interface StartPveBattleResult {
  success: boolean
  error?: string
}

type PveStreamEventHandler = (event: string, data: unknown) => void

/** 解析单个 SSE 帧（`event: X\ndata: Y`），忽略 comment 帧（以 : 开头）。 */
function handleFrame(frame: string, onEvent: PveStreamEventHandler): void {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith(':')) continue // comment / heartbeat 帧
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''))
    }
  }
  if (dataLines.length === 0) return
  const raw = dataLines.join('\n')
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    log.warn('SSE data 解析失败:', raw)
    return
  }
  onEvent(event, data)
}

/**
 * 逐帧读取 SSE 流。静默（casting → damage 之间 LLM 可静默几十秒）属正常态，
 * 不设 idle timeout；若线上出现静默断连，再补后端 heartbeat（comment 帧）保活。
 */
async function readSseStream(body: ReadableStream<Uint8Array>, onEvent: PveStreamEventHandler): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  const SEP = /\r?\n\r?\n/

  for (;;) {
    const { done, value } = await reader.read()
    if (!done) buffer += decoder.decode(value, { stream: true })

    // 处理所有完整帧（以空行分隔）
    let m: RegExpExecArray | null
    while ((m = SEP.exec(buffer)) !== null) {
      const frame = buffer.slice(0, m.index)
      buffer = buffer.slice(m.index + m[0].length)
      handleFrame(frame, onEvent)
    }

    if (done) {
      // 末尾可能残留无空行结尾的帧
      if (buffer.trim()) handleFrame(buffer, onEvent)
      break
    }
  }
}

function statusError(res: Response): string {
  switch (res.status) {
    case 402: return '余额不足，请先充值'
    case 404: return '人物不存在或不属于当前用户'
    case 401: return '未认证，请重新登录'
    case 409: return '已有进行中的历练'
    default: return `历练请求失败 (${res.status})`
  }
}

export async function startPveBattle(
  characterId: number,
  webContents: WebContents,
): Promise<StartPveBattleResult> {
  if (activeBattle) return { success: false, error: '已有进行中的历练' }
  const s = getAuthState()
  if (!s.token) return { success: false, error: '未登录' }

  const controller = new AbortController()
  activeBattle = controller

  const clearLock = () => {
    if (activeBattle === controller) activeBattle = null
  }

  let res: Response
  try {
    res = await fetch(s.baseUrl + '/api/pve/battle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + s.token,
        'x-api-key': s.token,
      },
      body: JSON.stringify({ character_id: characterId }),
      signal: controller.signal,
    })
  } catch (e) {
    clearLock()
    const err = e as { name?: string; message?: string }
    if (err?.name === 'AbortError') return { success: false, error: '已中止' }
    return { success: false, error: String(err?.message || '网络错误') }
  }

  // 非 2xx：不进战斗，直接回 error（不读流）
  if (!res.ok) {
    clearLock()
    let error = statusError(res)
    try {
      const d = (await res.json()) as Record<string, unknown>
      if (typeof d.detail === 'string' && d.detail) error = d.detail
    } catch { /* 无 JSON body，用默认文案 */ }
    return { success: false, error }
  }

  if (!res.body) {
    clearLock()
    return { success: false, error: '响应无数据流' }
  }

  log.info('PvE 战斗已发起, characterId=', characterId)

  // 成功：后台读流逐事件推送，invoke 立即返回（battle_id 由 battle_start 事件携带）
  void (async () => {
    try {
      await readSseStream(res.body as ReadableStream<Uint8Array>, (event, data) => {
        log.info('PvE 转发事件:', event, 'data=', JSON.stringify(data))
        if (webContents.isDestroyed()) return
        webContents.send('pve:stream-event', { event, data })
      })
    } catch (e) {
      const err = e as { name?: string; message?: string }
      if (err?.name === 'AbortError') return
      log.warn('读流中断:', e)
      if (!webContents.isDestroyed()) {
        webContents.send('pve:stream-event', {
          event: 'error',
          data: { message: String(err?.message || '网络中断') },
        })
      }
    } finally {
      clearLock()
    }
  })()

  return { success: true }
}
