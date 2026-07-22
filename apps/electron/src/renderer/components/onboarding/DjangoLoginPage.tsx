import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface DjangoLoginPageProps { onLoginSuccess: () => void }

export function DjangoLoginPage({ onLoginSuccess }: DjangoLoginPageProps): React.ReactElement {
  const [baseUrl, setBaseUrl] = React.useState('http://localhost:8000')
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const handleLogin = async () => {
    if (!username || !password) { setError('请输入用户名和密码'); return }
    setLoading(true); setError('')
    try {
      const result = await window.electronAPI.djangoLogin({ baseUrl, username, password })
      if (result.success) { onLoginSuccess() } else { setError(result.error || '登录失败') }
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="text-center space-y-2">
          <div className="text-6xl">🦐</div>
          <h1 className="text-xl font-semibold">ShaDiaoAgent</h1>
          <p className="text-sm text-muted-foreground">连接到 Django 后端</p>
        </div>
        <div className="space-y-4">
          <Input placeholder="http://localhost:8000" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <Input placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
          <Input type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" onClick={handleLogin} disabled={loading}>{loading ? '登录中...' : '连接'}</Button>
        </div>
      </div>
    </div>
  )
}
