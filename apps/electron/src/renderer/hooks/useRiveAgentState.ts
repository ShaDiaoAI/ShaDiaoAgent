import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  riveAgentStateAtom,
  type RiveAgentState,
  REWARD_DROP_DURATION_MS,
} from '@/atoms/rive-atoms'
import { agentStreamingStatesAtom, currentAgentSessionIdAtom, agentStreamErrorsAtom } from '@/atoms/agent-atoms'
import { rewardQueueAtom } from '@/atoms/character-atoms'

/**
 * useRiveAgentState — 从 Agent 流式事件派生 Rive 动画状态
 *
 * 状态优先级（高→低）：
 *   1. reward_drop  — 收到奖励事件（持续 REWARD_DROP_DURATION_MS 后回 idle）
 *   2. error         — 当前会话有 stream error
 *   3. tool_calling  — 当前会话有活跃的 tool activities
 *   4. streaming     — 当前会话正在流式输出
 *   5. thinking      — 当前会话 running 但无 content 也无 tool（正在思考）
 *   6. idle          — 以上皆非
 */
export function useRiveAgentState(): RiveAgentState {
  const currentSessionId = useAtomValue(currentAgentSessionIdAtom)
  const streamingStates = useAtomValue(agentStreamingStatesAtom)
  const streamErrors = useAtomValue(agentStreamErrorsAtom)
  const rewardQueue = useAtomValue(rewardQueueAtom)
  const setRewardQueue = useSetAtom(rewardQueueAtom)
  const [riveState, setRiveState] = useAtom(riveAgentStateAtom)

  // 独立追踪 reward_drop 计时器
  const rewardTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRewardIdRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    // 1. 检查是否有新的未 dismiss 奖励
    const activeReward = rewardQueue.find((r) => !r.dismissed)
    if (activeReward && activeReward.id !== lastRewardIdRef.current) {
      lastRewardIdRef.current = activeReward.id
      setRiveState('reward_drop')

      if (rewardTimerRef.current) clearTimeout(rewardTimerRef.current)
      rewardTimerRef.current = setTimeout(() => {
        setRiveState('idle')
        // 标记 reward 为已处理，防止下一轮 useEffect 再次触发
        setRewardQueue(prev => prev.map(r =>
          r.id === activeReward.id ? { ...r, dismissed: true } : r
        ))
        lastRewardIdRef.current = null
      }, REWARD_DROP_DURATION_MS)
      return
    }

    // 如果正在 reward_drop 动画中，不覆盖
    if (riveState === 'reward_drop') return

    // 2. 无当前会话 → idle
    if (!currentSessionId) {
      setRiveState('idle')
      return
    }

    const stream = streamingStates.get(currentSessionId)

    // 3. 无流式状态 → idle
    if (!stream) {
      setRiveState('idle')
      return
    }

    // 4. 推演状态
    // 优先检查 error
    const streamError = streamErrors.get(currentSessionId)
    if (streamError) {
      setRiveState('error')
      return
    }

    const hasActiveTools = stream.toolActivities.some((ta) => !ta.done)
    const hasContent = stream.content.length > 0

    if (stream.running) {
      if (hasActiveTools) {
        setRiveState('tool_calling')
      } else if (hasContent) {
        setRiveState('streaming')
      } else {
        // running 但无 tool 无 content → 正在思考
        setRiveState('thinking')
      }
    } else {
      setRiveState('idle')
    }

    // cleanup
    return () => {
      if (rewardTimerRef.current) clearTimeout(rewardTimerRef.current)
    }
  }, [currentSessionId, streamingStates, rewardQueue, riveState, setRiveState])

  return riveState
}
