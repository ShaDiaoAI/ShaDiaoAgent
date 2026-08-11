import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { User, Blocks, Plug, AlarmClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  charactersAtom, selectedCharacterAtom,
  type ShadiaoCharacter,
} from '@/atoms/character-atoms'
import { agentChannelIdAtom, agentModelIdAtom } from '@/atoms/agent-atoms'
import { automationsAtom } from '@/atoms/automation-atoms'
import type { ModelOption } from '@shadiao/shared'
import { ModelSelector } from '@/components/chat/ModelSelector'
import { createLogger } from '@shadiao/shared'

const log = createLogger('CharacterInfo')

interface CharacterInfoProps {
  onOpenPanel?: () => void
  onOpenSkills?: () => void
  onOpenMcp?: () => void
  onOpenAutomations?: () => void
  /** Skills 数量（从工作区 capability 传入） */
  skillsCount?: number
  /** MCP 服务器数量（从工作区 capability 传入） */
  mcpCount?: number
}

/**
 * CharacterInfo — 左侧面板人物信息区
 *
 * 替代原来的 CharacterSelector + ModeSwitcher。
 * 显示人物名称、等级、经验条、绑定的模型、Skills/MCP/自动化 数量徽章。
 */
export function CharacterInfo({ onOpenPanel, onOpenSkills, onOpenMcp, onOpenAutomations, skillsCount = 0, mcpCount = 0 }: CharacterInfoProps): React.ReactElement {
  const [characters, setCharacters] = useAtom(charactersAtom)
  const [selected, setSelected] = useAtom(selectedCharacterAtom)
  const automations = useAtomValue(automationsAtom)
  const agentChannelId = useAtomValue(agentChannelIdAtom)
  const agentModelId = useAtomValue(agentModelIdAtom)
  const setAgentChannelId = useSetAtom(agentChannelIdAtom)
  const setAgentModelId = useSetAtom(agentModelIdAtom)

  const [loading, setLoading] = React.useState(false)

  // 加载人物列表
  React.useEffect(() => {
    if (characters.length > 0) return
    setLoading(true)
    window.electronAPI.listCharacters()
      .then((r: any) => {
        if (r?.success && r.data) {
          setCharacters(r.data)
          // 🆕 恢复上次选中的人物（优先），fallback 到第一个
          restoreLastSelectedCharacter(r.data)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // 🆕 如果人物列表已由 App.tsx 提前加载，但 selected 仍为空，也尝试恢复
  React.useEffect(() => {
    if (!selected && characters.length > 0) {
      restoreLastSelectedCharacter(characters)
    }
  }, [characters.length > 0 && !selected])

  /** 🆕 从 settings 恢复上次选中的人物，fallback 到第一个 */
  const restoreLastSelectedCharacter = React.useCallback((chars: ShadiaoCharacter[]) => {
    if (chars.length === 0) return
    window.electronAPI.getSettings()
      .then((settings: any) => {
        const lastId: number | null | undefined = settings?.lastSelectedCharacterId
        const target = (lastId != null ? chars.find((c: ShadiaoCharacter) => c.id === lastId) : null) ?? chars[0]!
        setSelected(target)
        window.electronAPI.selectCharacter(target).catch(() => {})
      })
      .catch(() => {
        // settings 读取失败 → fallback 到第一个
        setSelected(chars[0]!)
        window.electronAPI.selectCharacter(chars[0]!).catch(() => {})
      })
  }, [setSelected])

  // ===== 所有 hooks 必须在早期 return 之前，保持调用顺序一致 =====

  const expPercent = selected ? Math.min(100, Math.round(((selected.current_level_xp ?? selected.experience) / (selected.exp_to_next || 1)) * 100)) : 0
  const autoCount = automations.length

  // 构造 externalSelectedModel 给 ModelSelector，使其能正确展示当前选中模型
  // （左侧栏不在 ConversationContext 内，useConversationModelOptional 返回 null）
  const computedSelectedModel = React.useMemo(() => {
    if (!agentChannelId || !agentModelId) return null
    return { channelId: agentChannelId, modelId: agentModelId }
  }, [agentChannelId, agentModelId])
  const stableSelectedModelRef = React.useRef(computedSelectedModel)
  if (computedSelectedModel) stableSelectedModelRef.current = computedSelectedModel
  const externalSelectedModel = computedSelectedModel ?? stableSelectedModelRef.current

  const handleModelSelect = React.useCallback(async (option: ModelOption) => {
    if (!selected) return
    // 同步更新前端 atom，确保 AgentView 发送消息时拿到正确的渠道/模型
    setAgentChannelId(option.channelId)
    setAgentModelId(option.modelId)
    try {
      const r = await window.electronAPI.updateCharacter(selected.id, {
        bound_model: option.modelId,
      })
      if (r?.success && r.data) {
        setSelected(r.data)
        setCharacters((prev) => prev.map((c) => (c.id === r.data.id ? r.data : c)))
      }
    } catch (e) {
      log.error('更新人物模型失败:', e)
    }
  }, [selected, setSelected, setCharacters, setAgentChannelId, setAgentModelId])

  // ===== 早期 return：加载中 / 无人物 =====

  if (loading) {
    return (
      <div className="px-3 py-3 text-xs text-muted-foreground">加载人物...</div>
    )
  }

  if (!selected) {
    return (
      <div className="px-3 py-3">
        <button
          className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
          onClick={onOpenPanel}
        >
          <User className="size-4" />
          创建第一个人物
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* 人物名称行 — 整行可点击打开人物管理面板 */}
      <div
        role="button"
        tabIndex={0}
        className="flex w-full items-center justify-center gap-2 rounded-lg px-1 py-1.5 text-sm hover:bg-muted/40 transition-colors cursor-pointer"
        onClick={() => onOpenPanel?.()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenPanel?.() }}
      >
        {/* 人物图标 */}
        <User className="size-3.5 shrink-0 text-muted-foreground" />

        <div className="min-w-0 truncate">
          <div className="font-semibold text-sm truncate">
            {selected.name}
            <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">Lv.{selected.level}</span>
            {selected.character_class && (
              <span className="text-[10px] text-muted-foreground/70"> · {selected.character_class.name}</span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role="button"
                  tabIndex={0}
                  className="ml-1.5 inline-flex size-3.5 items-center justify-center rounded-full bg-amber-500/15 text-white hover:bg-amber-500/25 transition-colors text-[9px] font-bold leading-none cursor-help shrink-0"
                  aria-label="什么是人物等级？"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}
                >
                  ?
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px]">
                <p className="text-xs leading-relaxed">
                  使用沙雕智能体为沙雕人物累积经验，经验满后自动升级
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  点击人物名称可打开人物面板，管理皮肤、道具与角色信息
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* 模型选择器（从聊天 toolbar 迁移过来） */}
      <div className="mt-1.5 flex justify-center">
        <ModelSelector
          externalSelectedModel={externalSelectedModel}
          onModelSelect={handleModelSelect}
        />
      </div>

      {/* Skills / MCP / 定时任务 数量徽章 */}
      <div className="mt-1.5 px-1 flex items-center justify-center gap-1.5">
        <BadgeButton
          icon={Blocks}
          label="skill(s)"
          count={skillsCount}
          active={false}
          onClick={() => onOpenSkills?.()}
        />
        <BadgeButton
          icon={Plug}
          label="MCP"
          count={mcpCount}
          active={false}
          onClick={() => onOpenMcp?.()}
        />
        <BadgeButton
          icon={AlarmClock}
          label="定时任务"
          count={autoCount}
          active={false}
          onClick={() => onOpenAutomations?.()}
        />
      </div>
    </div>
  )
}

/**
 * 小徽章按钮：显示图标 + 标签 + 数量
 */
function BadgeButton({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ElementType
  label: string
  count: number
  active: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors',
        active
          ? 'bg-accent-foreground/[0.10] text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
    >
      <Icon className="size-3" />
      <span>{label}</span>
      {count > 0 && (
        <span className="tabular-nums ml-0.5">{count}</span>
      )}
    </button>
  )
}
