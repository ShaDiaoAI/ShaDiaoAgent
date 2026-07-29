import * as React from 'react'
import { createPortal } from 'react-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { X, User, Zap, Shield, Star, Edit3, Trash2, Gift, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  charactersAtom, selectedCharacterAtom, mySkinsAtom,
  walletAtom, gachaProgressAtom, gachaHistoryAtom,
  type ShadiaoCharacter, type Skin, type DrawResult,
} from '@/atoms/character-atoms'

// 为 modal portal 创建稳定容器，确保脱离 sidebar stacking context
let portalRoot: HTMLDivElement | null = null
function getPortalRoot(): HTMLDivElement {
  if (!portalRoot || !document.body.contains(portalRoot)) {
    portalRoot = document.createElement('div')
    portalRoot.id = 'character-panel-portal'
    portalRoot.style.position = 'relative'
    portalRoot.style.zIndex = '99999'
    document.body.appendChild(portalRoot)
  }
  return portalRoot
}

interface CharacterPanelProps {
  open: boolean
  onClose: () => void
  onEdit: (char: ShadiaoCharacter) => void
  initialTab?: 'info' | 'skins' | 'gacha'
}

export function CharacterPanel({ open, onClose, onEdit, initialTab = 'info' }: CharacterPanelProps): React.ReactElement | null {
  const [characters, setCharacters] = useAtom(charactersAtom)
  const [selected, setSelected] = useAtom(selectedCharacterAtom)
  const mySkins = useAtomValue(mySkinsAtom)
  const setMySkins = useSetAtom(mySkinsAtom)
  const wallet = useAtomValue(walletAtom)
  const gachaProgress = useAtomValue(gachaProgressAtom)
  const [gachaHistory, setGachaHistory] = useAtom(gachaHistoryAtom)
  const setWallet = useSetAtom(walletAtom)
  const setGachaProgress = useSetAtom(gachaProgressAtom)
  const [tab, setTab] = React.useState<'info' | 'skins' | 'gacha'>(initialTab)
  const [drawing, setDrawing] = React.useState(false)
  const [drawError, setDrawError] = React.useState<string | null>(null)

  // 每次打开面板时同步 initialTab
  React.useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  // 打开面板时拉取盲盒数据
  React.useEffect(() => {
    if (!open) return
    window.electronAPI.getGachaProgress?.().then((r: any) => {
      if (r?.success && r.data) setGachaProgress(r.data)
    }).catch(() => {})
    window.electronAPI.getWallet?.().then((r: any) => {
      if (r?.success && r.data) setWallet(r.data)
    }).catch(() => {})
    window.electronAPI.mySkins?.().then((r: any) => {
      if (r?.success && r.data) setMySkins(r.data)
    }).catch(() => {})
  }, [open, setGachaProgress, setWallet, setMySkins])

  if (!open) return null

  const char = selected
  const expPercent = char ? Math.round((char.experience / (char.exp_to_next || 1)) * 100) : 0

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

  const node = getPortalRoot()
  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-start justify-center pt-[10vh] bg-black/30" onClick={onClose}>
      <div
        className="relative w-full max-w-md max-h-[70vh] overflow-y-auto rounded-xl border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b bg-card/95 backdrop-blur">
          <h2 className="font-semibold">人物管理</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
            <X className="size-4" />
          </button>
        </div>

        {!char && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            暂无人物，请先创建一个
          </div>
        )}

        {char && (
          <>
            {/* 当前人物概要 */}
            <div className="p-4 flex items-center gap-4 border-b bg-muted/30">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400/40 to-purple-400/40 ring-2 ring-border">
                {char.equipped_skin?.preview_url ? (
                  <img src={char.equipped_skin.preview_url} alt="" className="size-14 rounded-full object-cover" />
                ) : (
                  <User className="size-7 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg">{char.name}</h3>
                  <button onClick={() => onEdit(char)} className="p-0.5 rounded hover:bg-muted transition-colors">
                    <Edit3 className="size-3 text-muted-foreground" />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span>Lv.{char.level}</span>
                  {char.character_class && <span>· {char.character_class.name}</span>}
                  {char.bound_model && <span>· {char.bound_model}</span>}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-700"
                      style={{ width: `${expPercent}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {char.experience}/{char.exp_to_next}
                  </span>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b">
              {(['info', 'skins', 'gacha'] as const).map(t => (
                <button
                  key={t}
                  className={cn(
                    'flex-1 py-2 text-xs font-medium transition-colors',
                    tab === t ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setTab(t)}
                >
                  {t === 'info' ? '人物信息' : t === 'skins' ? `皮肤 (${mySkins.length})` : '盲盒'}
                </button>
              ))}
            </div>

            {/* 人物信息 Tab */}
            {tab === 'info' && (
              <div className="p-4 space-y-3">
                <InfoRow icon={Zap} label="系统提示词" value={char.system_prompt || '（未设置）'} />
                <InfoRow icon={Shield} label="绑定模型" value={char.bound_model || '（默认）'} />
                <InfoRow icon={Star} label="职业" value={char.character_class?.name || '（无）'} />
                {char.equipped_items.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">已装备道具</div>
                    <div className="flex flex-wrap gap-1.5">
                      {char.equipped_items.map(item => (
                        <span key={item.id} className="px-2 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                          {item.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 皮肤 Tab */}
            {tab === 'skins' && (
              <div className="p-4">
                {mySkins.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-8">
                    暂无皮肤，使用 Agent 消耗 token 有机会获得
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      点击皮肤即可为当前人物「<span className="font-medium text-foreground/80">{char.name}</span>」装备
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {mySkins.map(skin => {
                        const isEquipped = char.equipped_skin?.id === skin.id
                        return (
                          <button
                            key={skin.id}
                            className={cn(
                              'relative flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors hover:bg-muted/50',
                              isEquipped ? 'border-primary bg-primary/5' : 'border-border',
                            )}
                            onClick={() => handleEquipSkin(skin)}
                          >
                            {isEquipped && (
                              <div className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary text-[9px] font-medium text-primary-foreground shadow-sm z-10">
                                <Check className="size-2.5" />
                                使用中
                              </div>
                            )}
                            <div className="flex size-12 items-center justify-center rounded-full bg-muted/50">
                              {skin.preview_url ? (
                                <img src={skin.preview_url} alt={skin.name} className="size-12 rounded-full object-cover" />
                              ) : (
                                <Shield className="size-5 text-muted-foreground" />
                              )}
                            </div>
                            <span className="text-[10px] font-medium truncate w-full text-center">{skin.name}</span>
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
              <div className="p-4 space-y-4">
                {/* 沙雕币余额 */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                  <span className="text-xs text-muted-foreground">沙雕币</span>
                  <span className="text-sm font-semibold tabular-nums text-amber-500">
                    💰 {wallet?.coins?.toLocaleString() ?? gachaProgress?.coins?.toLocaleString() ?? '—'}
                  </span>
                </div>

                {/* 抽奖按钮 */}
                <div className="flex gap-2">
                  <button
                    disabled={drawing || !gachaProgress?.can_single_draw}
                    onClick={() => handleDraw(1)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-colors',
                      gachaProgress?.can_single_draw && !drawing
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'bg-muted text-muted-foreground cursor-not-allowed',
                    )}
                  >
                    <Gift size={14} />
                    <span>单抽</span>
                    <span className="text-[10px] opacity-70">{gachaProgress?.single_draw_cost ?? '—'} 币</span>
                  </button>
                  <button
                    disabled={drawing || !gachaProgress?.can_multi_draw}
                    onClick={() => handleDraw(5)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-colors',
                      gachaProgress?.can_multi_draw && !drawing
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'bg-muted text-muted-foreground cursor-not-allowed',
                    )}
                  >
                    <Gift size={14} />
                    <span>5 连抽</span>
                    <span className="text-[10px] opacity-70">{gachaProgress?.multi_draw_cost ?? '—'} 币</span>
                  </button>
                </div>

                {/* 进度条 */}
                {gachaProgress && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>距下次单抽</span>
                      <span className="tabular-nums">{gachaProgress.progress_to_single}%</span>
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all duration-500"
                        style={{ width: `${gachaProgress.progress_to_single}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 错误提示 */}
                {drawError && (
                  <div className="text-[11px] text-red-500 text-center">{drawError}</div>
                )}

                {/* 获得记录 */}
                {gachaHistory.length > 0 && (
                  <div>
                    <div className="text-[11px] font-medium text-muted-foreground mb-2">获得记录</div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {gachaHistory.slice(0, 10).map((r, i) => (
                        <div key={i} className="flex items-center gap-2 p-1.5 rounded text-[11px] border border-border/60">
                          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted/50">
                            {r.skin.preview_url ? (
                              <img src={r.skin.preview_url} alt="" className="size-6 rounded-full object-cover" />
                            ) : (
                              <Shield className="size-3 text-muted-foreground" />
                            )}
                          </div>
                          <span className="flex-1 truncate">{r.skin.name}</span>
                          <span className={cn('text-[9px] px-1.5 py-px rounded-full border shrink-0', rarityStyles[r.skin.rarity] || 'border-slate-300 text-slate-600')}>
                            {rarityLabels[r.skin.rarity] || r.skin.rarity}
                          </span>
                          {r.is_new ? (
                            <span className="text-[10px] text-emerald-500 font-medium shrink-0">🆕</span>
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

            {/* 删除按钮 */}
            <div className="p-4 border-t">
              <button
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 transition-colors"
                onClick={() => handleDelete(char)}
              >
                <Trash2 className="size-3" />
                删除此人物
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    node,
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className="text-xs mt-0.5 break-words">{value}</div>
      </div>
    </div>
  )
}