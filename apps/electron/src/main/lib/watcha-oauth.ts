/**
 * 观猹（Watcha）OAuth 本地回调承接
 *
 * 负责「打开系统浏览器授权 → 本地 HTTP server 承接 code → 调后端 callback 换 token」。
 * 只监听 127.0.0.1，收到回调即关；state 由后端生成、客户端透传并做首次比对。
 *
 * 观猹无 redirect_uri 后台配置，redirect_uri 由后端下发（authorize-url 响应的
 * redirect_uri 字段），客户端据此解析监听端口与路径，不硬编码。
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { shell } from 'electron'
import { createLogger } from '@shadiao/shared'
import { getDefaultBaseUrl, completeWatchaLogin } from './django-client'

const log = createLogger('watcha-oauth')

/** 授权等待超时（对齐后端 OAuthState 过期 10 分钟，客户端略短，先超时） */
const OAUTH_TIMEOUT_MS = 10 * 60_000

export interface WatchaOAuthResult {
  success: boolean
  /** 观猹首登（后端已建默认角色/皮肤/试用币） */
  isNewUser?: boolean
  /** 用户主动取消（含 error=access_denied） */
  cancelled?: boolean
  error?: string
}

let server: Server | null = null
let pendingState: string | null = null
let timeoutTimer: ReturnType<typeof setTimeout> | null = null
let onResult: ((result: WatchaOAuthResult) => void) | null = null

/** 脱敏：只保留前几位，避免日志泄露敏感信息 */
function mask(value: string, keep = 6): string {
  if (!value) return ''
  return value.length <= keep ? value : value.slice(0, keep) + '…'
}

/** 结束并清理本地 server、定时器、进行中状态 */
function cleanup(): void {
  if (timeoutTimer) {
    clearTimeout(timeoutTimer)
    timeoutTimer = null
  }
  if (server) {
    try { server.close() } catch { /* 已关闭 */ }
    server = null
  }
  pendingState = null
  onResult = null
}

/** 安全写响应，忽略连接已断等写入异常 */
function safeEnd(res: ServerResponse, status: number, body: string): void {
  try {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(body)
  } catch (err) {
    log.warn('回调响应写入失败:', err)
  }
}

/** 结束流程并回传结果（清理后回调，确保只触发一次） */
function finish(result: WatchaOAuthResult, res: ServerResponse, html: string): void {
  safeEnd(res, 200, html)
  const cb = onResult
  cleanup()
  cb?.(result)
}

function pageHtml(title: string, message: string, ok: boolean): string {
  const color = ok ? '#16a34a' : '#dc2626'
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fafafa;color:#18181b}.card{text-align:center}.icon{font-size:40px;color:${color}}.msg{font-size:16px;margin-top:8px;color:#52525b}</style>
</head><body><div class="card"><div class="icon">${ok ? '✓' : '✗'}</div><div class="msg">${message}</div></div></body></html>`
}

/** 解析后端下发的 redirect_uri，得到监听端口与回调路径 */
function parseRedirectUri(redirectUri: string): { port: number; path: string } {
  const u = new URL(redirectUri)
  // http 未显式给端口时，默认 80；生产联调统一用显式端口（如 51820）
  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80)
  return { port, path: u.pathname + u.search }
}

/**
 * 发起观猹 OAuth 登录。
 *
 * @param onResult 最终结果回调（成功/失败/取消/超时），由调用方转发给渲染进程
 * @returns 发起成功后 resolve（渲染层据此进入「等待授权」态）；失败时抛错
 */
export async function startWatchaOAuth(onResultCb: (result: WatchaOAuthResult) => void): Promise<void> {
  // 已有进行中的流程，先静默结束旧的（不回调旧的 onResult，避免干扰新流程）
  if (server || pendingState || onResult) {
    log.warn('已有观猹 OAuth 流程进行中，先结束旧的')
    cleanup()
  }

  const baseUrl = getDefaultBaseUrl()
  log.info(`观猹 OAuth 开始，后端 baseUrl=${baseUrl}`)

  // 1. 拿授权链接
  const r = await fetch(baseUrl + '/api/auth/oauth/watcha/authorize-url')
  if (!r.ok) {
    throw new Error('获取观猹授权链接失败: ' + r.status)
  }
  const data = await r.json() as { authorize_url?: string; state?: string; redirect_uri?: string }
  if (!data.authorize_url || !data.state || !data.redirect_uri) {
    throw new Error('后端 authorize-url 响应缺少 authorize_url/state/redirect_uri 字段')
  }
  const { authorize_url, state, redirect_uri } = data
  log.info(`观猹 authorize-url 已获取，state=${mask(state, 8)}，redirect_uri=${redirect_uri}`)

  // 2. 解析监听端口与路径
  const { port, path } = parseRedirectUri(redirect_uri)
  log.info(`观猹本地回调 server 准备监听 127.0.0.1:${port}${path}`)

  // 3. 起本地 server
  pendingState = state
  onResult = onResultCb

  server = createServer((req, res) => {
    void handleCallback(req, res).catch((err) => {
      log.error('观猹回调处理异常:', err)
      safeEnd(res, 500, pageHtml('登录失败', '处理回调时出错，请返回应用重试', false))
      const cb = onResult
      cleanup()
      cb?.({ success: false, error: err instanceof Error ? err.message : String(err) })
    })
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    log.error(`观猹本地回调 server 运行期错误 (127.0.0.1:${port}):`, err)
  })

  // 3.1 监听端口（EADDRINUSE 等在此捕获并回传结果）
  try {
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject)
      server!.listen(port, '127.0.0.1', () => resolve())
    })
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    log.error(`观猹本地回调 server 启动失败 (127.0.0.1:${port}):`, e.message)
    const cb = onResult
    cleanup()
    cb?.({
      success: false,
      error: e.code === 'EADDRINUSE'
        ? `本地回调端口 ${port} 被占用，请关闭占用进程后重试`
        : '本地回调服务启动失败: ' + e.message,
    })
    return
  }

  // 4. 打开系统浏览器授权
  log.info('观猹打开系统浏览器授权: ' + authorize_url)
  await shell.openExternal(authorize_url)

  // 5. 超时兜底
  timeoutTimer = setTimeout(() => {
    log.warn('观猹 OAuth 授权超时，取消等待')
    const cb = onResult
    cleanup()
    cb?.({ success: false, error: '授权超时，请重新登录' })
  }, OAUTH_TIMEOUT_MS)
}

async function handleCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  log.info(`观猹收到本地回调: path=${url.pathname}, hasCode=${!!code}, state=${mask(state ?? '', 8)}, error=${error ?? ''}`)

  // 用户拒绝 / 授权失败
  if (error) {
    const desc = url.searchParams.get('error_description') ?? ''
    log.warn(`观猹授权被拒: error=${error}${desc ? ' desc=' + desc : ''}`)
    const cancelled = error === 'access_denied'
    finish(
      { success: false, cancelled, error: cancelled ? '您已取消观猹授权' : (desc || error) },
      res,
      pageHtml(cancelled ? '已取消' : '授权失败', cancelled ? '您已取消观猹授权，可返回应用' : (desc || error), false),
    )
    return
  }

  // 缺少参数或 state 不匹配：非法/无关请求，忽略但保持 server 继续等正确回调
  if (!code || !state || state !== pendingState) {
    log.warn(`观猹回调参数非法（code 缺失=${!code}, state 不匹配=${state !== pendingState}），忽略本次请求`)
    safeEnd(res, 400, pageHtml('无效请求', '回调参数无效', false))
    return
  }

  // state 匹配，换 token
  log.info(`观猹回调 state 匹配，开始换 token, code=${mask(code)}`)
  try {
    const { auth, isNewUser } = await completeWatchaLogin(code, state)
    log.info(`观猹登录成功: username=${auth.username}, isNewUser=${isNewUser}`)
    finish(
      { success: true, isNewUser },
      res,
      pageHtml('登录成功', '观猹登录成功，请返回沙雕智能体', true),
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('观猹 callback 换 token 失败:', msg)
    finish({ success: false, error: msg }, res, pageHtml('登录失败', msg, false))
  }
}

/** 取消进行中的观猹 OAuth 流程（用户点取消 / 重新发起） */
export function cancelWatchaOAuth(reason = '用户取消'): void {
  log.info(`观猹 OAuth 取消: ${reason}`)
  const cb = onResult
  cleanup()
  // 主动取消给空 error，渲染层据此静默复位，不弹错误
  cb?.({ success: false, cancelled: true, error: '' })
}
