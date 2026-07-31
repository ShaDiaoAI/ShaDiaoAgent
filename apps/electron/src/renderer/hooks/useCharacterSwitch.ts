/**
 * useCharacterSwitch — 人物切换时自动管理会话
 *
 * 行为：
 * 1. 调用增强的 IPC selectCharacter，传入 currentSessionId 用于主进程记录
 * 2. 当前会话非 running → UI 关闭标签页
 * 3. 当前会话 running → 保留后台执行，仅切换视图
 * 4. 新人物有历史会话 → 自动打开
 * 5. 新人物无历史会话 → 清除当前 sessionId
 *
 * 注意：本 hook 不负责更新 selectedCharacterAtom，由调用方自行管理。
 *
 * 复用现有架构：useOpenSession（打开会话）、closeTab（关闭标签页）、
 * agentStreamingStatesAtom（判断运行状态）
 */

import { useCallback } from 'react'
import { useAtomValue, useSetAtom, useStore } from 'jotai'
import { useOpenSession } from '@/hooks/useOpenSession'
import type { ShadiaoCharacter } from '@/atoms/character-atoms'
import {
  currentAgentSessionIdAtom,
  agentSessionsAtom,
  agentStreamingStatesAtom,
} from '@/atoms/agent-atoms'
import { tabsAtom, activeTabIdAtom, closeTab } from '@/atoms/tab-atoms'

export function useCharacterSwitch(): (character: ShadiaoCharacter) => Promise<void> {
  const store = useStore()
  const currentSessionId = useAtomValue(currentAgentSessionIdAtom)
  const streamingStates = useAtomValue(agentStreamingStatesAtom)
  const sessions = useAtomValue(agentSessionsAtom)
  const setCurrentSessionId = useSetAtom(currentAgentSessionIdAtom)
  const setTabs = useSetAtom(tabsAtom)
  const setActiveTabId = useSetAtom(activeTabIdAtom)
  const openSession = useOpenSession()

  const switchToCharacter = useCallback(async (character: ShadiaoCharacter) => {
    console.log('[人物切换] ===== 开始切换 =====')
    console.log('[人物切换] 目标:', character.name, `(id=${character.id})`)
    console.log('[人物切换] currentSessionId:', currentSessionId)
    console.log('[人物切换] tabsAtom:', JSON.stringify(store.get(tabsAtom).map(t => ({ id: t.id, type: t.type, sessionId: t.sessionId }))))
    console.log('[人物切换] activeTabIdAtom:', store.get(activeTabIdAtom))

    // 1) 调用增强的 IPC，传入当前 sessionId 便于主进程记录"上次会话"
    const result = await window.electronAPI.selectCharacter(
      character,
      currentSessionId ?? undefined,
    )

    console.log('[人物切换] IPC 返回:', JSON.stringify(result))

    if (!result.success) return

    // 2) 处理当前会话标签页
    if (currentSessionId) {
      const streamState = streamingStates.get(currentSessionId)
      const isRunning = streamState?.running ?? false
      console.log('[人物切换] 旧会话 running?', isRunning, 'streamState:', streamState)

      if (!isRunning) {
        const tabs = store.get(tabsAtom)
        const activeTabId = store.get(activeTabIdAtom)
        const currentTab = tabs.find(
          (t) =>
            (t.type === 'agent' || t.type === 'preview') &&
            'sessionId' in t &&
            t.sessionId === currentSessionId,
        )
        console.log('[人物切换] 找到旧 tab?', currentTab ? `id=${currentTab.id} type=${currentTab.type}` : '❌ 没找到!')
        if (currentTab) {
          const { tabs: newTabs, activeTabId: newActiveTabId } = closeTab(
            tabs,
            activeTabId,
            currentTab.id,
          )
          console.log('[人物切换] closeTab 后 tabs:', newTabs.map(t => ({ id: t.id, type: t.type })))
          console.log('[人物切换] closeTab 后 activeTabId:', newActiveTabId)
          setTabs(newTabs)
          setActiveTabId(newActiveTabId)
        }
      } else {
        console.log('[人物切换] 旧会话 running → 保留标签页不关闭')
      }
    } else {
      console.log('[人物切换] ⚠️ currentSessionId 为 null/空 → 跳过关闭旧 tab')
    }

    // 3) 恢复新人物的上次会话
    if (result.lastSessionId) {
      console.log('[人物切换] 有历史会话:', result.lastSessionId)
      const session = sessions.find((s) => s.id === result.lastSessionId)
      if (session && !session.archived) {
        console.log('[人物切换] 恢复会话:', session.title)
        openSession('agent', session.id, session.title)
        return
      }
      console.log('[人物切换] 历史会话已归档或不存在')
    } else {
      console.log('[人物切换] 无历史会话')
    }

    // 4) 无历史会话：清除当前 sessionId
    console.log('[人物切换] 清除 currentSessionId → null')
    setCurrentSessionId(null)
  }, [
    store,
    currentSessionId,
    streamingStates,
    sessions,
    setCurrentSessionId,
    setTabs,
    setActiveTabId,
    openSession,
  ])

  return switchToCharacter
}
