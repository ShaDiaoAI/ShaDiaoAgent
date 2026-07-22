/**
 * PanelHeader - Header component for panels
 * Displays title and optional action buttons
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface PanelHeaderProps {
  /** Panel title */
  title: string
  /** Optional action buttons */
  actions?: React.ReactNode
  /** Optional className */
  className?: string
}

export function PanelHeader({ title, actions, className }: PanelHeaderProps): React.ReactElement {
  return (
    <div className={cn('flex items-center justify-between px-4 py-3 border-b border-border', className)}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
