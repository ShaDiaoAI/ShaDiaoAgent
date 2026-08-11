import * as React from 'react'
import { useAtomValue, useSetAtom, useAtom } from 'jotai'
import { TooltipProvider } from './components/ui/tooltip'
import { AppShell } from './components/app-shell/AppShell'
import { SettingsDialog } from './components/settings/SettingsDialog'
import { DjangoLoginPage } from './components/onboarding/DjangoLoginPage'
import { DjangoRegisterPage } from './components/onboarding/DjangoRegisterPage'
import { agentSettingsReadyAtom, agentWorkspacesAtom, currentAgentWorkspaceIdAtom, agentSessionsAtom, currentAgentSessionIdAtom } from './atoms/agent-atoms'
import { settingsOpenAtom } from './atoms/settings-tab'
import { channelsLoadedAtom } from './atoms/chat-atoms'
import { charactersAtom, charactersLoadingAtom, selectedCharacterAtom } from './atoms/character-atoms'
import { isAuthenticatedAtom } from './atoms/auth-atoms'
import { userProfileAtom } from './atoms/user-profile'
import { tabsAtom, activeTabIdAtom } from './atoms/tab-atoms'

export default function App(): React.ReactElement {
  const agentReady = useAtomValue(agentSettingsReadyAtom)
  const channelsLoaded = useAtomValue(channelsLoadedAtom)
  const settingsOpen = useAtomValue(settingsOpenAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const setCharactersLoading = useSetAtom(charactersLoadingAtom)
  const [, setCharacters] = useAtom(charactersAtom)
  const [, setUserProfile] = useAtom(userProfileAtom)
  const [, setAgentWorkspaces] = useAtom(agentWorkspacesAtom)
  const [, setCurrentWorkspaceId] = useAtom(currentAgentWorkspaceIdAtom)
  const setTabs = useSetAtom(tabsAtom)
  const setActiveTabId = useSetAtom(activeTabIdAtom)
  const setAgentSessions = useSetAtom(agentSessionsAtom)
  const setCurrentAgentSessionId = useSetAtom(currentAgentSessionIdAtom)
  const setSelectedCharacter = useSetAtom(selectedCharacterAtom)

  // Django 认证状态（Jotai atom，跨组件共享，登出时不需要 reload）
  const [isAuthenticated, setIsAuthenticated] = useAtom(isAuthenticatedAtom)
  const [authView, setAuthView] = React.useState<'login' | 'register'>('login')

  // 启动时检查 Django 认证
  React.useEffect(() => {
    window.electronAPI.getAuthStatus()
      .then((r: any) => {
        setIsAuthenticated(r?.success && r?.data?.isLoggedIn)
        // 同步 Django 用户名到用户档案
        if (r?.success && r?.data?.username) {
          window.electronAPI.getUserProfile().then((profile: any) => {
            // 如果当前用户档案还是默认名，用 Django 用户名覆盖
            if (profile.userName === '用户') {
              window.electronAPI.updateUserProfile({ userName: r.data.username })
                .then(setUserProfile)
                .catch(() => {})
            }
          }).catch(() => {})
        }
      })
      .catch(() => setIsAuthenticated(false))
  }, [setIsAuthenticated, setUserProfile])

  const handleLoginSuccess = React.useCallback(() => {
    // 清空上一个账号的会话/tab/persona 状态，避免新账号看到旧数据
    setTabs([])
    setActiveTabId(null)
    setCurrentAgentSessionId(null)
    setAgentSessions([])
    setSelectedCharacter(null)
    setSettingsOpen(false)

    setIsAuthenticated(true)
    // 同步 Django 用户名到用户档案
    window.electronAPI.getAuthStatus()
      .then((r: any) => {
        if (r?.success && r?.data?.username) {
          window.electronAPI.updateUserProfile({ userName: r.data.username })
            .then(setUserProfile)
            .catch(() => {})
        }
      })
      .catch(() => {})
    // 登录后加载人物列表
    setCharactersLoading(true)
    window.electronAPI.listCharacters()
      .then((r: any) => {
        if (r?.success && r.data) setCharacters(r.data)
        // listCharacters 在主进程侧会为每个人物创建/补全 char-{id} workspace，
        // 这里必须重新拉取 workspace 列表，否则渲染进程的 atom 里只有 default workspace，
        // 左侧栏项目列表（过滤掉 default 后）为空。
        return window.electronAPI.listAgentWorkspaces()
      })
      .then((workspaces: any[]) => {
        setAgentWorkspaces(workspaces)
        // 新用户首次登录时，切换到人物 workspace（非 default 的第一个）
        const charWs = workspaces.find((w: any) => w.slug !== 'default')
        if (charWs) setCurrentWorkspaceId(charWs.id)
      })
      .catch(() => {})
      .finally(() => setCharactersLoading(false))
  }, [setIsAuthenticated, setCharactersLoading, setCharacters, setAgentWorkspaces, setCurrentWorkspaceId, setTabs, setActiveTabId, setCurrentAgentSessionId, setAgentSessions, setSelectedCharacter, setSettingsOpen])

  // 未检查认证（atom 初始为 null）/ 正在加载应用设置
  if (isAuthenticated === null || !agentReady || !channelsLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">加载中...</span>
        </div>
      </div>
    )
  }

  // 未登录 → 登录/注册页
  if (!isAuthenticated) {
    if (authView === 'register') {
      return (
        <DjangoRegisterPage
          onRegisterSuccess={handleLoginSuccess}
          onGoToLogin={() => setAuthView('login')}
        />
      )
    }
    return (
      <DjangoLoginPage
        onLoginSuccess={handleLoginSuccess}
        onGoToRegister={() => setAuthView('register')}
      />
    )
  }

  // 已登录 → 主界面
  return (
    <TooltipProvider delayDuration={300}>
      <AppShell />
      {settingsOpen && (
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={(open) => setSettingsOpen(open)}
        />
      )}
    </TooltipProvider>
  )
}
