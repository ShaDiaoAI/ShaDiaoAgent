/**
 * Agent 服务层（IPC 薄层）
 *
 * 职责：
 * - 创建 AgentOrchestrator / EventBus / Adapter 实例
 * - 注册 EventBus IPC 转发中间件（webContents.send）
 * - 导出 IPC handler 调用的薄包装函数
 * - 文件操作（saveFilesToAgentSession）
 *
 * 所有业务逻辑已委托给 AgentOrchestrator。
 */

import { join, dirname } from 'node:path'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { BrowserWindow } from 'electron'
import type { WebContents } from 'electron'
import { AGENT_IPC_CHANNELS, MAX_ATTACHMENT_SIZE } from '@shadiao/shared'
import type {
  AgentSendInput,
  AgentGenerateTitleInput,
  AgentSaveFilesInput,
  AgentSaveWorkspaceFilesInput,
  AgentSavedFile,
  AgentStreamEvent,
  AgentStreamPayload,
  AgentQueueMessageInput,
  PromaPermissionMode,
  AgentExternalRunSource,
  AgentMessage,
} from '@shadiao/shared'
import { ClaudeAgentAdapter, scanAndKillOrphanedClaudeSubprocesses } from './adapters/claude-agent-adapter'
import { AgentEventBus } from './agent-event-bus'
import { AgentOrchestrator } from './agent-orchestrator'
import { getAgentSessionWorkspacePath, getWorkspaceFilesDir } from './config-paths'
import { getAgentSessionMeta, updateAgentSessionMeta } from './agent-session-manager'
import { setAgentStopper, setHeadlessAgentRunner } from './agent-headless-runner-registry'

// ===== 实例创建 =====

const eventBus = new AgentEventBus()
const adapter = new ClaudeAgentAdapter()
const orchestrator = new AgentOrchestrator(adapter, eventBus)

export { eventBus as agentEventBus }

/**
 * 会话 → webContents 映射
 */
const sessionWebContents = new Map<string, WebContents>()
const wcWithCleanupHook = new WeakSet<WebContents>()

function registerWebContents(sessionId: string, wc: WebContents): void {
  sessionWebContents.set(sessionId, wc)
  if (wcWithCleanupHook.has(wc)) return
  wcWithCleanupHook.add(wc)
  wc.once('destroyed', () => {
    for (const [sid, mappedWc] of sessionWebContents) {
      if (mappedWc === wc) sessionWebContents.delete(sid)
    }
  })
}

function isMainRendererWindow(win: BrowserWindow): boolean {
  if (win.isDestroyed()) return false
  const url = win.webContents.getURL()
  if (!url) return false
  if (url.startsWith('data:')) return false
  return !url.includes('window=detached-preview')
}

function getMainRendererWebContents(): WebContents | null {
  const win = BrowserWindow.getAllWindows().find(isMainRendererWindow)
  return win && !win.webContents.isDestroyed() ? win.webContents : null
}

// ===== EventBus IPC 转发中间件 =====

eventBus.use((sessionId, payload, next) => {
  const wc = sessionWebContents.get(sessionId)
  if (wc && !wc.isDestroyed()) {
    try {
      wc.send(AGENT_IPC_CHANNELS.STREAM_EVENT, { sessionId, payload } as AgentStreamEvent)
    } catch (err) {
      console.error(`[EventBus] wc.send 失败: ${sessionId}`, err)
    }
  }
  next()
})

// ===== IPC 薄包装函数 =====

export async function runAgent(
  input: AgentSendInput,
  webContents: WebContents,
): Promise<void> {
  registerWebContents(input.sessionId, webContents)
  try {
    updateAgentSessionMeta(input.sessionId, { completedButUnconfirmed: false })
  } catch { /* 新会话 */ }

  if (input.triggeredBy !== 'automation') {
    try {
      const meta = getAgentSessionMeta(input.sessionId)
      if (meta?.sourceAutomationId && !meta.automationGraduated) {
        updateAgentSessionMeta(input.sessionId, { automationGraduated: true })
        eventBus.emit(input.sessionId, {
          kind: 'proma_event',
          event: { type: 'automation_graduated' },
        })
      }
    } catch { /* 新会话 */ }
  }

  try {
    await orchestrator.sendMessage(input, {
      onError: (error) => {
        if (!webContents.isDestroyed()) {
          webContents.send(AGENT_IPC_CHANNELS.STREAM_ERROR, { sessionId: input.sessionId, error })
        }
      },
      onComplete: (messages, opts) => {
        if (!webContents.isDestroyed()) {
          webContents.send(AGENT_IPC_CHANNELS.STREAM_COMPLETE, {
            sessionId: input.sessionId, messages,
            stoppedByUser: opts?.stoppedByUser ?? false,
            startedAt: opts?.startedAt,
            resultSubtype: opts?.resultSubtype,
            resultErrors: opts?.resultErrors,
            backgroundTasksPending: opts?.backgroundTasksPending,
          })
        }
      },
      onTitleUpdated: (title) => {
        eventBus.emit(input.sessionId, { kind: 'proma_event', event: { type: 'title_updated', title } })
        if (!webContents.isDestroyed()) {
          webContents.send(AGENT_IPC_CHANNELS.TITLE_UPDATED, { sessionId: input.sessionId, title })
        }
      },
    })
  } catch (err) {
    console.error('[Agent 服务] runAgent 异常:', err)
    const errorMessage = err instanceof Error ? err.message : '未知错误'
    if (!webContents.isDestroyed()) {
      webContents.send(AGENT_IPC_CHANNELS.STREAM_ERROR, { sessionId: input.sessionId, error: errorMessage })
      webContents.send(AGENT_IPC_CHANNELS.STREAM_COMPLETE, { sessionId: input.sessionId, messages: [], stoppedByUser: false })
    }
  } finally {
    if (!orchestrator.isActive(input.sessionId)) {
      sessionWebContents.delete(input.sessionId)
    }
  }
}

export async function runAgentHeadless(
  input: AgentSendInput,
  callbacks: {
    onError: (error: string) => void
    onComplete: (messages?: AgentMessage[]) => void
    onTitleUpdated: (title: string) => void
    source?: AgentExternalRunSource
  },
): Promise<void> {
  const wc = getMainRendererWebContents()
  const runInput: AgentSendInput = input.startedAt != null ? input : { ...input, startedAt: Date.now() }
  const startedAt = runInput.startedAt!
  if (wc) registerWebContents(runInput.sessionId, wc)

  try {
    await orchestrator.sendMessage(runInput, {
      onError: (error) => {
        callbacks.onError(error)
        if (wc && !wc.isDestroyed()) wc.send(AGENT_IPC_CHANNELS.STREAM_ERROR, { sessionId: runInput.sessionId, error })
      },
      onComplete: (messages, opts) => {
        callbacks.onComplete(messages)
        if (wc && !wc.isDestroyed()) {
          wc.send(AGENT_IPC_CHANNELS.STREAM_COMPLETE, {
            sessionId: runInput.sessionId, messages,
            stoppedByUser: opts?.stoppedByUser ?? false,
            startedAt: opts?.startedAt, resultSubtype: opts?.resultSubtype,
            resultErrors: opts?.resultErrors,
          })
        }
      },
      onTitleUpdated: (title) => {
        callbacks.onTitleUpdated(title)
        eventBus.emit(runInput.sessionId, { kind: 'proma_event', event: { type: 'title_updated', title } })
        if (wc && !wc.isDestroyed()) wc.send(AGENT_IPC_CHANNELS.TITLE_UPDATED, { sessionId: runInput.sessionId, title })
      },
      onRunStarted: ({ startedAt: persistedStartedAt }) => {
        const session = getAgentSessionMeta(runInput.sessionId)
        eventBus.emit(runInput.sessionId, {
          kind: 'proma_event', event: {
            type: 'external_run_started', source: callbacks.source ?? 'bridge',
            sessionId: runInput.sessionId, title: session?.title,
            workspaceId: runInput.workspaceId ?? session?.workspaceId, modelId: runInput.modelId,
            startedAt: persistedStartedAt,
          },
        })
      },
    })
  } catch (err) {
    console.error('[Agent 服务] runAgentHeadless 异常:', err)
    const errorMessage = err instanceof Error ? err.message : '未知错误'
    callbacks.onError(errorMessage)
    callbacks.onComplete()
    if (wc && !wc.isDestroyed()) {
      wc.send(AGENT_IPC_CHANNELS.STREAM_ERROR, { sessionId: runInput.sessionId, error: errorMessage })
      wc.send(AGENT_IPC_CHANNELS.STREAM_COMPLETE, { sessionId: runInput.sessionId, messages: [], stoppedByUser: false, startedAt })
    }
  } finally {
    if (!orchestrator.isActive(runInput.sessionId)) sessionWebContents.delete(runInput.sessionId)
  }
}

export async function generateAgentTitle(input: AgentGenerateTitleInput): Promise<string | null> {
  return orchestrator.generateTitle(input)
}

export function stopAgent(sessionId: string): void { orchestrator.stop(sessionId) }

setHeadlessAgentRunner(runAgentHeadless)
setAgentStopper(stopAgent)

export async function rewindAgentSession(
  sessionId: string, assistantMessageUuid: string,
): Promise<import('@shadiao/shared').RewindSessionResult> {
  return orchestrator.rewindSession(sessionId, assistantMessageUuid)
}

export function isAgentSessionActive(sessionId: string): boolean {
  return orchestrator.isActive(sessionId)
}

export function stopAllAgents(): void { orchestrator.stopAll() }

export function killOrphanedClaudeSubprocesses(): void {
  scanAndKillOrphanedClaudeSubprocesses()
}

export async function updateAgentPermissionMode(sessionId: string, mode: PromaPermissionMode): Promise<void> {
  await orchestrator.updateSessionPermissionMode(sessionId, mode)
}

export async function queueAgentMessage(
  input: AgentQueueMessageInput, _webContents: WebContents,
): Promise<string> {
  return orchestrator.queueMessage(
    input.sessionId, input.userMessage, input.rawUserMessage,
    undefined, input.uuid, { interrupt: input.interrupt },
    input.mentionedSkills, input.mentionedMcpServers, input.mentionedSessionIds,
  )
}

// ===== 文件操作 =====

export function saveFilesToAgentSession(input: AgentSaveFilesInput): AgentSavedFile[] {
  const sessionDir = getAgentSessionWorkspacePath(input.workspaceSlug, input.sessionId)
  const results: AgentSavedFile[] = []
  const usedPaths = new Set<string>()

  for (const file of input.files) {
    let targetPath = join(sessionDir, file.filename)
    if (usedPaths.has(targetPath) || existsSync(targetPath)) {
      const dotIdx = file.filename.lastIndexOf('.')
      const baseName = dotIdx > 0 ? file.filename.slice(0, dotIdx) : file.filename
      const ext = dotIdx > 0 ? file.filename.slice(dotIdx) : ''
      let counter = 1
      let candidate = join(sessionDir, `${baseName}-${counter}${ext}`)
      while (usedPaths.has(candidate) || existsSync(candidate)) { counter++; candidate = join(sessionDir, `${baseName}-${counter}${ext}`) }
      targetPath = candidate
    }
    usedPaths.add(targetPath)
    mkdirSync(dirname(targetPath), { recursive: true })
    if (file.data.length * 0.75 > MAX_ATTACHMENT_SIZE) { console.warn(`[Agent] 文件过大，跳过: ${file.filename}`); continue }
    const buffer = Buffer.from(file.data, 'base64')
    writeFileSync(targetPath, buffer)
    const actualFilename = targetPath.slice(sessionDir.length + 1)
    results.push({ filename: actualFilename, targetPath })
  }
  return results
}

export function saveFilesToWorkspaceFiles(input: AgentSaveWorkspaceFilesInput): AgentSavedFile[] {
  const wsFilesDir = getWorkspaceFilesDir(input.workspaceSlug)
  const results: AgentSavedFile[] = []
  const usedPaths = new Set<string>()

  for (const file of input.files) {
    let targetPath = join(wsFilesDir, file.filename)
    if (usedPaths.has(targetPath) || existsSync(targetPath)) {
      const dotIdx = file.filename.lastIndexOf('.')
      const baseName = dotIdx > 0 ? file.filename.slice(0, dotIdx) : file.filename
      const ext = dotIdx > 0 ? file.filename.slice(dotIdx) : ''
      let counter = 1
      let candidate = join(wsFilesDir, `${baseName}-${counter}${ext}`)
      while (usedPaths.has(candidate) || existsSync(candidate)) { counter++; candidate = join(wsFilesDir, `${baseName}-${counter}${ext}`) }
      targetPath = candidate
    }
    usedPaths.add(targetPath)
    mkdirSync(dirname(targetPath), { recursive: true })
    if (file.data.length * 0.75 > MAX_ATTACHMENT_SIZE) { console.warn(`[Agent] 工作区文件过大，跳过: ${file.filename}`); continue }
    const buffer = Buffer.from(file.data, 'base64')
    writeFileSync(targetPath, buffer)
    const actualFilename = targetPath.slice(wsFilesDir.length + 1)
    results.push({ filename: actualFilename, targetPath })
  }
  return results
}
