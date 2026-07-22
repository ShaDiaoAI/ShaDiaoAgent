import * as React from 'react'
import { useAtomValue, useSetAtom, useAtom } from 'jotai'
import { TooltipProvider } from './components/ui/tooltip'
import { AppShell } from './components/app-shell/AppShell'
import { SettingsDialog } from './components/settings/SettingsDialog'
import { DjangoLoginPage } from './components/onboarding/DjangoLoginPage'
import { agentSettingsReadyAtom } from './atoms/agent-atoms'
import { settingsOpenAtom } from './atoms/settings-tab'
import { channelsLoadedAtom } from './atoms/chat-atoms'
import { charactersAtom, charactersLoadingAtom } from './atoms/character-atoms'

export default function App(): React.ReactElement {
  const agentReady = useAtomValue(agentSettingsReadyAtom)
  const channelsLoaded = useAtomValue(channelsLoadedAtom)
  const settingsOpen = useAtomValue(settingsOpenAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const setCharactersLoading = useSetAtom(charactersLoadingAtom)
  const [, setCharacters] = useAtom(charactersAtom)

  // Django 认证状态
  const [authChecked, setAuthChecked] = React.useState(false)
  const [isLoggedIn, setIsLoggedIn] = React.useState(false)

  // 启动时检查 Django 认证
  React.useEffect(() => {
    window.electronAPI.getAuthStatus()
      .then((r: any) => {
        setIsLoggedIn(r?.success && r?.data?.isLoggedIn)
      })
      .catch(() => setIsLoggedIn(false))
      .finally(() => setAuthChecked(true))
  }, [])

  const handleLoginSuccess = React.useCallback(() => {
    setIsLoggedIn(true)
    // 登录后加载人物列表
    setCharactersLoading(true)
    window.electronAPI.listCharacters()
      .then((r: any) => {
        if (r?.success && r.data) setCharacters(r.data)
      })
      .catch(() => {})
      .finally(() => setCharactersLoading(false))
  }, [])

  // 未检查认证 / 正在加载
  if (!authChecked || !agentReady || !channelsLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">加载中...</span>
        </div>
      </div>
    )
  }

  // 未登录 → 登录页
  if (!isLoggedIn) {
    return <DjangoLoginPage onLoginSuccess={handleLoginSuccess} />
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
