import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Bot, ChevronDown, Plus, User, Settings, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  charactersAtom, selectedCharacterAtom, charactersLoadingAtom,
  type ShadiaoCharacter,
} from '@/atoms/character-atoms'
import { currentAgentSessionIdAtom, agentSessionsAtom } from '@/atoms/agent-atoms'
import { tabsAtom, activeTabIdAtom, SCRATCH_PAD_ID } from '@/atoms/tab-atoms'

interface CharacterSelectorProps {
  onOpenPanel?: () => void
}

export function CharacterSelector({ onOpenPanel }: CharacterSelectorProps): React.ReactElement {
  const [characters, setCharacters] = useAtom(charactersAtom)
  const [selected, setSelected] = useAtom(selectedCharacterAtom)
  const loading = useAtomValue(charactersLoadingAtom)
  const setLoading = useSetAtom(charactersLoadingAtom)
  const setCurrentSessionId = useSetAtom(currentAgentSessionIdAtom)
  const setTabs = useSetAtom(tabsAtom)
  const [activeTabId, setActiveTabId] = useAtom(activeTabIdAtom)
  const agentSessions = useAtomValue(agentSessionsAtom)
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  // 加载人物列表
  React.useEffect(() => {
    if (characters.length > 0) return
    setLoading(true)
    window.electronAPI.listCharacters()
      .then((r: any) => {
        if (r?.success && r.data) {
          setCharacters(r.data)
          if (!selected && r.data.length > 0) {
            // 🆕 优先恢复上次选中的人物，fallback 到第一个
            window.electronAPI.getSettings()
              .then((settings: any) => {
                const lastId: number | null | undefined = settings?.lastSelectedCharacterId
                const target = (lastId != null ? r.data.find((c: any) => c.id === lastId) : null) ?? r.data[0]
                handleSelect(target)
              })
              .catch(() => handleSelect(r.data[0]))
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // 点击外部关闭
  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const handleSelect = async (char: ShadiaoCharacter) => {
    const oldWsId = selected ? `char-${selected.id}` : null
    setSelected(char)
    setOpen(false)
    // 关掉旧人物 workspace 的 Tab（保留 Scratch Pad 和其他无关 Tab）
    setTabs(prev => {
      const filtered = prev.filter(tab => {
        if (tab.type === 'scratch' || tab.type === 'tutorial') return true
        const session = agentSessions.find(s => s.id === tab.sessionId)
        return session?.workspaceId !== oldWsId
      })
      if (!filtered.some(t => t.id === activeTabId)) {
        setActiveTabId(SCRATCH_PAD_ID)
      }
      return filtered
    })
    setCurrentSessionId(null)
    try { await window.electronAPI.selectCharacter(char) } catch {}
  }

  const expPercent = selected ? Math.min(100, Math.round(((selected.current_level_xp ?? selected.experience) / (selected.exp_to_next || 1)) * 100)) : 0

  return (
    <div ref={ref} className="relative px-3 py-2">
      <button
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {/* 角色头像区 */}
        <div className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400/30 to-purple-400/30 ring-1 ring-border/50">
          {selected?.equipped_skin?.preview_url ? (
            <img src={selected.equipped_skin.preview_url} alt="" className="size-8 rounded-full object-cover" />
          ) : (
            <Bot className="size-4 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 text-left min-w-0">
          <div className="font-medium text-sm truncate">
            {selected?.name || (loading ? '加载中...' : '选择人物')}
          </div>
          {selected && (
            <div className="flex items-center gap-1.5 mt-0.5">
              {/* 等级 */}
              <span className="text-[10px] text-muted-foreground">
                Lv.{selected.level}
              </span>
              {/* 经验条 */}
              <div className="flex-1 h-1 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-400 to-purple-400 transition-all duration-500"
                  style={{ width: `${expPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <ChevronDown className={cn('size-3.5 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {/* 下拉菜单 */}
      {open && (
        <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-lg border bg-popover shadow-lg overflow-hidden">
          {characters.map((c) => {
            const charExp = Math.min(100, Math.round(((c.current_level_xp ?? c.experience) / (c.exp_to_next || 1)) * 100))
            return (
              <button
                key={c.id}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors',
                  c.id === selected?.id && 'bg-muted/30',
                )}
                onClick={() => handleSelect(c)}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400/30 to-purple-400/30 ring-1 ring-border/50">
                  {c.equipped_skin?.preview_url ? (
                    <img src={c.equipped_skin.preview_url} alt="" className="size-8 rounded-full object-cover" />
                  ) : (
                    <User className="size-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-medium">{c.name}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      Lv.{c.level}
                      {c.character_class ? ` · ${c.character_class.name}` : ''}
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
          {/* 管理入口 */}
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 border-t transition-colors"
            onClick={() => { setOpen(false); onOpenPanel?.() }}
          >
            <Settings className="size-3.5" />
            管理人物
          </button>
        </div>
      )}
    </div>
  )
}
