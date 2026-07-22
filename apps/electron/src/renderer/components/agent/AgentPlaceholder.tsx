/**
 * AgentPlaceholder - Agent 模式占位符组件
 *
 * 临时占位组件，后续将替换为完整的 Agent/Flow 组件
 */

import * as React from 'react'
import { Bot } from 'lucide-react'

export function AgentPlaceholder(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <Bot size={32} className="text-muted-foreground/60" />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-lg font-medium text-foreground">Agent 模式</h2>
        <p className="text-sm max-w-[300px]">
          使用 AI Agent 处理复杂任务，支持多步骤推理和工具调用
        </p>
      </div>
      <div className="mt-4 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium">
        即将推出
      </div>
    </div>
  )
}
