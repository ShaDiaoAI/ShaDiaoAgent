import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { User, Blocks, Plug, AlarmClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  charactersAtom, selectedCharacterAtom,
  type ShadiaoCharacter,
} from '@/atoms/character-atoms'
import { agentChannelIdAtom, agentModelIdAtom } from '@/atoms/agent-atoms'
import { automationsAtom } from '@/atoms/automation-atoms'
import type { ModelOption } from '@shadiao/shared'
import { ModelSelector } from '@/components/chat/ModelSelector'

interface CharacterInfoProps {
  onOpenPanel?: () => void
  onOpenSkills?: () => void
  onOpenAutomations?: () => void
}

/**
 * CharacterInfo — 左侧面板人物信息区
 *
 * 替代原来的 CharacterSelector + ModeSwitcher。
 * 显示人物名称、等级、经验条、绑定的模型、Skills/MCP/自动化 数量徽章。
 */
export function CharacterInfo({ onOpenPanel, onOpenSkills, onOpenAutomations }: CharacterInfoProps): React.ReactElement {
  const [characters, setCharacters] = useAtom(charactersAtom)
  const [selected, setSelected] = useAtom(selectedCharacterAtom)
  const automations = useAtomValue(automationsAtom)
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
          if (!selected && r.data.length > 0) {
            setSelected(r.data[0])
            // 同步主进程 selectedCharacterId，确保新建会话时带上 characterId
            window.electronAPI.selectCharacter(r.data[0]).catch(() => {})
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // 人物开关切换
  const [switchOpen, setSwitchOpen] = React.useState(false)
  const switchRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (switchRef.current && !switchRef.current.contains(e.target as Node)) setSwitchOpen(false)
    }
    if (switchOpen) document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [switchOpen])

  const handleSelect = async (char: ShadiaoCharacter) => {
    setSelected(char)
    setSwitchOpen(false)
    try { await window.electronAPI.selectCharacter(char) } catch {}
  }

  // ===== 所有 hooks 必须在早期 return 之前，保持调用顺序一致 =====

  const expPercent = selected ? Math.round((selected.experience / (selected.exp_to_next || 1)) * 100) : 0
  const skillsCount = 0
  const mcpCount = 0
  const autoCount = automations.length

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
      console.error('更新人物模型失败:', e)
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
    <div ref={switchRef} className="relative">
      {/* 人物名称行 — 整行可点击打开人物管理面板 */}
      <div
        role="button"
        tabIndex={0}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-sm hover:bg-muted/40 transition-colors cursor-pointer"
        onClick={() => onOpenPanel?.()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenPanel?.() }}
      >
        <div className="flex-1 text-left min-w-0">
          <div className="font-semibold text-sm truncate">
            {selected.name}
            <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">Lv.{selected.level}</span>
            {selected.character_class && (
              <span className="text-[10px] text-muted-foreground/70"> · {selected.character_class.name}</span>
            )}
          </div>
        </div>

        {/* 人物图标 */}
        <User className="size-3.5 shrink-0 text-muted-foreground" />

        {/* 多人时显示切换箭头 */}
        {characters.length > 1 && (
          <button
            className="shrink-0 p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => { e.stopPropagation(); setSwitchOpen(!switchOpen) }}
            title="切换人物"
          >
            <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
          </button>
        )}
      </div>

      {/* 人物切换下拉 */}
      {switchOpen && characters.length > 1 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-0.5 rounded-lg border bg-popover shadow-lg overflow-hidden">
          {characters.map((c) => {
            const charExp = Math.round((c.experience / (c.exp_to_next || 1)) * 100)
            return (
              <button
                key={c.id}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted/50 transition-colors',
                  c.id === selected.id && 'bg-muted/30',
                )}
                onClick={() => handleSelect(c)}
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400/30 to-purple-400/30 ring-1 ring-border/50">
                  {c.equipped_skin?.preview_url ? (
                    <img src={c.equipped_skin.preview_url} alt="" className="size-7 rounded-full object-cover" />
                  ) : (
                    <User className="size-3.5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-medium">{c.name}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      Lv.{c.level}{c.character_class ? ` · ${c.character_class.name}` : ''}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-400 to-purple-400"
                      style={{ width: `${charExp}%` }}
                    />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* 模型选择器（从聊天 toolbar 迁移过来） */}
      <div className="mt-1.5 px-1">
        <ModelSelector
          onModelSelect={handleModelSelect}
        />
      </div>

      {/* Skills / MCP / 自动化 数量徽章 */}
      <div className="mt-1.5 px-1 flex items-center gap-1.5">
        <BadgeButton
          icon={Blocks}
          label="技能"
          count={skillsCount}
          active={false}
          onClick={() => onOpenSkills?.()}
        />
        <BadgeButton
          icon={Plug}
          label="MCP"
          count={mcpCount}
          active={false}
          onClick={() => onOpenSkills?.()}
        />
        <BadgeButton
          icon={AlarmClock}
          label="自动"
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
