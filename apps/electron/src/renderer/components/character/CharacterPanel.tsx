import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { X, User, Zap, Shield, Star, Edit3, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  charactersAtom, selectedCharacterAtom, mySkinsAtom, inventoryAtom,
  type ShadiaoCharacter, type Skin, type UserItem,
} from '@/atoms/character-atoms'

interface CharacterPanelProps {
  open: boolean
  onClose: () => void
  onEdit: (char: ShadiaoCharacter) => void
}

export function CharacterPanel({ open, onClose, onEdit }: CharacterPanelProps): React.ReactElement | null {
  const [characters, setCharacters] = useAtom(charactersAtom)
  const [selected, setSelected] = useAtom(selectedCharacterAtom)
  const mySkins = useAtomValue(mySkinsAtom)
  const inventory = useAtomValue(inventoryAtom)
  const [tab, setTab] = React.useState<'info' | 'skins' | 'items'>('info')

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
      // 刷新人物数据
      const r = await window.electronAPI.getCharacter?.(selected.id)
      if (r?.success && r.data) {
        setSelected(r.data)
        setCharacters(prev => prev.map(c => c.id === r.data.id ? r.data : c))
      }
    } catch (e) { console.error('装备皮肤失败:', e) }
  }

  const rarityStyles: Record<string, string> = {
    '普通': 'border-slate-300 text-slate-600',
    '稀有': 'border-blue-400 text-blue-600',
    '史诗': 'border-purple-400 text-purple-600',
    '传说': 'border-amber-400 text-amber-600',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/30" onClick={onClose}>
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
              {(['info', 'skins', 'items'] as const).map(t => (
                <button
                  key={t}
                  className={cn(
                    'flex-1 py-2 text-xs font-medium transition-colors',
                    tab === t ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setTab(t)}
                >
                  {t === 'info' ? '人物信息' : t === 'skins' ? `皮肤 (${mySkins.length})` : `背包 (${inventory.length})`}
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
                  <div className="grid grid-cols-3 gap-2">
                    {mySkins.map(skin => (
                      <button
                        key={skin.id}
                        className={cn(
                          'flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors hover:bg-muted/50',
                          char.equipped_skin?.id === skin.id ? 'border-primary bg-primary/5' : 'border-border',
                        )}
                        onClick={() => handleEquipSkin(skin)}
                      >
                        <div className="flex size-12 items-center justify-center rounded-full bg-muted/50">
                          {skin.preview_url ? (
                            <img src={skin.preview_url} alt={skin.name} className="size-12 rounded-full object-cover" />
                          ) : (
                            <Shield className="size-5 text-muted-foreground" />
                          )}
                        </div>
                        <span className="text-[10px] font-medium truncate w-full text-center">{skin.name}</span>
                        <span className={cn('text-[9px] px-1.5 py-px rounded-full border', rarityStyles[skin.rarity] || 'border-slate-300 text-slate-600')}>
                          {skin.rarity}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 背包 Tab */}
            {tab === 'items' && (
              <div className="p-4">
                {inventory.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-8">
                    暂无道具
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {inventory.map(item => (
                      <div key={item.id} className="flex items-center gap-2.5 p-2 rounded-lg border border-border">
                        <div className="flex size-8 items-center justify-center rounded bg-muted/50 shrink-0">
                          {item.icon_url ? (
                            <img src={item.icon_url} alt="" className="size-6 object-contain" />
                          ) : (
                            <Zap className="size-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{item.name}</div>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span className={cn('px-1 py-px rounded-full border', rarityStyles[item.rarity])}>
                              {item.rarity}
                            </span>
                            <span>x{item.quantity}</span>
                          </div>
                        </div>
                        {item.equipped ? (
                          <span className="text-[10px] text-primary font-medium">已装备</span>
                        ) : (
                          <button
                            className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            onClick={() => window.electronAPI.equipItem?.(item.id)}
                          >
                            装备
                          </button>
                        )}
                      </div>
                    ))}
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
    </div>
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
