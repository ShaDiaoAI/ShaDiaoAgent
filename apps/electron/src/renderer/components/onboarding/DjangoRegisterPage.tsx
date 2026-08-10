import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import shadiaoLogo from '@/assets/bots/shadiao-logos/shadiao-logo.png'

interface DjangoRegisterPageProps {
  onRegisterSuccess: () => void
  onGoToLogin: () => void
}

export function DjangoRegisterPage({ onRegisterSuccess, onGoToLogin }: DjangoRegisterPageProps): React.ReactElement {
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const handleRegister = async () => {
    setError('')

    if (!username.trim()) {
      setError('请输入用户名')
      return
    }
    if (!password) {
      setError('请输入密码')
      return
    }
    if (password.length < 6) {
      setError('密码至少需要 6 个字符')
      return
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setLoading(true)
    try {
      const result = await window.electronAPI.djangoRegister({ username: username.trim(), password })
      if (result.success) {
        toast.success('注册成功，欢迎来到沙雕智能体！🦐')
        onRegisterSuccess()
      } else {
        setError(result.error || '注册失败')
      }
    } catch (e) {
      setError((e as Error).message || '网络错误，请检查后端连接')
    } finally {
      setLoading(false)
    }
  }

  const isFormValid = username.trim() && password && confirmPassword

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="text-center space-y-2">
          <img src={shadiaoLogo} alt="沙雕智能体" className="w-16 h-16 mx-auto rounded-2xl" />
          <h1 className="text-xl font-semibold">沙雕智能体</h1>
          <p className="text-sm text-muted-foreground">创建你的沙雕账号</p>
        </div>
        <div className="space-y-4">
          <Input
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && isFormValid && handleRegister()}
            autoFocus
          />
          <Input
            type="password"
            placeholder="密码（至少 6 位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && isFormValid && handleRegister()}
          />
          <Input
            type="password"
            placeholder="确认密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && isFormValid && handleRegister()}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full"
            onClick={handleRegister}
            disabled={loading || !isFormValid}
          >
            {loading ? '注册中...' : '注册'}
          </Button>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          已有账号？{' '}
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline"
            onClick={onGoToLogin}
          >
            去登录
          </button>
        </p>
      </div>
    </div>
  )
}
