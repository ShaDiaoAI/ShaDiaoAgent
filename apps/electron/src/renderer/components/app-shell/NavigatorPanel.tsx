/**
 * NavigatorPanel - Middle panel for list-based navigation
 * Displays a header with title and scrollable content area
 */

import * as React from 'react'
import { Panel } from './Panel'
import { PanelHeader } from './PanelHeader'

export interface NavigatorPanelProps {
  /** Panel title */
  title: string
  /** Panel width in pixels */
  width: number
  /** Main content */
  children: React.ReactNode
}

export function NavigatorPanel({
  title,
  width,
  children,
}: NavigatorPanelProps): React.ReactElement {
  return (
    <Panel variant="shrink" width={width} className="bg-background border-r border-border">
      <PanelHeader title={title} />
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </Panel>
  )
}
