/**
 * useCharacterBoundModel — 人物绑定模型回填
 *
 * 监听 selectedCharacterAtom，在人物就绪且渠道加载完成后，
 * 将人物的 bound_model 解析为 (channelId, modelId) 并回填全局默认
 * （agentChannelIdAtom / agentModelIdAtom + settings.json）。
 *
 * 解决的问题：左侧栏「人物绑定模型」选择只写人物 bound_model、不写 settings，
 * 重启后 AgentSettingsInitializer 只读 settings 的残留 agentModelId，导致回退到旧默认值。
 *
 * 挂载在 App 顶层，覆盖所有 setSelected 入口（CharacterSelector / CharacterPanelView /
 * LeftSidebar / CharacterInfo 的 restoreLastSelectedCharacter）。
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { selectedCharacterAtom } from '@/atoms/character-atoms'
import { agentChannelIdAtom, agentModelIdAtom, agentChannelIdsAtom } from '@/atoms/agent-atoms'
import { channelsAtom, channelsLoadedAtom } from '@/atoms/chat-atoms'
import { isAgentCompatibleProvider, createLogger } from '@shadiao/shared'
import type { Channel } from '@shadiao/shared'

const log = createLogger('人物模型回填')

/**
 * 在启用渠道里反查 bound_model 所属的 channelId。
 *
 * bound_model 只存纯 modelId（不含渠道），需要反查它落在哪个 Agent 兼容渠道。
 * 优先级：Agent 渠道白名单 > 任意启用兼容渠道。找不到（模型已下线/渠道未加载完）返回 null。
 */
function resolveChannelForBoundModel(
  boundModel: string,
  channels: Channel[],
  preferredChannelIds: string[],
): string | null {
  const candidates = channels.filter(
    (c) => c.enabled && isAgentCompatibleProvider(c.provider),
  )

  // 1. 优先：白名单内的渠道，含该模型且模型 enabled
  const inPreferred = candidates.find(
    (c) => preferredChannelIds.includes(c.id)
      && c.models.some((m) => m.id === boundModel && m.enabled),
  )
  if (inPreferred) return inPreferred.id

  // 2. 其次：任意启用兼容渠道，含该模型且 enabled
  const anyChannel = candidates.find(
    (c) => c.models.some((m) => m.id === boundModel && m.enabled),
  )
  if (anyChannel) return anyChannel.id

  // 3. 找不到 → 返回 null，不应用（保持现状，由后续兜底逻辑处理）
  return null
}

export function useCharacterBoundModel(): void {
  const selectedCharacter = useAtomValue(selectedCharacterAtom)
  const channels = useAtomValue(channelsAtom)
  const channelsLoaded = useAtomValue(channelsLoadedAtom)
  const agentChannelIds = useAtomValue(agentChannelIdsAtom)
  const currentAgentChannelId = useAtomValue(agentChannelIdAtom)
  const currentAgentModelId = useAtomValue(agentModelIdAtom)
  const setAgentChannelId = useSetAtom(agentChannelIdAtom)
  const setAgentModelId = useSetAtom(agentModelIdAtom)

  React.useEffect(() => {
    // 渠道未加载或人物未就绪时跳过；等两者就绪后 effect 会因依赖变化重跑
    if (!channelsLoaded || !selectedCharacter) return

    const modelId = selectedCharacter.bound_model?.trim()
    if (!modelId) return

    const channelId = resolveChannelForBoundModel(
      modelId,
      channels,
      agentChannelIds,
    )
    if (!channelId) return

    // 幂等：渠道与模型都未变化时跳过，避免重复写盘
    if (currentAgentChannelId === channelId && currentAgentModelId === modelId) return

    setAgentChannelId(channelId)
    setAgentModelId(modelId)
    window.electronAPI
      .updateSettings({ agentChannelId: channelId, agentModelId: modelId })
      .catch((e) => log.warn('回填人物模型设置失败:', e))
  }, [
    selectedCharacter,
    channelsLoaded,
    channels,
    currentAgentChannelId,
    currentAgentModelId,
    agentChannelIds,
    setAgentChannelId,
    setAgentModelId,
  ])
}
