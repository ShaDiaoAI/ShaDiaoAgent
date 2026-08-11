/**
 * AboutSettings - 关于页面
 *
 * 显示应用版本号等基本信息，以及版本检测状态。
 * 检测到新版本后引导用户去 GitHub Releases 手动下载。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { RefreshCw, Loader2, CheckCircle2, AlertCircle, ExternalLink, ChevronDown, ChevronUp, RotateCw } from 'lucide-react'
import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
} from './primitives'
import { updateStatusAtom, updaterAvailableAtom, checkForUpdates } from '@/atoms/updater'
import { ReleaseNotesViewer } from './ReleaseNotesViewer'
import { createLogger } from '@shadiao/shared'

const log = createLogger('AboutSettings')

/** 从 package.json 构建时由 Vite define 注入 */
declare const __APP_VERSION__: string
const APP_VERSION = __APP_VERSION__

const GITHUB_RELEASES_URL = 'https://github.com/shadiao-agent/shadiao-agent/releases'

/** 更新状态卡片 */
function UpdateCard(): React.ReactElement | null {
  const available = useAtomValue(updaterAvailableAtom)
  const status = useAtomValue(updateStatusAtom)
  const [checking, setChecking] = React.useState(false)
  const [showReleaseNotes, setShowReleaseNotes] = React.useState(false)
  const [release, setRelease] = React.useState<import('@shadiao/shared').GitHubRelease | null>(null)

  // updater 不可用时不渲染
  if (!available) return null

  const handleCheck = async (): Promise<void> => {
    setChecking(true)
    try {
      await checkForUpdates()
    } finally {
      // 状态由 atom 订阅自动更新，延迟重置 checking 避免按钮闪烁
      setTimeout(() => setChecking(false), 1000)
    }
  }

  const handleGoToDownload = (): void => {
    const url = release?.html_url || GITHUB_RELEASES_URL
    window.electronAPI.openExternal(url)
  }

  const handleQuitAndInstall = (): void => {
    window.electronAPI.updater?.quitAndInstall()
  }

  // 当检测到新版本时，获取完整的 release 信息
  React.useEffect(() => {
    if (status.status === 'available' && status.version && !release) {
      window.electronAPI
        .getReleaseByTag(`v${status.version}`)
        .then((r) => {
          if (r) {
            setRelease(r)
            setShowReleaseNotes(true)
          }
        })
        .catch((err) => {
          log.error('获取 Release 信息失败:', err)
        })
    }
  }, [status.status, status.version, release])

  const isChecking = checking || status.status === 'checking' || status.status === 'downloading'
  const hasReleaseNotes = status.releaseNotes || release?.body

  return (
    <SettingsCard>
      <SettingsRow label="软件更新">
        <div className="flex items-center gap-3">
          {/* 状态文字 */}
          <StatusText status={status.status} version={status.version} error={status.error} />

          {/* 操作按钮 */}
          {status.status === 'downloaded' ? (
            <button
              onClick={handleQuitAndInstall}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <RotateCw className="h-3.5 w-3.5" />
              立即重启
            </button>
          ) : status.status === 'available' ? (
            <button
              onClick={handleGoToDownload}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              前往下载
            </button>
          ) : (
            <button
              onClick={handleCheck}
              disabled={isChecking}
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {isChecking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              检查更新
            </button>
          )}
        </div>
      </SettingsRow>

      {/* Release Notes（新版本可用时显示） */}
      {status.status === 'available' && hasReleaseNotes && (
        <div className="px-4 pb-4 border-t">
          <button
            onClick={() => setShowReleaseNotes(!showReleaseNotes)}
            className="w-full flex items-center justify-between py-3 text-left hover:opacity-80 transition-opacity"
          >
            <span className="text-sm font-medium">更新日志</span>
            {showReleaseNotes ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showReleaseNotes && release && (
            <div className="mt-2">
              <ReleaseNotesViewer
                release={release}
                showHeader={false}
                compact
              />
            </div>
          )}
        </div>
      )}
    </SettingsCard>
  )
}

/** 状态文字组件 */
function StatusText({ status, version, error }: {
  status: string
  version?: string
  error?: string
}): React.ReactElement {
  switch (status) {
    case 'checking':
      return <span className="text-xs text-muted-foreground">正在检查...</span>
    case 'available':
      return (
        <span className="text-xs text-primary flex items-center gap-1">
          <ExternalLink className="h-3 w-3" />
          新版本 v{version} 可用
        </span>
      )
    case 'downloading':
      return (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          正在下载 v{version}
        </span>
      )
    case 'downloaded':
      return (
        <span className="text-xs text-primary flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          更新 v{version} 已就绪
        </span>
      )
    case 'not-available':
      return (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          已是最新版本
        </span>
      )
    case 'error':
      return (
        <span className="text-xs text-destructive flex items-center gap-1" title={error}>
          <AlertCircle className="h-3 w-3" />
          检查失败
        </span>
      )
    default:
      return <span className="text-xs text-muted-foreground">未检查</span>
  }
}

export function AboutSettings(): React.ReactElement {
  return (
    <SettingsSection
      title="关于 沙雕智能体"
      description="与沙雕人物一起探索 AI 的奥秘"
    >
      <SettingsCard>
        <SettingsRow label="版本">
          <span className="text-sm text-muted-foreground font-mono">{APP_VERSION}</span>
        </SettingsRow>
        <SettingsRow label="运行时">
          <span className="text-sm text-muted-foreground">Electron + React</span>
        </SettingsRow>
        <SettingsRow label="项目地址">
          <a
            href="https://github.com/shadiao-agent/shadiao-agent.git"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            github.com/shadiao-agent/shadiao-agent
          </a>
        </SettingsRow>
      </SettingsCard>

      {/* 自动更新卡片（updater 不可用时不渲染） */}
      <UpdateCard />
    </SettingsSection>
  )
}
