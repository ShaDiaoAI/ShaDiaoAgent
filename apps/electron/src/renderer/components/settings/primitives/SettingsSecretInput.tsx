/**
 * SettingsSecretInput - API Key 专用密码输入控件
 *
 * 内置密码显隐切换，适用于 API Key 等敏感信息输入。
 */

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { LABEL_CLASS, DESCRIPTION_CLASS } from './SettingsUIConstants'
import { cn } from '@/lib/utils'

interface SettingsSecretInputProps {
  /** 标签文本 */
  label: string
  /** 描述文本（可选） */
  description?: string
  /** 输入值 */
  value: string
  /** 变更回调 */
  onChange: (value: string) => void
  /** 占位符 */
  placeholder?: string
  /** 是否必填 */
  required?: boolean
  /** 是否禁用 */
  disabled?: boolean
}

export function SettingsSecretInput({
  label,
  description,
  value,
  onChange,
  placeholder,
  required,
  disabled,
}: SettingsSecretInputProps): React.ReactElement {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="px-4 py-3 space-y-2">
      <div>
        <div className={LABEL_CLASS}>{label}</div>
        {description && (
          <div className={cn(DESCRIPTION_CLASS, 'mt-0.5')}>{description}</div>
        )}
      </div>
      <div className="relative">
        <Input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
          tabIndex={-1}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}
