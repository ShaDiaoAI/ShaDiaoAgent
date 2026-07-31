import * as React from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { X } from 'lucide-react'
import { charactersAtom, type ShadiaoCharacter } from '@/atoms/character-atoms'
import { agentWorkspacesAtom } from '@/atoms/agent-atoms'

interface CharacterCreateProps {
  open: boolean
  editChar?: ShadiaoCharacter | null
  onClose: () => void
  onCreated?: (char: ShadiaoCharacter) => void
}

export function CharacterCreate({ open, editChar, onClose, onCreated }: CharacterCreateProps): React.ReactElement | null {
  const [characters, setCharacters] = useAtom(charactersAtom)
  const setWorkspaces = useSetAtom(agentWorkspacesAtom)
  const [name, setName] = React.useState('')
  const [systemPrompt, setSystemPrompt] = React.useState('')
  const [boundModel, setBoundModel] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')

  const isEdit = !!editChar

  React.useEffect(() => {
    if (editChar) {
      setName(editChar.name)
      setSystemPrompt(editChar.system_prompt || '')
      setBoundModel(editChar.bound_model || '')
    } else {
      setName('')
      setSystemPrompt('')
      setBoundModel('')
    }
    setError('')
  }, [editChar, open])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('请输入人物名称'); return }

    setSaving(true)
    setError('')
    try {
      if (isEdit && editChar) {
        const r = await window.electronAPI.updateCharacter?.(editChar.id, {
          name: name.trim(),
          system_prompt: systemPrompt.trim(),
          bound_model: boundModel.trim(),
        })
        if (r?.success && r.data) {
          setCharacters(prev => prev.map(c => c.id === r.data.id ? r.data : c))
          // 🆕 人物名称变更时同步更新左侧栏项目名称
          if (name.trim() !== editChar.name) {
            setWorkspaces(prev => prev.map(w =>
              w.id === `char-${r.data.id}` ? { ...w, name: r.data.name, updatedAt: Date.now() } : w
            ))
          }
        }
      } else {
        const r = await window.electronAPI.createCharacter?.({
          name: name.trim(),
          system_prompt: systemPrompt.trim(),
          bound_model: boundModel.trim(),
        })
        if (r?.success && r.data) {
          setCharacters(prev => [...prev, r.data])
          onCreated?.(r.data)
        }
      }
      onClose()
    } catch (e: any) {
      setError(e?.message || '操作失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/30" onClick={onClose}>
      <div
        className="relative w-full max-w-sm rounded-xl border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">{isEdit ? '编辑人物' : '创建人物'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* 名称 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">名称 *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如：虾仁、甲、乙"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              autoFocus
              maxLength={30}
            />
          </div>

          {/* 绑定模型 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">绑定模型（可选）</label>
            <input
              type="text"
              value={boundModel}
              onChange={e => setBoundModel(e.target.value)}
              placeholder="留空使用默认模型"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          {/* 系统提示词 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">系统提示词（可选）</label>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              placeholder="为此人物设置独特的性格和行为方式..."
              rows={4}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
              maxLength={2000}
            />
            <div className="text-[10px] text-muted-foreground text-right mt-0.5">
              {systemPrompt.length}/2000
            </div>
          </div>

          {/* 错误信息 */}
          {error && (
            <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {/* 按钮 */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? '保存中...' : isEdit ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
