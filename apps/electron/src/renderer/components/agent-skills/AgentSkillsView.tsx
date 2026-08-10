/**
 * AgentSkillsView — 「Agent 技能」全屏视图
 *
 * 由侧边栏「Agent 技能」入口触发，全屏占据中间内容区（隐藏 TabBar 与右侧文件面板）。
 *
 * 结构：
 * - 顶部：标题 + 工作区切换下拉
 * - 工具条：Skills / MCP / 记忆 切换 + 搜索 + 新增入口
 * - 内容：能力卡片网格（商店风），点击卡片打开右侧详情抽屉
 */

import * as React from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { Blocks, Search, Plus, Check, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { workspaceCapabilitiesVersionAtom } from '@/atoms/agent-atoms'
import { agentSkillsTabAtom, activeViewAtom } from '@/atoms/active-view'
import { settingsOpenAtom, settingsTabAtom, toolSettingsFocusAtom, type ToolSettingsFocus } from '@/atoms/settings-tab'
import type { BuiltinMcpServerSummary, McpServerEntry, SkillMeta } from '@shadiao/shared'
import { useAgentSkillsData } from './useAgentSkillsData'
import { SkillCard } from './SkillCard'
import { McpCard } from './McpCard'
import { SkillDetailSheet } from './SkillDetailSheet'
import { McpDetailSheet } from './McpDetailSheet'
import { BuiltinMcpDetailSheet } from './BuiltinMcpDetailSheet'
import { ImportSkillDialog } from './ImportSkillDialog'
import { WorkspaceMemoryTab } from './WorkspaceMemoryTab'

export function AgentSkillsView(): React.ReactElement {
  const data = useAgentSkillsData()
  const bumpCapabilities = useSetAtom(workspaceCapabilitiesVersionAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const setSettingsTab = useSetAtom(settingsTabAtom)
  const setToolSettingsFocus = useSetAtom(toolSettingsFocusAtom)
  const setActiveView = useSetAtom(activeViewAtom)

  const [tab, setTab] = useAtom(agentSkillsTabAtom)
  const [search, setSearch] = React.useState('')
  const [selectedSkillSlug, setSelectedSkillSlug] = React.useState<string | null>(null)
  const [mcpSheetOpen, setMcpSheetOpen] = React.useState(false)
  const [editingMcp, setEditingMcp] = React.useState<{ name: string; entry: McpServerEntry } | null>(null)
  const [selectedBuiltinMcp, setSelectedBuiltinMcp] = React.useState<BuiltinMcpServerSummary | null>(null)
  const [showImport, setShowImport] = React.useState(false)
  const [pendingDeleteSkill, setPendingDeleteSkill] = React.useState<SkillMeta | null>(null)
  const [pendingDeleteMcpName, setPendingDeleteMcpName] = React.useState<string | null>(null)
  const [isDeletingSkill, setIsDeletingSkill] = React.useState(false)
  const [isDeletingMcp, setIsDeletingMcp] = React.useState(false)

  const q = search.trim().toLowerCase()

  const filteredSkills = React.useMemo(() => {
    return data.skills.filter((s) => {
      if (!q) return true
      return s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q) ||
        (s.group ?? '').toLowerCase().includes(q)
    })
  }, [data.skills, q])

  const customSkills = filteredSkills.filter((s) => !data.defaultSkillSlugs.has(s.slug))
  const builtinSkills = filteredSkills.filter((s) => data.defaultSkillSlugs.has(s.slug))
  const updateCount = data.skills.filter((s) => s.hasUpdate).length

  const userMcpEntries = React.useMemo(() => {
    return Object.entries(data.mcpConfig.servers ?? {})
      .filter(([name]) => name !== 'memos-cloud')
      .filter(([name]) => !q || name.toLowerCase().includes(q))
  }, [data.mcpConfig, q])

  const builtinMcpServers = React.useMemo(() => {
    if (!q) return data.builtinMcpServers
    return data.builtinMcpServers.filter((server) =>
      server.name.toLowerCase().includes(q) ||
      server.displayName.toLowerCase().includes(q) ||
      server.description.toLowerCase().includes(q) ||
      server.tools.some((tool) => tool.name.toLowerCase().includes(q) || tool.description.toLowerCase().includes(q)),
    )
  }, [data.builtinMcpServers, q])

  // 不含搜索过滤的 MCP 总数（Tab 计数与空态判断用）
  const mcpCount = React.useMemo(
    () => Object.keys(data.mcpConfig.servers ?? {}).filter((n) => n !== 'memos-cloud').length + data.builtinMcpServers.length,
    [data.mcpConfig, data.builtinMcpServers],
  )
  const memoryCount = (data.capabilities?.memory.claudeMd.exists ? 1 : 0) + (data.capabilities?.memory.autoMemory.fileCount ?? 0)

  const selectedSkill = data.skills.find((s) => s.slug === selectedSkillSlug) ?? null
  const selectedIsBuiltin = selectedSkill ? data.defaultSkillSlugs.has(selectedSkill.slug) : false

  const openSkillFolder = (slug: string): void => {
    if (data.skillsDir) window.electronAPI.openFile(`${data.skillsDir}/${slug}`)
  }

  const configureBuiltinMcp = React.useCallback((serverId: string): void => {
    const focusMap: Partial<Record<string, ToolSettingsFocus>> = {
      mem: 'memory',
    }
    const focus = focusMap[serverId]
    if (!focus) return
    setToolSettingsFocus(focus)
    setSettingsTab('tools')
    setSettingsOpen(true)
    setSelectedBuiltinMcp(null)
  }, [setSettingsOpen, setSettingsTab, setToolSettingsFocus])

  if (!data.hasWorkspace) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground/[0.04]">
          <Blocks className="size-8 text-foreground/30" />
        </div>
        <div className="text-[15px] font-medium text-foreground/80">未选择工作区</div>
        <div className="max-w-sm text-[13px] text-foreground/50">
          请先在 Agent 模式下选择或创建一个工作区，再来管理它的 Skills 与 MCP。
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 返回栏 */}
      <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center px-8 pt-14 pb-5">
        <button
          type="button"
          onClick={() => setActiveView('conversations')}
          className="titlebar-no-drag -ml-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          aria-label="返回会话"
        >
          <ArrowLeft className="size-3.5" />
          <span>返回</span>
        </button>
      </div>

      {/* 标题栏 */}
      <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between px-8 pb-4">
        <div className="flex items-center gap-2.5">
          <Blocks className="size-6 text-foreground/70" />
          <h1 className="text-2xl font-semibold text-foreground">Agent 技能</h1>
        </div>
      </div>

      {/* 工具条 */}
      <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center gap-3 px-8 pb-4">
        {/* Skills / MCP / 记忆切换 */}
        <div className="relative flex h-8 items-stretch rounded-xl bg-muted p-0.5">
          <div
            className={cn(
              'absolute bottom-0.5 top-0.5 w-[calc(33.333%-3px)] rounded-lg bg-background shadow-sm transition-transform duration-300 ease-in-out',
              tab === 'skills' && 'translate-x-0',
              tab === 'mcp' && 'translate-x-full',
              tab === 'memory' && 'translate-x-[200%]',
            )}
          />
          {([
            { value: 'skills' as const, label: 'Skills', count: data.skills.length },
            { value: 'mcp' as const, label: 'MCP', count: mcpCount },
            { value: 'memory' as const, label: '记忆', count: memoryCount },
          ]).map(({ value, label, count }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={cn(
                'relative z-[1] flex min-w-[96px] items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors duration-200',
                tab === value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
              <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
            </button>
          ))}
        </div>

        {/* 搜索框 */}
        <div className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-content-area px-3 transition-colors focus-within:border-primary/40">
          <Search size={14} className="shrink-0 text-foreground/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'skills' ? '搜索 Skills...' : tab === 'mcp' ? '搜索 MCP 服务器...' : '搜索记忆文件...'}
            className="w-full bg-transparent text-[13px] text-foreground placeholder:text-foreground/35 focus:outline-none"
          />
        </div>

        {/* Skills：从其他工作区导入 */}
        {tab === 'skills' && (
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-content-area px-3 text-[13px] font-medium text-foreground/80 shadow-sm transition-colors hover:bg-foreground/[0.04]"
          >
            <Plus size={14} />
            <span>导入</span>
          </button>
        )}

        {/* 新增 MCP */}
        {tab === 'mcp' && (
          <button
            type="button"
            onClick={() => { setEditingMcp(null); setMcpSheetOpen(true) }}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus size={14} />
            <span>添加服务器</span>
          </button>
        )}
      </div>

      {/* 内容 */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-6xl px-8 pb-10">
          {data.loading ? (
            <div className="py-20 text-center text-sm text-muted-foreground">加载中...</div>
          ) : tab === 'skills' ? (
            <SkillsTab
              customSkills={customSkills}
              builtinSkills={builtinSkills}
              total={data.skills.length}
              updateCount={updateCount}
              updatingSkill={data.updatingSkill}
              isBuiltin={(slug) => data.defaultSkillSlugs.has(slug)}
              onOpen={setSelectedSkillSlug}
              onToggle={data.toggleSkill}
              onUpdate={data.updateSkill}
            />
          ) : tab === 'mcp' ? (
            <McpTab
              userEntries={userMcpEntries}
              builtinServers={builtinMcpServers}
              total={mcpCount}
              onOpen={(name, entry) => { setEditingMcp({ name, entry }); setMcpSheetOpen(true) }}
              onOpenBuiltin={setSelectedBuiltinMcp}
              onToggle={data.toggleMcp}
              onToggleBuiltin={data.toggleBuiltinMcp}
              onRequestDelete={setPendingDeleteMcpName}
              onAdd={() => { setEditingMcp(null); setMcpSheetOpen(true) }}
            />
          ) : (
            <WorkspaceMemoryTab workspaceSlug={data.workspaceSlug} search={search} />
          )}
        </div>
      </div>

      {/* 详情抽屉 */}
      <SkillDetailSheet
        skill={selectedSkill}
        workspaceSlug={data.workspaceSlug}
        isBuiltin={selectedIsBuiltin}
        updating={data.updatingSkill === selectedSkill?.slug}
        onOpenChange={(open) => { if (!open) setSelectedSkillSlug(null) }}
        onToggle={(enabled) => selectedSkill && data.toggleSkill(selectedSkill.slug, enabled)}
        onUpdate={() => selectedSkill && data.updateSkill(selectedSkill.slug)}
        onRequestDelete={() => selectedSkill && setPendingDeleteSkill(selectedSkill)}
        onOpenFolder={() => selectedSkill && openSkillFolder(selectedSkill.slug)}
        onChanged={() => bumpCapabilities((v) => v + 1)}
      />

      {/* Skill 删除确认 */}
      <ConfirmDialog
        open={pendingDeleteSkill !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteSkill(null) }}
        title={`确认删除 Skill「${pendingDeleteSkill?.name}」？`}
        description="删除后将无法恢复，确定要卸载这个 Skill 吗？"
        confirmLabel="删除"
        loadingLabel="删除中..."
        loading={isDeletingSkill}
        onConfirm={async () => {
          if (!pendingDeleteSkill || isDeletingSkill) return
          setIsDeletingSkill(true)
          const ok = await data.deleteSkill(pendingDeleteSkill.slug, pendingDeleteSkill.name)
          setIsDeletingSkill(false)
          setPendingDeleteSkill(null)
          if (ok) setSelectedSkillSlug(null)
        }}
      />

      {/* MCP 删除确认 */}
      <ConfirmDialog
        open={pendingDeleteMcpName !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteMcpName(null) }}
        title={`确认删除 MCP 服务器「${pendingDeleteMcpName}」？`}
        description="删除后将无法恢复，确定要删除这个 MCP 服务器吗？"
        confirmLabel="删除"
        loadingLabel="删除中..."
        loading={isDeletingMcp}
        onConfirm={async () => {
          if (!pendingDeleteMcpName || isDeletingMcp) return
          setIsDeletingMcp(true)
          await data.deleteMcp(pendingDeleteMcpName)
          setIsDeletingMcp(false)
          setPendingDeleteMcpName(null)
        }}
      />

      <McpDetailSheet
        open={mcpSheetOpen}
        server={editingMcp}
        workspaceSlug={data.workspaceSlug}
        onOpenChange={(open) => { setMcpSheetOpen(open); if (!open) bumpCapabilities((v) => v + 1) }}
        onSaved={() => setMcpSheetOpen(false)}
        onChanged={() => bumpCapabilities((v) => v + 1)}
      />

      <BuiltinMcpDetailSheet
        open={!!selectedBuiltinMcp}
        server={selectedBuiltinMcp}
        onOpenChange={(open) => { if (!open) setSelectedBuiltinMcp(null) }}
        onConfigure={configureBuiltinMcp}
      />

      <ImportSkillDialog
        open={showImport}
        onOpenChange={setShowImport}
        workspaceSlug={data.workspaceSlug}
        installedSkills={data.skills}
        onImported={() => bumpCapabilities((v) => v + 1)}
      />
    </div>
  )
}

// ===== Skills Tab =====

interface SkillsTabProps {
  customSkills: SkillMeta[]
  builtinSkills: SkillMeta[]
  total: number
  updateCount: number
  updatingSkill: string | null
  isBuiltin: (slug: string) => boolean
  onOpen: (slug: string) => void
  onToggle: (slug: string, enabled: boolean) => void
  onUpdate: (slug: string) => void
}

function SkillsTab({
  customSkills,
  builtinSkills,
  total,
  updateCount,
  updatingSkill,
  isBuiltin,
  onOpen,
  onToggle,
  onUpdate,
}: SkillsTabProps): React.ReactElement {
  const allSkills = [...customSkills, ...builtinSkills]

  if (total === 0) {
    return <EmptyState icon={<Blocks className="size-8 text-foreground/30" />} title="暂无 Skill" hint="可以在 Agent 模式下让 沙雕智能体 帮你联网查找并安装 Skill，或从其他工作区导入。" />
  }
  if (allSkills.length === 0) {
    return <EmptyState icon={<Search className="size-8 text-foreground/30" />} title="没有匹配的 Skill" hint="试试更换搜索关键词。" />
  }

  return (
    <div className="flex flex-col gap-8">
      {updateCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/[0.06] px-3 py-2 text-[13px] text-blue-600 dark:text-blue-400">
          有 {updateCount} 个 Skill 可更新到来源最新版本
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {allSkills.map((skill) => (
          <SkillCard
            key={skill.slug}
            skill={skill}
            isBuiltin={isBuiltin(skill.slug)}
            updating={updatingSkill === skill.slug}
            onOpen={() => onOpen(skill.slug)}
            onToggle={(enabled) => onToggle(skill.slug, enabled)}
            onUpdate={() => onUpdate(skill.slug)}
          />
        ))}
      </div>
    </div>
  )
}

// ===== MCP Tab =====

interface McpTabProps {
  userEntries: Array<[string, McpServerEntry]>
  builtinServers: BuiltinMcpServerSummary[]
  total: number
  onOpen: (name: string, entry: McpServerEntry) => void
  onOpenBuiltin: (server: BuiltinMcpServerSummary) => void
  onToggle: (name: string, enabled: boolean) => void
  onToggleBuiltin: (id: string, enabled: boolean) => void
  onRequestDelete: (name: string) => void
  onAdd: () => void
}

function McpTab({ userEntries, builtinServers, total, onOpen, onOpenBuiltin, onToggle, onToggleBuiltin, onRequestDelete, onAdd }: McpTabProps): React.ReactElement {
  if (total === 0) {
    return (
      <EmptyState
        icon={<Plus className="size-8 text-foreground/30" />}
        title="还没有 MCP 服务器"
        hint="点击右上角「添加服务器」开始，或在 Agent 模式下让 沙雕智能体 帮你查找并配置。"
        action={
          <button
            type="button"
            onClick={onAdd}
            className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus size={14} />
            <span>添加服务器</span>
          </button>
        }
      />
    )
  }
  if (userEntries.length === 0 && builtinServers.length === 0) {
    return <EmptyState icon={<Search className="size-8 text-foreground/30" />} title="没有匹配的 MCP 服务器" hint="试试更换搜索关键词。" />
  }

  return (
    <div className="flex flex-col gap-8">
      {userEntries.length > 0 && (
        <McpSection title="我的 MCP" count={userEntries.length}>
          {userEntries.map(([name, entry]) => (
            <McpCard
              key={name}
              name={name}
              entry={entry}
              onOpen={() => onOpen(name, entry)}
              onToggle={(enabled) => onToggle(name, enabled)}
              onRequestDelete={() => onRequestDelete(name)}
            />
          ))}
        </McpSection>
      )}

      {builtinServers.length > 0 && (
        <McpSection title="沙雕智能体 内置" count={builtinServers.length}>
          {builtinServers.map((server) => (
            <McpCard
              key={server.id}
              name={server.displayName}
              entry={{
                type: 'stdio',
                command: '沙雕智能体 运行时注入',
                enabled: server.enabled,
                isBuiltin: true,
              }}
              description={server.description}
              targetLabel={server.availabilityReason ?? '沙雕智能体 运行时注入'}
              statusLabel={getBuiltinMcpStatus(server).label}
              statusTone={getBuiltinMcpStatus(server).tone}
              readOnly
              onOpen={() => onOpenBuiltin(server)}
              onToggle={(enabled) => onToggleBuiltin(server.id, enabled)}
            />
          ))}
        </McpSection>
      )}
    </div>
  )
}

function getBuiltinMcpStatus(server: BuiltinMcpServerSummary): { label: string; tone: 'success' | 'warning' | 'muted' } {
  if (!server.enabled) return { label: '已关闭', tone: 'muted' }
  if (server.available) return { label: '可用', tone: 'success' }
  return { label: '需配置', tone: 'warning' }
}

function McpSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <span className="text-[13px] font-medium text-foreground/55">{title}</span>
        <span className="text-[12px] tabular-nums text-foreground/35">{count}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </div>
  )
}

// ===== Empty State =====

function EmptyState({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint: string; action?: React.ReactNode }): React.ReactElement {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 pt-24 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground/[0.04]">{icon}</div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[15px] font-medium text-foreground/85">{title}</div>
        <div className="text-[13px] leading-relaxed text-foreground/50">{hint}</div>
      </div>
      {action}
    </div>
  )
}
