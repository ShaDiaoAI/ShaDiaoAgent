/**
 * CharacterPanelView — 「人物管理」全屏视图
 *
 * 由侧边栏人物姓名行触发，全屏占据中间内容区。
 * 布局与 AgentSkillsView 一致：返回按钮 + 大标题 + pill tab 切换 + 内容区。
 *
 * 人物信息 tab 重构（2026-07-30）：
 * - 内联人物列表切换 + 展开选中人物详情
 * - type-to-confirm 删除对话框
 * - 槽位统计 + 创建入口
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { User, Shield, Edit3, Trash2, Gift, Check, ArrowLeft, Plus, AlertTriangle, FileText, Coins, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCharacterSwitch } from '@/hooks/useCharacterSwitch'
import { cn } from '@/lib/utils'
import {
  charactersAtom, selectedCharacterAtom, mySkinsAtom,
  walletAtom, gachaProgressAtom, gachaHistoryAtom, creationLimitAtom,
  type ShadiaoCharacter, type Skin,
} from '@/atoms/character-atoms'
import {
  notificationSoundsAtom, notificationSoundEnabledAtom, notificationsEnabledAtom,
  playNotificationSoundForType,
} from '@/atoms/notifications'
import { agentWorkspacesAtom, currentAgentWorkspaceIdAtom, agentSessionsAtom } from '@/atoms/agent-atoms'
import { characterPanelTabAtom, activeViewAtom, type CharacterPanelTab } from '@/atoms/active-view'
import { tabsAtom, activeTabIdAtom, openTab, closeTab } from '@/atoms/tab-atoms'
import { GachaAnim, type GachaAnimHandle } from './GachaAnim'
import { GachaResultModal, type DrawResultItem } from './GachaResultModal'
import { GachaDecoPanel } from './GachaDecoPanel'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { createLogger } from '@shadiao/shared'

const log = createLogger('CharacterPanelView')

/** 计算人物槽位贡献：floor(level / 5) */
function calcSlotContribution(level: number): number {
  return Math.floor(level / 5)
}

export function CharacterPanelView(): React.ReactElement {
  const [characters, setCharacters] = useAtom(charactersAtom)
  const [selected, setSelected] = useAtom(selectedCharacterAtom)
  const mySkins = useAtomValue(mySkinsAtom)
  const setMySkins = useSetAtom(mySkinsAtom)
  const wallet = useAtomValue(walletAtom)
  const gachaProgress = useAtomValue(gachaProgressAtom)
  const [gachaHistory, setGachaHistory] = useAtom(gachaHistoryAtom)
  const setWallet = useSetAtom(walletAtom)
  const setGachaProgress = useSetAtom(gachaProgressAtom)
  const notificationSounds = useAtomValue(notificationSoundsAtom)
  const notificationSoundEnabled = useAtomValue(notificationSoundEnabledAtom)
  const notificationsEnabled = useAtomValue(notificationsEnabledAtom)
  const [creationLimit, setCreationLimit] = useAtom(creationLimitAtom)
  const setWorkspaces = useSetAtom(agentWorkspacesAtom)
  const setCurrentWorkspaceId = useSetAtom(currentAgentWorkspaceIdAtom)
  const setAgentSessions = useSetAtom(agentSessionsAtom)
  const setActiveView = useSetAtom(activeViewAtom)
  const activeView = useAtomValue(activeViewAtom)
  const [appTabs, setAppTabs] = useAtom(tabsAtom)
  const [appActiveTabId, setAppActiveTabId] = useAtom(activeTabIdAtom)
  const switchCharacter = useCharacterSwitch()
  const [tab, setTab] = useAtom(characterPanelTabAtom)
  // 盲盒状态机
  type GachaPhase = 'idle' | 'animating' | 'showing_result'
  const [gachaPhase, setGachaPhase] = React.useState<GachaPhase>('idle')
  const [drawResults, setDrawResults] = React.useState<DrawResultItem[] | null>(null)
  const [drawError, setDrawError] = React.useState<string | null>(null)
  const [drawingCount, setDrawingCount] = React.useState<number | null>(null)
  const gachaAnimRef = React.useRef<GachaAnimHandle>(null)
  const animEndResolveRef = React.useRef<(() => void) | null>(null)
  const [promptEditTarget, setPromptEditTarget] = React.useState<ShadiaoCharacter | null>(null)
  const [promptEditValue, setPromptEditValue] = React.useState('')
  const [promptEditSaving, setPromptEditSaving] = React.useState(false)
  const [promptEditError, setPromptEditError] = React.useState('')
  const isMountedRef = React.useRef(true)
  const [animReady, setAnimReady] = React.useState(false)
  React.useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  // 人物 tab 内状态
  const [deleteTarget, setDeleteTarget] = React.useState<ShadiaoCharacter | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = React.useState('')

  const char = selected
  const isLastCharacter = characters.length <= 1

  // 打开时拉取数据
  React.useEffect(() => {
    window.electronAPI.getGachaProgress?.().then((r: any) => {
      if (r?.success && r.data) setGachaProgress(r.data)
    }).catch(() => {})
    window.electronAPI.getWallet?.().then((r: any) => {
      if (r?.success && r.data) setWallet(r.data)
    }).catch(() => {})
    window.electronAPI.mySkins?.().then((r: any) => {
      if (r?.success && r.data) setMySkins(r.data)
    }).catch(() => {})
    window.electronAPI.getCreationLimit?.().then((r: any) => {
      if (r?.success && r.data) setCreationLimit(r.data)
    }).catch(() => {})
    setDeleteTarget(null)
    setDeleteConfirmName('')
  }, [setGachaProgress, setWallet, setMySkins, setCreationLimit])

  // 切换到 info tab 时刷新 creation-limit
  React.useEffect(() => {
    if (tab !== 'info') return
    window.electronAPI.getCreationLimit?.().then((r: any) => {
      if (r?.success && r.data) setCreationLimit(r.data)
    }).catch(() => {})
  }, [tab, setCreationLimit])

  // ===== 人物切换 =====
  const handleSelectChar = async (c: ShadiaoCharacter) => {
    if (c.id === selected?.id) return
    // 1. 从后端刷新最新人物数据
    try {
      const r = await window.electronAPI.getCharacter?.(c.id)
      if (r?.success && r.data) {
        setSelected(r.data)
        setCharacters(prev => prev.map(ch => ch.id === r.data.id ? r.data : ch))
      } else {
        setSelected(c)
      }
    } catch {
      setSelected(c)
    }
    // 2. 同步主进程 selectedCharacterId + 会话管理
    // 保存当前视图——switchCharacter 可能触发 openSession 将 activeView 改为 'conversations'
    const prevView = activeView
    log.info('切换前 activeView:', prevView, '目标人物:', c.name)
    try { await switchCharacter(c) } catch {}
    log.info('switchCharacter 返回, activeView 现在是:', activeView)
    if (prevView === 'character-panel') {
      setActiveView('character-panel')
    }
    // 3. 自动切换到新人物的 workspace
    const newWsId = `char-${c.id}`
    setCurrentWorkspaceId(newWsId)
    window.electronAPI.updateSettings({ agentWorkspaceId: newWsId }).catch(() => {})
    // 4. 刷新会话列表触发过滤
    window.electronAPI.listAgentSessions().then(setAgentSessions).catch(() => {})
  }

  // ===== 删除 =====
  const confirmDeleteChar = async () => {
    if (!deleteTarget) return
    const charToDelete = deleteTarget
    setDeleteTarget(null)
    setDeleteConfirmName('')
    try {
      await window.electronAPI.deleteCharacter?.(charToDelete.id)
      const updated = characters.filter(c => c.id !== charToDelete.id)
      setCharacters(updated)
      if (selected?.id === charToDelete.id) {
        const fallback = updated[0]!
        setSelected(fallback) // 即时 UI 反馈
        // 走统一切换路径（关闭旧标签页、切换 workspace、恢复会话）
        handleSelectChar(fallback)
      }
      toast.success(`已删除「${charToDelete.name}」`)
      // 刷新创建上限——删除后可能从满额恢复到可创建
      window.electronAPI.getCreationLimit?.().then((cr: any) => {
        if (cr?.success && cr.data) setCreationLimit(cr.data)
      }).catch(() => {})
    } catch (e) {
      log.error('删除失败:', e)
      toast.error('删除失败')
    }
  }
  const deleteInputMatch = deleteTarget ? deleteConfirmName === deleteTarget.name : false

  // ===== 皮肤装备 =====
  const handleEquipSkin = async (skin: Skin) => {
    if (!selected) return
    try {
      const skinResult = await window.electronAPI.equipSkin?.(selected.id, skin.id)
      if (!skinResult?.success) {
        log.error('equipSkin failed:', skinResult?.error)
        toast.error(`装备皮肤失败${skinResult?.error ? '：' + skinResult.error : ''}`)
        return
      }
      const r = await window.electronAPI.getCharacter?.(selected.id)
      if (r?.success && r.data) {
        setSelected(r.data)
        setCharacters(prev => prev.map(c => c.id === r.data.id ? r.data : c))
        toast.success(`已为「${selected.name}」装备皮肤「${skin.name}」`)
      }
    } catch (e) { toast.error('装备皮肤失败') }
  }

  // ===== 盲盒抽奖 =====
  const BOX_LABELS = ['box1', 'box2', 'box3', 'box4', 'box5'] as const

  function randomBox(): string {
    return BOX_LABELS[Math.floor(Math.random() * BOX_LABELS.length)]
  }

  const handleDraw = async (count: number) => {
    const label = count === 1 ? randomBox() : 'box12345'

    // 1. 进入 animating 状态
    setGachaPhase('animating')
    setDrawError(null)
    setDrawingCount(count)

    // 2. 播放动画
    gachaAnimRef.current?.play(label)

    // 3. 创建动画结束 Promise
    const animEndPromise = new Promise<void>(resolve => {
      animEndResolveRef.current = resolve
    })

    // 4. 发送 API 请求
    const apiPromise = window.electronAPI.drawGacha?.(count)

    // 5. 等待动画结束 + API 返回
    const [apiResult] = await Promise.all([
      apiPromise,
      animEndPromise,
    ])

    // 组件已卸载，不更新状态
    if (!isMountedRef.current) return

    // 6. 处理结果
    if (apiResult?.success && apiResult.data) {
      // 刷新数据（在后台进行）
      setGachaHistory(prev => [...apiResult.data.results, ...prev])
      window.electronAPI.getWallet?.().then((wr: any) => {
        if (wr?.success && wr.data) setWallet(wr.data)
      }).catch(() => {})
      window.electronAPI.getGachaProgress?.().then((pr: any) => {
        if (pr?.success && pr.data) setGachaProgress(pr.data)
      }).catch(() => {})
      window.electronAPI.mySkins?.().then((sr: any) => {
        if (sr?.success && sr.data) setMySkins(sr.data)
      }).catch(() => {})

      // 展示结果
      setDrawResults(apiResult.data.results)
      setGachaPhase('showing_result')
      setDrawingCount(null)

      // Toast
      const names = apiResult.data.results.map((r: DrawResultItem) =>
        `${r.skin.name}${r.is_new ? ' 🆕' : ''}`
      ).join('、')
      toast.success(`获得 ${names}`)
    } else {
      setDrawError(apiResult?.error || '抽奖失败')
      toast.error(apiResult?.error || '抽奖失败')
      setGachaPhase('idle')
      setDrawingCount(null)
    }
  }

  const handleCloseResult = () => {
    setGachaPhase('idle')
    setDrawResults(null)
    setDrawingCount(null)
  }

  // 盲盒揭晓音效：结果弹窗打开时播放
  React.useEffect(() => {
    if (gachaPhase === 'showing_result' && notificationsEnabled && notificationSoundEnabled) {
      void playNotificationSoundForType('gachaOpen', notificationSounds)
    }
  }, [gachaPhase, notificationsEnabled, notificationSoundEnabled, notificationSounds])

  const handleSavePrompt = async () => {
    if (!promptEditTarget) return
    setPromptEditSaving(true)
    setPromptEditError('')
    try {
      const r = await window.electronAPI.updateCharacter(promptEditTarget.id, {
        system_prompt: promptEditValue.trim(),
      })
      if (r?.success && r.data) {
        setCharacters(prev => prev.map(c => c.id === r.data.id ? r.data : c))
        if (selected?.id === r.data.id) setSelected(r.data)
        setPromptEditTarget(null)
        toast.success(`已更新「${r.data.name}」的人物设定`)
      } else {
        setPromptEditError(r?.error || '保存失败')
      }
    } catch (e: any) {
      setPromptEditError(e?.message || '保存失败')
    } finally {
      setPromptEditSaving(false)
    }
  }

  // 稀有度
  const rarityStyles: Record<string, string> = {
    'default':   'border-slate-300 text-slate-500 bg-white/50',
    'common':    'border-emerald-400 text-emerald-600 bg-emerald-50/50',
    'rare':      'border-blue-400 text-blue-600 bg-blue-50/50',
    'epic':      'border-purple-400 text-purple-600 bg-purple-50/50',
    'legendary': 'border-amber-400 text-amber-600 bg-amber-50/50',
  }
  const rarityLabels: Record<string, string> = {
    'default':   '默认',
    'common':    '普通',
    'rare':      '稀有',
    'epic':      '史诗',
    'legendary': '传说',
  }

  const tabs: { value: CharacterPanelTab; label: string; count?: number }[] = [
    { value: 'info', label: '人物', count: characters.length },
    { value: 'skins', label: '皮肤', count: mySkins.length },
    { value: 'gacha', label: '开盲盒' },
  ]

  // 聚合皮肤：同 ID 合并持有数量，兼容后端返回聚合/未聚合两种格式
  const aggregatedSkins = React.useMemo(() => {
    const map = new Map<number, Skin & { totalQty: number }>()
    for (const s of mySkins) {
      const existing = map.get(s.id)
      if (existing) {
        existing.totalQty += (s.quantity ?? 1)
      } else {
        map.set(s.id, { ...s, totalQty: s.quantity ?? 1 })
      }
    }
    return Array.from(map.values())
  }, [mySkins])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 返回栏 */}
      <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center px-8 pt-14 pb-5">
        <button
          type="button"
          onClick={() => setActiveView('conversations')}
          className="titlebar-no-drag -ml-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          aria-label="返回会话"
        >
          <ArrowLeft className="size-3.5" />
          <span>返回</span>
        </button>
      </div>

      {/* 标题栏 */}
      <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between px-8 pb-4">
        <div className="flex items-center gap-2.5">
          <User className="size-6 text-foreground/70" />
          <h1 className="text-2xl font-semibold text-foreground">人物管理</h1>
        </div>
      </div>

      {/* Pill tab 切换 */}
      <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center px-8 pb-6">
        <div className="relative flex h-8 items-stretch rounded-xl bg-muted p-0.5">
          <div
            className={cn(
              'absolute bottom-0.5 top-0.5 w-[calc(33.333%-3px)] rounded-lg bg-background shadow-sm transition-transform duration-300 ease-in-out',
              tab === 'info' && 'translate-x-0',
              tab === 'skins' && 'translate-x-full',
              tab === 'gacha' && 'translate-x-[200%]',
            )}
          />
          {tabs.map(({ value, label, count }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={cn(
                'relative z-[1] flex min-w-[96px] items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors duration-200',
                tab === value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
              {count !== undefined && (
                <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-8 pb-12">
          {!char && (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground/[0.04]">
                <User className="size-8 text-foreground/30" />
              </div>
              <div className="text-[15px] font-medium text-foreground/80">暂无人物</div>
              <div className="max-w-sm text-[13px] text-foreground/50">
                请先创建一个人物
              </div>
              <button
                onClick={async () => {
                  try {
                    const r = await window.electronAPI.createCharacter?.({ name: '乞丐虾仁' })
                    if (r?.success && r.data) {
                      setSelected(r.data)
                      window.electronAPI.selectCharacter(r.data).catch(() => {})
                      // 切换到新人物的 workspace
                      const newWsId = `char-${r.data.id}`
                      setCurrentWorkspaceId(newWsId)
                      window.electronAPI.updateSettings({ agentWorkspaceId: newWsId }).catch(() => {})
                      window.electronAPI.listCharacters().then((lr: any) => {
                        if (lr?.success && lr.data) setCharacters(lr.data)
                      }).catch(() => {})
                      window.electronAPI.listAgentWorkspaces().then(setWorkspaces).catch(() => {})
                      // 为新人物创建初始会话，并打开为当前标签页
                      try {
                        const meta = await window.electronAPI.createAgentSession(
                          undefined, undefined, newWsId, undefined,
                        )
                        setAgentSessions(prev => [meta, ...prev])
                        // 关闭旧人物的标签页，聚焦到新会话
                        let curTabs = appTabs
                        let curActiveId = appActiveTabId
                        for (const tab of curTabs) {
                          if (tab.type === 'agent' || tab.type === 'preview') {
                            const r = closeTab(curTabs, curActiveId, tab.id)
                            curTabs = r.tabs
                            curActiveId = r.activeTabId
                          }
                        }
                        const openResult = openTab(curTabs, { type: 'agent', sessionId: meta.id, title: meta.title })
                        setAppTabs(openResult.tabs)
                        setAppActiveTabId(openResult.activeTabId)
                      } catch (e) { log.error('创建初始会话失败:', e) }
                    }
                  } catch (e) { log.error('创建人物失败:', e) }
                }}
                className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus className="size-4" />
                创建新人物
              </button>
            </div>
          )}

          {char && (
            <>
              {/* ===== 人物 Tab（卡片网格） ===== */}
              {tab === 'info' && (
                <div className="space-y-4">
                  {/* 人物槽位说明 */}
                  <div className="text-xs text-muted-foreground pb-2">
                    {creationLimit ? (
                      creationLimit.can_create
                        ? `${creationLimit.current_count}/${creationLimit.max_characters} 人物槽位 · 还可创建 ${creationLimit.max_characters - creationLimit.current_count} 个`
                        : `${creationLimit.current_count}/${creationLimit.max_characters} 人物槽位已满 · 人物每升 5 级，增加 1 个人物槽位`
                    ) : (
                      `${characters.length}/${3 + characters.reduce((sum, c) => sum + calcSlotContribution(c.level), 0)} 人物槽位`
                    )}
                  </div>

                  {/* 人物卡片网格 */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                    {characters.map((c) => {
                      const isSelected = c.id === selected?.id
                      const assetId = c.equipped_skin?.rive_asset_id ?? '乞丐虾仁'
                      const localPreviewPath = `./characters/${assetId}/preview.png`

                      return (
                        <CharacterCard
                          key={c.id}
                          char={c}
                          isSelected={isSelected}
                          showDelete={!isLastCharacter}
                          localPreviewPath={localPreviewPath}
                          onSelect={() => handleSelectChar(c)}
                          onRename={async (newName) => {
                            try {
                              const r = await window.electronAPI.updateCharacter(c.id, { name: newName })
                              if (r?.success && r.data) {
                                setCharacters(prev => prev.map(ch => ch.id === r.data.id ? r.data : ch))
                                setSelected(r.data)
                                setWorkspaces(prev => prev.map(w =>
                                  w.id === `char-${r.data.id}` ? { ...w, name: r.data.name, updatedAt: Date.now() } : w
                                ))
                              }
                            } catch (e) { log.error('重命名失败:', e) }
                          }}
                          onDelete={() => { setDeleteTarget(c); setDeleteConfirmName('') }}
                          onEditPrompt={() => { setPromptEditTarget(c); setPromptEditValue(c.system_prompt || ''); setPromptEditError('') }}
                        />
                      )
                    })}

                    {/* 创建新人物卡片 */}
                    <button
                      className={cn(
                        'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card/50',
                        'min-h-[180px] transition-all duration-200',
                        'hover:border-primary/40 hover:bg-muted/30 hover:shadow-md hover:-translate-y-0.5',
                        creationLimit?.can_create === false && 'opacity-30 cursor-not-allowed',
                      )}
                      onClick={async () => {
                        if (creationLimit?.can_create === false) return
                        try {
                          const r = await window.electronAPI.createCharacter?.({ name: '乞丐虾仁' })
                          if (r?.success && r.data) {
                            setSelected(r.data)
                            setCharacters(prev => [...prev, r.data])
                            // 确保主进程 selectedCharacterId 已同步，再做后续操作
                            await window.electronAPI.selectCharacter(r.data).catch(() => {})
                            // 切换到新人物的 workspace
                            const newWsId = `char-${r.data.id}`
                            setCurrentWorkspaceId(newWsId)
                            window.electronAPI.updateSettings({ agentWorkspaceId: newWsId }).catch(() => {})
                            // 刷新 workspace 列表
                            window.electronAPI.listAgentWorkspaces().then(setWorkspaces).catch(() => {})
                            // 为新人物创建初始会话（可见，非 draft），并聚焦到新会话
                            try {
                              const meta = await window.electronAPI.createAgentSession(
                                undefined, undefined, newWsId, undefined,
                              )
                              setAgentSessions(prev => [meta, ...prev])
                              // 关闭旧人物的标签页，聚焦到新会话
                              let curTabs = appTabs
                              let curActiveId = appActiveTabId
                              for (const tab of curTabs) {
                                if (tab.type === 'agent' || tab.type === 'preview') {
                                  const r = closeTab(curTabs, curActiveId, tab.id)
                                  curTabs = r.tabs
                                  curActiveId = r.activeTabId
                                }
                              }
                              const openResult = openTab(curTabs, { type: 'agent', sessionId: meta.id, title: meta.title })
                              setAppTabs(openResult.tabs)
                              setAppActiveTabId(openResult.activeTabId)
                            } catch (e) { log.error('创建初始会话失败:', e) }
                            window.electronAPI.getCreationLimit?.().then((cr: any) => {
                              if (cr?.success && cr.data) setCreationLimit(cr.data)
                            }).catch(() => {})
                          }
                        } catch (e) { log.error('创建人物失败:', e) }
                      }}
                      disabled={creationLimit?.can_create === false}
                    >
                      <Plus className="size-8 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
                      <span className="mt-1.5 text-xs text-muted-foreground/50">创建新人物</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 皮肤 Tab */}
              {tab === 'skins' && (() => {
                // 检查皮肤是否可装备给当前人物（基于聚合后的 totalQty）
                const canEquipSkin = (skin: Skin & { totalQty: number }, char: ShadiaoCharacter) => {
                  // 已装备
                  if (char.equipped_skin?.id === skin.id) {
                    return { canEquip: false, reason: '使用中' }
                  }
                  const qty = skin.totalQty
                  // 统计其他人物装备此皮肤的数量
                  const usedByOthers = characters.filter(
                    c => c.id !== char.id && c.equipped_skin?.id === skin.id
                  ).length
                  if (usedByOthers < qty) {
                    return { canEquip: true }
                  }
                  // 被其他人物占用
                  const occupiedBy = characters.find(
                    c => c.id !== char.id && c.equipped_skin?.id === skin.id
                  )
                  return { canEquip: false, reason: `已装备（${occupiedBy?.name ?? '?'}）` }
                }

                return (
                <div>
                  <p className="text-xs text-muted-foreground pb-5">
                    点击皮肤即可为当前人物「<span className="font-medium text-foreground/80">{char.name}</span>」装备
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4">
                    {aggregatedSkins.map(skin => {
                      const isEquipped = char.equipped_skin?.id === skin.id
                      const localPreviewPath = `./characters/${skin.rive_asset_id}/preview.png`
                      const equipCheck = canEquipSkin(skin, char)
                      return (
                        <SkinCard
                          key={skin.id}
                          skin={{ ...skin, quantity: skin.totalQty }}
                          isEquipped={isEquipped}
                          disabled={!equipCheck.canEquip && !isEquipped}
                          statusText={equipCheck.canEquip ? undefined : equipCheck.reason}
                          localPreviewPath={localPreviewPath}
                          onEquip={() => handleEquipSkin(skin)}
                          rarityLabels={rarityLabels}
                        />
                      )
                    })}
                  </div>
                </div>
                )
              })()}

              {/* 盲盒 Tab */}
              {tab === 'gacha' && (() => {
                const isAnimating = gachaPhase === 'animating'
                const isDisabled = isAnimating || !animReady
                const coins = wallet?.coins ?? gachaProgress?.coins ?? 0
                const singleCost = gachaProgress?.single_draw_cost
                const multiCost = gachaProgress?.multi_draw_cost
                const canSingle = gachaProgress?.can_single_draw ?? false
                const canMulti = gachaProgress?.can_multi_draw ?? false
                const singleShort = !canSingle && singleCost != null ? Math.max(0, singleCost - coins) : 0
                const multiShort = !canMulti && multiCost != null ? Math.max(0, multiCost - coins) : 0
                return (
                <div className="gacha-grid w-full">
                  {/* 左侧：上联「盒家欢乐」 */}
                  <GachaDecoPanel side="left" />

                  {/* 中间：盲盒主区域 */}
                  <div className="space-y-4">
                    {/* 沙雕币胶囊（顶部） */}
                    <div className="flex items-center justify-between px-4 py-2.5 rounded-full border bg-card/70 shadow-sm">
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Coins className="size-4 text-amber-500" />
                        沙雕币
                      </span>
                      <CoinAmount value={coins} />
                    </div>

                    <GachaAnim
                      ref={gachaAnimRef}
                      className="w-full aspect-square"
                      onReady={() => setAnimReady(true)}
                      onAnimationEnd={() => {
                        animEndResolveRef.current?.()
                      }}
                    />

                    {/* 抽奖按钮 */}
                    <div className="flex gap-3">
                      <button
                        disabled={isDisabled || !canSingle}
                        onClick={() => handleDraw(1)}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                          canSingle && !isDisabled
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95'
                            : 'bg-muted text-muted-foreground cursor-not-allowed',
                        )}
                      >
                        {drawingCount === 1 ? (
                          <><Loader2 size={16} className="animate-spin" /><span>开盒中…</span></>
                        ) : (
                          <>
                            <Gift size={16} /><span>单抽</span>
                            {singleShort > 0
                              ? <span className="text-xs opacity-70">还差 {singleShort} 币</span>
                              : <span className="text-xs opacity-70">{singleCost ?? '—'} 币</span>}
                          </>
                        )}
                      </button>
                      <button
                        disabled={isDisabled || !canMulti}
                        onClick={() => handleDraw(5)}
                        className={cn(
                          'relative flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                          canMulti && !isDisabled
                            ? 'gacha-gold-btn active:scale-95'
                            : 'bg-muted text-muted-foreground cursor-not-allowed',
                        )}
                      >
                        {canMulti && !isDisabled && (
                          <span className="absolute -top-2 -right-1 px-1.5 py-0.5 rounded-full bg-amber-400 text-[9px] font-bold text-amber-950 shadow-sm z-10">
                            推荐
                          </span>
                        )}
                        {drawingCount === 5 ? (
                          <><Loader2 size={16} className="animate-spin" /><span>开盒中…</span></>
                        ) : (
                          <>
                            <Gift size={16} /><span>5 连抽</span>
                            {multiShort > 0
                              ? <span className="text-xs opacity-70">还差 {multiShort} 币</span>
                              : <span className="text-xs opacity-70">{multiCost ?? '—'} 币</span>}
                          </>
                        )}
                      </button>
                    </div>

                    {/* 错误提示 */}
                    {drawError && (
                      <div className="text-xs text-red-500 text-center bg-red-50 rounded-lg py-2">{drawError}</div>
                    )}
                  </div>

                  {/* 右侧：下联「开盒大吉」 */}
                  <GachaDecoPanel side="right" />

                  {/* 抽奖结果弹窗 */}
                  <GachaResultModal
                    results={drawResults ?? []}
                    isOpen={gachaPhase === 'showing_result'}
                    onClose={handleCloseResult}
                  />
                </div>
                )
              })()}
            </>
          )}

          {/* 删除确认对话框 */}
          {deleteTarget && (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40">
              <div className="w-[320px] p-5 rounded-xl border bg-card shadow-2xl space-y-4">
                <div className="text-center">
                  <AlertTriangle className="size-8 text-red-500 mx-auto mb-2" />
                  <h3 className="font-semibold text-sm">删除「{deleteTarget.name}」</h3>
                  <p className="text-xs text-muted-foreground mt-1">此操作不可撤销。</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1.5">
                    请输入 <span className="font-medium text-foreground/80">{deleteTarget.name}</span> 以确认：
                  </p>
                  <input
                    autoFocus
                    className="w-full px-2.5 py-1.5 rounded-md border bg-background text-sm outline-none focus:border-primary transition-colors"
                    value={deleteConfirmName}
                    onChange={e => setDeleteConfirmName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && deleteInputMatch) { e.preventDefault(); confirmDeleteChar() }
                      if (e.key === 'Escape') { e.preventDefault(); setDeleteTarget(null); setDeleteConfirmName('') }
                    }}
                    placeholder={deleteTarget.name}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    className="flex-1 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                    onClick={() => { setDeleteTarget(null); setDeleteConfirmName('') }}
                  >
                    取消
                  </button>
                  <button
                    className={cn(
                      'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
                      deleteInputMatch
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'bg-muted text-muted-foreground cursor-not-allowed',
                    )}
                    disabled={!deleteInputMatch}
                    onClick={confirmDeleteChar}
                  >
                    确认删除
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Prompt 编辑对话框 */}
          <Dialog
            open={!!promptEditTarget}
            onOpenChange={(open) => { if (!open) setPromptEditTarget(null) }}
          >
            <DialogContent className="max-w-lg" hideClose>
              <DialogHeader>
                <DialogTitle>
                  编辑人物设定 — {promptEditTarget?.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Textarea
                  value={promptEditValue}
                  onChange={e => { setPromptEditValue(e.target.value); setPromptEditError('') }}
                  placeholder="留空将跟随当前皮肤的人设；填写则覆盖为自定义设定..."
                  className="min-h-[160px] resize-y"
                  maxLength={2000}
                  autoFocus
                />
                {!promptEditValue.trim() && promptEditTarget?.equipped_skin?.description ? (
                  <p className="text-xs text-muted-foreground">
                    留空时，将使用皮肤「{promptEditTarget.equipped_skin.name}」的人设作为提示词
                  </p>
                ) : null}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-red-500">{promptEditError}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {promptEditValue.length}/2000
                  </span>
                </div>
              </div>
              <DialogFooter>
                <button
                  className="flex-1 rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors"
                  onClick={() => setPromptEditTarget(null)}
                  disabled={promptEditSaving}
                >
                  取消
                </button>
                <button
                  className="flex-1 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  onClick={handleSavePrompt}
                  disabled={promptEditSaving}
                >
                  {promptEditSaving ? '保存中...' : '保存'}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  )
}

/** 沙雕币金额：数值变化时 count-up + 脉冲 */
function CoinAmount({ value }: { value: number }): React.ReactElement {
  const [display, setDisplay] = React.useState(value)
  const [pulse, setPulse] = React.useState(false)
  const prevRef = React.useRef(value)

  React.useEffect(() => {
    if (value === prevRef.current) return
    const from = prevRef.current
    const to = value
    prevRef.current = value
    setPulse(true)
    const start = performance.now()
    const DURATION = 400
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
      else setPulse(false)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])

  return (
    <span className={cn('text-lg font-semibold tabular-nums text-amber-500', pulse && 'coin-pulse')}>
      💰 {display.toLocaleString()}
    </span>
  )
}

/**
 * 人物卡片 — 参考皮肤卡片设计，用于人物 tab 的网格布局
 *
 * 每个卡片包含：角色预览图、名称、等级、职业、槽位贡献、经验条。
 * 选中卡片带 ring + "使用中" 徽章，hover 浮起效果。
 * 重命名内联在选中卡片上，删除按钮仅选中时显示。
 */
function CharacterCard({
  char,
  isSelected,
  showDelete,
  localPreviewPath,
  onSelect,
  onRename,
  onDelete,
  onEditPrompt,
}: {
  char: ShadiaoCharacter
  isSelected: boolean
  showDelete: boolean
  localPreviewPath: string
  onSelect: () => void
  onRename: (newName: string) => Promise<void>
  onDelete: () => void
  onEditPrompt: () => void
}): React.ReactElement {
  const [imgSrc, setImgSrc] = React.useState<string | null>(localPreviewPath)
  const [imgFallback, setImgFallback] = React.useState(0) // 0=local, 1=django, 2=icon
  const [isRenaming, setIsRenaming] = React.useState(false)
  const [renameValue, setRenameValue] = React.useState(char.name)
  const renameInputRef = React.useRef<HTMLInputElement>(null)
  const [renaming, setRenaming] = React.useState(false)

  // 同步外部 name 变更
  React.useEffect(() => {
    if (!isRenaming) setRenameValue(char.name)
  }, [char.name, isRenaming])

  const charExp = Math.min(100, Math.round(((char.current_level_xp ?? char.experience) / (char.exp_to_next || 1)) * 100))
  const slots = calcSlotContribution(char.level)

  const handleImgError = () => {
    if (imgFallback === 0 && char.equipped_skin?.preview_url) {
      setImgSrc(char.equipped_skin.preview_url)
      setImgFallback(1)
    } else {
      setImgSrc(null)
      setImgFallback(2)
    }
  }

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsRenaming(true)
    setRenameValue(char.name)
    requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })
  }

  const commitRename = async () => {
    const trimmed = renameValue.trim()
    setIsRenaming(false)
    if (!trimmed || trimmed === char.name || trimmed.length > 30) return
    setRenaming(true)
    try {
      await onRename(trimmed)
    } finally {
      setRenaming(false)
    }
  }

  const handleRenameKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitRename() }
    if (e.key === 'Escape') { e.preventDefault(); setIsRenaming(false); setRenameValue(char.name) }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'group relative flex flex-col rounded-xl border bg-card overflow-hidden transition-all duration-200 text-left',
        'hover:-translate-y-0.5 hover:shadow-md',
        isSelected
          ? 'border-primary/60 ring-2 ring-primary/30 shadow-sm'
          : 'border-border shadow-sm',
      )}
      onClick={() => { if (!isSelected) onSelect() }}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !isSelected) { e.preventDefault(); onSelect() } }}
    >
      {/* 预览图区 */}
      <div className="relative aspect-square bg-muted/30 flex items-center justify-center overflow-hidden">
        {isSelected && (
          <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary text-[9px] font-medium text-primary-foreground shadow-sm z-10">
            <Check className="size-2.5" />
            使用中
          </div>
        )}
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={char.name}
            className="w-full h-full object-cover object-top"
            onError={handleImgError}
          />
        ) : (
          <User className="size-10 text-muted-foreground/40" />
        )}
      </div>

      {/* 信息栏 */}
      <div className="flex flex-col gap-0.5 px-2.5 py-2 border-t border-border/60">
        {/* 名称行 */}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="w-full bg-transparent border-b border-primary text-[12px] font-medium outline-none"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleRenameKey}
            maxLength={30}
            onClick={e => e.stopPropagation()}
            disabled={renaming}
          />
        ) : (
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[12px] font-medium truncate">{char.name}</span>
            {isSelected && (
              <button
                className="shrink-0 p-0.5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors"
                onClick={startRename}
                title="重命名"
              >
                <Edit3 className="size-2.5" />
              </button>
            )}
            <button
              className="shrink-0 p-0.5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors ml-auto"
              onClick={e => { e.stopPropagation(); onEditPrompt() }}
              title="编辑人物设定"
            >
              <FileText className="size-2.5" />
            </button>
          </div>
        )}

        {/* 等级 + 职业 */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-muted-foreground">Lv.{char.level}</span>
          {char.character_class && (
            <span className="text-[10px] text-muted-foreground/70 truncate">· {char.character_class.name}</span>
          )}
          {slots > 0 && (
            <span className="text-[8px] px-1 py-px rounded-full bg-emerald-500/10 text-emerald-600 font-medium ml-auto">
              +{slots} 槽
            </span>
          )}
        </div>

        {/* 经验条 */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-400 to-purple-400 transition-all duration-500"
              style={{ width: `${charExp}%` }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground/60 tabular-nums">{charExp}%</span>
        </div>

        {/* 操作按钮 */}
        {isSelected && showDelete && (
          <button
            className="mt-1 flex items-center justify-center gap-1 w-full py-1 rounded text-[10px] text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
            onClick={e => { e.stopPropagation(); onDelete() }}
          >
            <Trash2 className="size-2.5" />
            删除
          </button>
        )}
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-[13px] mt-0.5 break-words">{value}</div>
      </div>
    </div>
  )
}

/**
 * 皮肤卡片组件
 */
function SkinCard({
  skin,
  isEquipped,
  disabled,
  statusText,
  localPreviewPath,
  onEquip,
  rarityLabels,
}: {
  skin: { id: number; name: string; rarity: string; preview_url?: string; rive_asset_id: string; quantity?: number }
  isEquipped: boolean
  disabled?: boolean
  statusText?: string
  localPreviewPath: string
  onEquip: () => void
  rarityLabels: Record<string, string>
}): React.ReactElement {
  const [imgSrc, setImgSrc] = React.useState<string | null>(localPreviewPath)
  const [fallbackStage, setFallbackStage] = React.useState(0)

  const handleImgError = () => {
    if (fallbackStage === 0 && skin.preview_url) {
      setImgSrc(skin.preview_url)
      setFallbackStage(1)
    } else {
      setImgSrc(null)
      setFallbackStage(2)
    }
  }

  const rarityColor = {
    default:   'bg-slate-300',
    common:    'bg-emerald-400',
    rare:      'bg-blue-400',
    epic:      'bg-purple-400',
    legendary: 'bg-amber-400',
  }[skin.rarity] || 'bg-slate-400'

  return (
    <button
      className={cn(
        'group relative flex flex-col rounded-xl border bg-card overflow-hidden transition-all duration-200',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-0.5 hover:shadow-md',
        isEquipped
          ? 'border-primary/60 ring-2 ring-primary/30 shadow-sm'
          : 'border-border shadow-sm',
      )}
      onClick={disabled ? undefined : onEquip}
      disabled={disabled}
    >
      <div className="relative aspect-square bg-muted/30 flex items-center justify-center overflow-hidden">
        {isEquipped && (
          <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary text-[9px] font-medium text-primary-foreground shadow-sm z-10">
            <Check className="size-2.5" />
            使用中
          </div>
        )}
        {disabled && statusText && !isEquipped && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
            <span className="text-[10px] text-muted-foreground font-medium px-2 py-1 rounded bg-background/80">
              {statusText}
            </span>
          </div>
        )}
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={skin.name}
            className="w-full h-full object-cover object-top"
            onError={handleImgError}
          />
        ) : (
          <Shield className="size-10 text-muted-foreground/40" />
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-2.5 py-2 border-t border-border/60">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[12px] font-medium truncate">{skin.name}</span>
          {'quantity' in skin && (skin.quantity ?? 1) > 1 && (
            <span className="text-[9px] text-muted-foreground shrink-0">×{skin.quantity}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className={cn('inline-block size-1.5 rounded-full shrink-0', rarityColor)} />
          <span className="text-[10px] text-muted-foreground">
            {rarityLabels[skin.rarity] || skin.rarity}
          </span>
        </div>
      </div>
    </button>
  )
}
