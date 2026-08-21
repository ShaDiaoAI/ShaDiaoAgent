import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { AuthCharacterAnim } from './AuthCharacterAnim'
import shadiaoLogo from '@/assets/bots/shadiao-logos/shadiao-logo.png'
import watchaLogo from '@/assets/bots/watcha.png'

interface AuthPageProps {
  onAuthSuccess: () => void
}

type AuthTab = 'login' | 'register'

export function AuthPage({ onAuthSuccess }: AuthPageProps): React.ReactElement {
  const [tab, setTab] = React.useState<AuthTab>('login')
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [watchaLoading, setWatchaLoading] = React.useState(false)

  const isLogin = tab === 'login'
  const isFormValid = username.trim() && password && (!isLogin || true) && (isLogin || password.length >= 6)

  // 切换 tab 时清除错误
  const handleTabSwitch = (newTab: AuthTab) => {
    setTab(newTab)
    setError('')
    setPassword('')
    setShowPassword(false)
  }

  const handleSubmit = async () => {
    setError('')

    if (!username.trim()) {
      setError('请输入用户名')
      return
    }
    if (!password) {
      setError('请输入密码')
      return
    }
    if (!isLogin && password.length < 6) {
      setError('密码至少需要 6 个字符')
      return
    }

    setLoading(true)
    try {
      const fn = isLogin
        ? window.electronAPI.djangoLogin
        : window.electronAPI.djangoRegister
      const result = await fn({ username: username.trim(), password })
      if (result.success) {
        if (!isLogin) {
          toast.success('注册成功，欢迎来到沙雕智能体！🦐')
        }
        onAuthSuccess()
      } else {
        setError(result.error || (isLogin ? '登录失败' : '注册失败'))
      }
    } catch (e) {
      setError((e as Error).message || '网络错误，请检查后端连接')
    } finally {
      setLoading(false)
    }
  }

  // ===== 观猹 OAuth 登录 =====
  const handleWatchaLogin = async () => {
    setError('')
    setWatchaLoading(true)
    try {
      const r = await window.electronAPI.djangoOAuthWatchaStart()
      if (!r.success) {
        setWatchaLoading(false)
        setError(r.error || '发起观猹登录失败')
      }
      // 成功发起后保持 watchaLoading，等待 onWatchaOauthResult 事件回传最终结果
    } catch (e) {
      setWatchaLoading(false)
      setError((e as Error).message || '发起观猹登录失败')
    }
  }

  const handleWatchaCancel = async () => {
    try {
      await window.electronAPI.djangoOAuthWatchaCancel()
    } catch { /* 取消失败忽略，最终结果事件会兜底 */ }
  }

  React.useEffect(() => {
    const off = window.electronAPI.onWatchaOauthResult((result) => {
      setWatchaLoading(false)
      if (result.success) {
        toast.success(result.isNewUser ? '观猹登录成功，欢迎来到沙雕智能体！🦐' : '观猹登录成功，欢迎回来！')
        onAuthSuccess()
      } else if (!(result.cancelled && !result.error)) {
        // 主动取消（cancelled 且无 error）静默复位，其余展示错误
        setError(result.error || '观猹登录失败')
      }
    })
    return off
  }, [onAuthSuccess])

  // ===== 密码显隐图标 =====
  const EyeIcon = showPassword ? (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
        {/* ===== 角色动画 ===== */}
        <div className="hidden md:block w-[320px]">
          <AuthCharacterAnim className="w-full" />
        </div>

        {/* ===== 表单卡片 ===== */}
        <div className="w-[340px] space-y-5">
          {/* Logo */}
          <div className="text-center space-y-2">
            <img
              src={shadiaoLogo}
              alt="沙雕智能体"
              className="size-14 mx-auto rounded-2xl"
            />
            <h1 className="text-xl font-bold tracking-tight">沙雕智能体</h1>
          </div>

          {/* Tab 切换 */}
          <div className="flex rounded-lg bg-muted p-1">
            <button
              type="button"
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                tab === 'login'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => handleTabSwitch('login')}
            >
              登录
            </button>
            <button
              type="button"
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                tab === 'register'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => handleTabSwitch('register')}
            >
              注册
            </button>
          </div>

          {/* 表单 */}
          <div className="space-y-3">
            <Input
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && isFormValid && handleSubmit()}
              autoFocus
            />
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder={isLogin ? '密码' : '密码（至少 6 位）'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && isFormValid && handleSubmit()}
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {EyeIcon}
              </button>
            </div>

            {/* 错误信息 */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* 提交按钮 */}
            <Button
              className="w-full h-11 text-sm font-semibold"
              onClick={handleSubmit}
              disabled={loading || !isFormValid}
            >
              {loading
                ? (isLogin ? '登录中...' : '注册中...')
                : isLogin
                  ? '登录'
                  : '与沙雕一起探索 AI 的奥秘～'}
            </Button>
          </div>

          {/* 底部切换链接 */}
          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? '没有账号？' : '已有账号？'}{' '}
            <button
              type="button"
              className="text-amber-500 hover:underline underline-offset-4 font-medium"
              onClick={() => handleTabSwitch(isLogin ? 'register' : 'login')}
            >
              {isLogin ? '创建一个' : '去登录'}
            </button>
          </p>

          {/* ===== 观猹 OAuth 登录 ===== */}
          <div className="space-y-3">
            {/* 水平分割线 + 或 */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-muted-foreground/20" />
              <span className="text-xs text-muted-foreground">或</span>
              <div className="h-px flex-1 bg-muted-foreground/20" />
            </div>

            {/* 观猹登录按钮 */}
            <button
              type="button"
              onClick={handleWatchaLogin}
              disabled={watchaLoading}
              className="w-full h-11 flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors text-sm font-medium disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {watchaLoading ? (
                <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <img src={watchaLogo} alt="观猹" className="size-5 rounded" />
              )}
              <span>{watchaLoading ? '等待浏览器授权…' : (isLogin ? '观猹一键登录' : '观猹一键注册')}</span>
            </button>

            {/* 等待态：取消入口 */}
            {watchaLoading && (
              <button
                type="button"
                onClick={handleWatchaCancel}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
              >
                取消
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
