/**
 * CharacterPanelView — 「人物管理」全屏视图
 *
 * 由侧边栏人物齿轮图标或皮肤盲盒按钮触发，全屏占据中间内容区。
 * 布局与 AgentSkillsView 一致：大标题 + pill tab 切换 + 内容区。
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { User, Zap, Shield, Star, Edit3, Trash2, Gift, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  charactersAtom, selectedCharacterAtom, mySkinsAtom,
  walletAtom, gachaProgressAtom, gachaHistoryAtom,
  type ShadiaoCharacter, type Skin,
} from '@/atoms/character-atoms'
import { characterPanelTabAtom, type CharacterPanelTab } from '@/atoms/active-view'

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
  const [tab, setTab] = useAtom(characterPanelTabAtom)
  const [drawing, setDrawing] = React.useState(false)
  const [drawError, setDrawError] = React.useState<string | null>(null)
  const [editOpen, setEditOpen] = React.useState(false)

  const char = selected

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
  }, [setGachaProgress, setWallet, setMySkins])

  const handleDelete = async (c: ShadiaoCharacter) => {
    if (!confirm(`确定要删除「${c.name}」吗？此操作不可撤销。`)) return
    try {
      await window.electronAPI.deleteCharacter?.(c.id)
      const updated = characters.filter(ch => ch.id !== c.id)
      setCharacters(updated)
      if (selected?.id === c.id) setSelected(updated[0] || null)
    } catch (e) { console.error('删除失败:', e) }
  }

  const handleEquipSkin = async (skin: Skin) => {
    if (!selected) return
    try {
      await window.electronAPI.equipSkin?.(selected.id, skin.id)
      const r = await window.electronAPI.getCharacter?.(selected.id)
      if (r?.success && r.data) {
        setSelected(r.data)
        setCharacters(prev => prev.map(c => c.id === r.data.id ? r.data : c))
        toast.success(`已为「${selected.name}」装备皮肤「${skin.name}」`)
      }
    } catch (e) { toast.error('装备皮肤失败') }
  }

  const handleDraw = async (count: number) => {
    setDrawing(true)
    setDrawError(null)
    try {
      const r = await window.electronAPI.drawGacha?.(count)
      if (r?.success && r.data) {
        setGachaHistory(prev => [...r.data.results, ...prev])
        window.electronAPI.getWallet?.().then((wr: any) => {
          if (wr?.success && wr.data) setWallet(wr.data)
        }).catch(() => {})
        window.electronAPI.getGachaProgress?.().then((pr: any) => {
          if (pr?.success && pr.data) setGachaProgress(pr.data)
        }).catch(() => {})
        window.electronAPI.mySkins?.().then((sr: any) => {
          if (sr?.success && sr.data) setMySkins(sr.data)
        }).catch(() => {})
      } else {
        setDrawError(r?.error || '抽奖失败')
      }
    } catch (e) {
      setDrawError((e as Error).message)
    } finally {
      setDrawing(false)
    }
  }

  // WoW 风格稀有度：白/蓝/紫/橙
  const rarityStyles: Record<string, string> = {
    'common': 'border-slate-300 text-slate-500 bg-white/50',
    'rare': 'border-blue-400 text-blue-600 bg-blue-50/50',
    'epic': 'border-purple-400 text-purple-600 bg-purple-50/50',
    'legendary': 'border-amber-400 text-amber-600 bg-amber-50/50',
  }
  const rarityLabels: Record<string, string> = {
    'common': '普通',
    'rare': '稀有',
    'epic': '史诗',
    'legendary': '传说',
  }

  const tabs: { value: CharacterPanelTab; label: string; count?: number }[] = [
    { value: 'info', label: '人物信息' },
    { value: 'skins', label: '皮肤', count: mySkins.length },
    { value: 'gacha', label: '盲盒' },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 标题栏 — 与 AgentSkillsView 一致 */}
      <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between px-8 pt-14 pb-4">
        <div className="flex items-center gap-2.5">
          <User className="size-6 text-foreground/70" />
          <h1 className="text-2xl font-semibold text-foreground">人物管理</h1>
        </div>
      </div>

      {/* Pill tab 切换 — 与 AgentSkillsView 工具条一致 */}
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
                请先在左侧栏创建一个人物
              </div>
            </div>
          )}

          {char && (
            <>
              {/* 人物信息 Tab */}
              {tab === 'info' && (
                <div className="max-w-md space-y-4">
                  {/* 人物概要 — 紧凑排版，名称+等级+经验条一条线 */}
                  <div className="rounded-xl border px-4 py-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="font-semibold">{char.name}</h3>
                      <span className="text-[11px] text-muted-foreground">Lv.{char.level}</span>
                      {char.character_class && (
                        <span className="text-[11px] text-muted-foreground/70">· {char.character_class.name}</span>
                      )}
                      <button onClick={() => setEditOpen(true)} className="p-0.5 rounded hover:bg-muted transition-colors ml-auto">
                        <Edit3 className="size-3 text-muted-foreground" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-700"
                          style={{ width: `${Math.round((char.experience / (char.exp_to_next || 1)) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                        {char.experience}/{char.exp_to_next}
                      </span>
                    </div>
                  </div>

                  {/* 属性信息 */}
                  <div className="rounded-xl border divide-y">
                    <InfoRow icon={Zap} label="系统提示词" value={char.system_prompt || '（未设置）'} />
                    <InfoRow icon={Shield} label="当前使用模型" value={char.bound_model || '（默认）'} />
                    <InfoRow icon={Star} label="职业" value={char.character_class?.name || '（无）'} />
                  </div>
                  {char.equipped_items.length > 0 && (
                    <div className="rounded-xl border p-4">
                      <div className="text-xs text-muted-foreground mb-2">已装备道具</div>
                      <div className="flex flex-wrap gap-1.5">
                        {char.equipped_items.map(item => (
                          <span key={item.id} className="px-2 py-0.5 rounded text-[11px] bg-muted text-muted-foreground">
                            {item.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* 删除 */}
                  <div className="pt-2">
                    <button
                      className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 transition-colors"
                      onClick={() => handleDelete(char)}
                    >
                      <Trash2 className="size-3" />
                      删除此人物
                    </button>
                  </div>
                </div>
              )}

              {/* 皮肤 Tab */}
              {tab === 'skins' && (
                <div>
                  {mySkins.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                      <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground/[0.04]">
                        <Shield className="size-8 text-foreground/30" />
                      </div>
                      <div className="text-[15px] font-medium text-foreground/80">暂无皮肤</div>
                      <div className="max-w-sm text-[13px] text-foreground/50">
                        使用 Agent 消耗 token 有机会获得皮肤，或前往盲盒抽取
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        点击皮肤即可为当前人物「<span className="font-medium text-foreground/80">{char.name}</span>」装备
                      </p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                        {mySkins.map(skin => {
                          const isEquipped = char.equipped_skin?.id === skin.id
                          return (
                            <button
                              key={skin.id}
                              className={cn(
                                'relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors hover:bg-muted/50',
                                isEquipped ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border',
                              )}
                              onClick={() => handleEquipSkin(skin)}
                            >
                              {isEquipped && (
                                <div className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary text-[9px] font-medium text-primary-foreground shadow-sm z-10">
                                  <Check className="size-2.5" />
                                  使用中
                                </div>
                              )}
                              <div className="flex size-16 items-center justify-center rounded-full bg-muted/50">
                                {skin.preview_url ? (
                                  <img src={skin.preview_url} alt={skin.name} className="size-16 rounded-full object-cover" />
                                ) : (
                                  <Shield className="size-6 text-muted-foreground" />
                                )}
                              </div>
                              <span className="text-[11px] font-medium truncate w-full text-center">{skin.name}</span>
                              <span className={cn('text-[9px] px-1.5 py-px rounded-full border', rarityStyles[skin.rarity] || 'border-slate-300 text-slate-600')}>
                                {rarityLabels[skin.rarity] || skin.rarity}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 盲盒 Tab */}
              {tab === 'gacha' && (
                <div className="max-w-md space-y-5">
                  {/* 沙雕币余额 */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border">
                    <span className="text-sm text-muted-foreground">沙雕币</span>
                    <span className="text-lg font-semibold tabular-nums text-amber-500">
                      💰 {wallet?.coins?.toLocaleString() ?? gachaProgress?.coins?.toLocaleString() ?? '—'}
                    </span>
                  </div>

                  {/* 抽奖按钮 */}
                  <div className="flex gap-3">
                    <button
                      disabled={drawing || !gachaProgress?.can_single_draw}
                      onClick={() => handleDraw(1)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-colors',
                        gachaProgress?.can_single_draw && !drawing
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'bg-muted text-muted-foreground cursor-not-allowed',
                      )}
                    >
                      <Gift size={16} />
                      <span>单抽</span>
                      <span className="text-xs opacity-70">{gachaProgress?.single_draw_cost ?? '—'} 币</span>
                    </button>
                    <button
                      disabled={drawing || !gachaProgress?.can_multi_draw}
                      onClick={() => handleDraw(5)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-colors',
                        gachaProgress?.can_multi_draw && !drawing
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'bg-muted text-muted-foreground cursor-not-allowed',
                      )}
                    >
                      <Gift size={16} />
                      <span>5 连抽</span>
                      <span className="text-xs opacity-70">{gachaProgress?.multi_draw_cost ?? '—'} 币</span>
                    </button>
                  </div>

                  {/* 进度条 */}
                  {gachaProgress && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>距下次单抽</span>
                        <span className="tabular-nums">{gachaProgress.progress_to_single}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all duration-500"
                          style={{ width: `${gachaProgress.progress_to_single}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 错误提示 */}
                  {drawError && (
                    <div className="text-xs text-red-500 text-center">{drawError}</div>
                  )}

                  {/* 获得记录 */}
                  {gachaHistory.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-2">获得记录</div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {gachaHistory.slice(0, 15).map((r, i) => (
                          <div key={i} className="flex items-center gap-3 p-2 rounded-lg text-xs border border-border/60">
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted/50">
                              {r.skin.preview_url ? (
                                <img src={r.skin.preview_url} alt="" className="size-7 rounded-full object-cover" />
                              ) : (
                                <Shield className="size-3.5 text-muted-foreground" />
                              )}
                            </div>
                            <span className="flex-1 truncate font-medium">{r.skin.name}</span>
                            <span className={cn('text-[9px] px-1.5 py-px rounded-full border shrink-0', rarityStyles[r.skin.rarity] || 'border-slate-300 text-slate-600')}>
                              {rarityLabels[r.skin.rarity] || r.skin.rarity}
                            </span>
                            {r.is_new ? (
                              <span className="text-[11px] text-emerald-500 font-medium shrink-0">🆕</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground shrink-0">×{r.quantity}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 编辑弹窗占位 — 保持 CharacterCreate 的调用方式 */}
      {editOpen && char && (
        <CharacterEditWrapper
          char={char}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setSelected(updated)
            setCharacters(prev => prev.map(c => c.id === updated.id ? updated : c))
            setEditOpen(false)
          }}
        />
      )}
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
 * 轻量编辑包装 — 调用 CharacterCreate 编辑模式
 */
function CharacterEditWrapper({ char, onClose, onSaved }: {
  char: ShadiaoCharacter
  onClose: () => void
  onSaved: (char: ShadiaoCharacter) => void
}): React.ReactElement {
  return (
    <div className="fixed inset-0 z-[99999] flex items-start justify-center pt-[10vh] bg-black/30" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-xl border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-sm">编辑人物</h3>
        </div>
        <div className="p-4 space-y-3">
          <EditForm char={char} onSaved={onSaved} onCancel={onClose} />
        </div>
      </div>
    </div>
  )
}

function EditForm({ char, onSaved, onCancel }: {
  char: ShadiaoCharacter
  onSaved: (char: ShadiaoCharacter) => void
  onCancel: () => void
}): React.ReactElement {
  const [name, setName] = React.useState(char.name)
  const [saving, setSaving] = React.useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const r = await window.electronAPI.updateCharacter(char.id, { name: name.trim() })
      if (r?.success && r.data) {
        onSaved(r.data)
      }
    } catch (e) { console.error('更新失败:', e) }
    finally { setSaving(false) }
  }

  return (
    <>
      <div>
        <label className="text-[10px] text-muted-foreground">人物名称</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          maxLength={30}
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors">
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="px-4 py-1.5 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </>
  )
}
