/**
 * Active View Atom - 主内容区视图状态
 *
 * 控制 MainArea 显示的内容：
 * - conversations: 对话视图（Chat/Agent 模式内容）
 * - automations: 定时任务列表视图
 * - agent-skills: Agent 技能（Skills/MCP）全屏管理视图
 */

import { atom } from 'jotai'

export type ActiveView = 'conversations' | 'automations' | 'agent-skills' | 'character-panel'
export type AgentSkillsCapabilityTab = 'skills' | 'mcp' | 'memory'
export type CharacterPanelTab = 'info' | 'skins' | 'gacha'

/** 当前活跃视图（不持久化，每次启动默认显示对话） */
export const activeViewAtom = atom<ActiveView>('conversations')

/** Agent 技能视图当前子页，用于外部入口直达 MCP 管理 */
export const agentSkillsTabAtom = atom<AgentSkillsCapabilityTab>('skills')

/** 人物面板当前 tab，用于外部入口直达盲盒 */
export const characterPanelTabAtom = atom<CharacterPanelTab>('info')
