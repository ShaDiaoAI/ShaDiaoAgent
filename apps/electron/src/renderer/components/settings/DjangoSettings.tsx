import * as React from 'react'
import { SettingsSection, SettingsCard } from './primitives'

export function DjangoSettings(): React.ReactElement {
  const [status, setStatus] = React.useState<any>(null)

  React.useEffect(() => {
    window.electronAPI.getAuthStatus()
      .then((r: any) => setStatus(r?.data))
      .catch(() => {})
  }, [])

  const handleLogout = async () => {
    await window.electronAPI.djangoLogout()
    window.location.reload()
  }

  return (
    <SettingsSection title="Django 后端连接" description="管理后端服务器连接和账号">
      <SettingsCard>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">服务器地址</span>
            <span className="text-sm text-muted-foreground font-mono">
              {status?.baseUrl || '未连接'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">账号</span>
            <span className="text-sm text-muted-foreground">
              {status?.username || '-'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">状态</span>
            <span className="flex items-center gap-1.5 text-xs">
              <span className={`size-1.5 rounded-full ${status?.isLoggedIn ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-muted-foreground">{status?.isLoggedIn ? '已连接' : '未连接'}</span>
            </span>
          </div>
          {status?.isLoggedIn && (
            <button
              className="w-full rounded-md border border-destructive/30 px-3 py-2 text-xs text-destructive hover:bg-destructive/5 transition-colors"
              onClick={handleLogout}
            >
              断开连接并退出
            </button>
          )}
        </div>
      </SettingsCard>
    </SettingsSection>
  )
}
