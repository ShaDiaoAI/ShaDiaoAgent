/**
 * 技能编辑区 — 用户级唯一技能（名称 ≤20 字 + prompt ≤100 字）
 *
 * 2026-09-03 字数计数对齐输入框 + 有效字数可视化：
 * - 名称 / prompt 并排两列（名称窄、prompt 宽），保存按钮在 prompt 输入框右侧
 * - 字数计数对齐到输入框右边缘（不再压在保存按钮上方）
 * - prompt 下方「有效字数刻度条」：文治 × 2 = 有效字数上限，超出部分红色警示
 *
 * 保存走 PUT /api/skill（部分更新，可只改其一）。
 * 语义提示：技能 prompt 越长，伤害越高——但被文治限制了发挥上限（token=伤害）。
 */

import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { toast } from 'sonner'
import { skillAtom, mapSkill } from '@/atoms/pve-atoms'
import { selectedCharacterAtom } from '@/atoms/character-atoms'
import { getStat } from '@shadiao/shared'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** 文治 → 有效字数上限系数（对齐后端 BattleConfig.wen_zhi_prompt_mult 默认值） */
const WEN_ZHI_PROMPT_MULT = 2

/** 技能系统 ? 说明（token=伤害、文治上限、名称进台词） */
function SkillHelpTooltip(): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          className="inline-flex size-3.5 items-center justify-center rounded-full bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 text-[9px] font-bold leading-none cursor-help"
          aria-label="技能说明"
        >
          ?
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px]">
        <div className="space-y-1 text-xs">
          <p className="font-medium">技能 = 你的战斗招式，决定基础伤害</p>
          <p className="text-muted-foreground">名称：会念进战斗台词（如「使出一招『降龙十八掌』」）</p>
          <p className="text-muted-foreground">提示词：招式描述，越长（token 越多）基础伤害越高</p>
          <p className="text-muted-foreground">上限：受「文治」属性限制，文治越高可发挥的伤害上限越高</p>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

/** 文治说明 ? — 解释「文治 = 有效字数」关系 */
function WenZhiHelpTooltip(): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          className="inline-flex size-3.5 items-center justify-center rounded-full bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 text-[9px] font-bold leading-none cursor-help"
          aria-label="文治说明"
        >
          ?
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px]">
        <p className="text-xs leading-relaxed">
          文治越高，有效字数上限越高（上限 = 文治 × {WEN_ZHI_PROMPT_MULT}）。加点文治可发挥更长的招式。
        </p>
      </TooltipContent>
    </Tooltip>
  )
}

export function PveSkillEditor(): React.ReactElement {
  const [skill, setSkill] = useAtom(skillAtom)
  const selectedChar = useAtomValue(selectedCharacterAtom)
  const [name, setName] = React.useState('')
  const [prompt, setPrompt] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  // 有效字数：文治 × 系数（没选人物 → null，显示占位提示）
  const wenZhi = selectedChar ? Math.max(1, getStat(selectedChar.effective_stats, 'wen_zhi')) : null
  const effectiveLimit = wenZhi != null ? wenZhi * WEN_ZHI_PROMPT_MULT : null
  const effectiveLen = effectiveLimit != null ? Math.min(prompt.length, effectiveLimit) : 0
  const overflow = effectiveLimit != null ? Math.max(0, prompt.length - effectiveLimit) : 0

  // 技能数据加载/变化时同步到本地编辑态
  React.useEffect(() => {
    setName(skill?.name ?? '')
    setPrompt(skill?.prompt ?? '')
  }, [skill?.name, skill?.prompt])

  const save = async () => {
    const trimmedName = name.trim()
    if (trimmedName.length > 20) {
      toast.error('技能名不超过 20 字')
      return
    }
    if (prompt.length > 100) {
      toast.error('技能 prompt 不超过 100 字')
      return
    }
    setSaving(true)
    try {
      const r = await window.electronAPI.skillUpdate({
        name: trimmedName || undefined,
        prompt,
      })
      if (r?.success && r.data) {
        setSkill(mapSkill(r.data))
        toast.success('技能已保存')
      } else {
        toast.error('技能保存失败，请重试')
      }
    } catch {
      toast.error('技能保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* 标题行（保存按钮移到 prompt 输入框右侧） */}
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-semibold">技能</h3>
        <SkillHelpTooltip />
      </div>

      {/* 名称 / prompt 并排两列 */}
      <div className="flex gap-3">
        {/* 技能名称（窄列） */}
        <div className="w-[28%] shrink-0 space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">技能名称</label>
            <span className="text-[10px] text-muted-foreground tabular-nums">{name.length}/20</span>
          </div>
          <Input
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            placeholder="无名招式"
            className="h-9"
          />
        </div>

        {/* 技能 prompt（宽列） */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              {/* 字数计数放进输入列，右对齐到输入框（不再压到保存按钮上方） */}
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">技能提示词</label>
                <span className="text-[10px] text-muted-foreground tabular-nums">{prompt.length}/100</span>
              </div>
              <Input
                value={prompt}
                maxLength={100}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述你的招式（token 越长伤害越高）..."
                className="h-9 w-full"
              />

              {/* 有效字数刻度条 + 数字 */}
              {wenZhi != null ? (
                <div className="space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-[width] duration-300"
                      style={{ width: `${effectiveLimit > 0 ? (effectiveLen / effectiveLimit) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {overflow > 0 ? (
                        <>
                          文治 {wenZhi} = 有效 {effectiveLen}/{effectiveLimit} 字
                          <span className="ml-1 font-medium text-red-500">超出 {overflow} 字不计入</span>
                        </>
                      ) : (
                        <>文治 {wenZhi} = 有效 {effectiveLen}/{effectiveLimit} 字</>
                      )}
                    </span>
                    <WenZhiHelpTooltip />
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">选择人物后显示有效字数</p>
              )}
            </div>
            {/* 保存按钮：mt-5 对齐输入框（label 行 16px + gap 4px） */}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className={cn(
                'mt-5 h-9 shrink-0 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors',
                'hover:bg-primary/90 disabled:opacity-50',
              )}
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
