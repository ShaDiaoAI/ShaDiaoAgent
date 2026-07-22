/**
 * SettingsToggle - 设置开关控件
 *
 * 封装 ShadcnUI Switch，集成标签和描述。
 * 用于布尔值设置项。
 */

import * as React from 'react'
import { Switch } from '@/components/ui/switch'
import { LABEL_CLASS, DESCRIPTION_CLASS, ROW_CLASS } from './SettingsUIConstants'
import { cn } from '@/lib/utils'

interface SettingsToggleProps {
  /** 标签文本 */
  label: string
  /** 描述文本（可选） */
  description?: string
  /** 是否选中 */
  checked: boolean
  /** 变更回调 */
  onCheckedChange: (checked: boolean) => void
  /** 是否禁用 */
  disabled?: boolean
}

export function SettingsToggle({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: SettingsToggleProps): React.ReactElement {
  return (
    <div className={ROW_CLASS}>
      <div className="flex-1 min-w-0 mr-4">
        <div className={LABEL_CLASS}>{label}</div>
        {description && (
          <div className={cn(DESCRIPTION_CLASS, 'mt-0.5')}>{description}</div>
        )}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  )
}
