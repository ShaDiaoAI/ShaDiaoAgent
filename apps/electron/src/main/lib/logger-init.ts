/**
 * 主进程日志文件输出
 *
 * 通过 hook console.* 方法，所有日志在输出到 stdout/stderr 的同时
 * 也会写入 ~/.shadiao-agent/logs/main.log，支持自动轮转。
 */

import { app } from 'electron'
import { join, dirname } from 'path'
import {
  existsSync,
  mkdirSync,
  appendFileSync,
  statSync,
  renameSync,
  readdirSync,
  unlinkSync,
} from 'fs'
import { LogLevel } from '@shadiao/shared'

// ---- 文件路径 ----

function resolveLogDir(): string {
  try {
    const dir = join(app.getPath('home'), '.shadiao-agent', 'logs')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  } catch {
    return app.getPath('logs')
  }
}

// ---- 轮转 ----

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_FILES = 10

function rotateIfNeeded(filePath: string): void {
  try {
    if (!existsSync(filePath)) return
    const { size } = statSync(filePath)
    if (size < MAX_FILE_SIZE) return

    // 轮转：重命名当前文件
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const dir = dirname(filePath)
    const base = filePath.replace(/\.log$/, '')
    const rotated = `${base}.${ts}.log`
    renameSync(filePath, rotated)

    // 清理超量旧文件
    const prefix = base.split('/').pop() ?? 'main'
    const files = readdirSync(dir)
      .filter((f) => f.startsWith(prefix) && f !== `${prefix}.log`)
      .sort()
    while (files.length >= MAX_FILES) {
      const oldest = files.shift()
      if (oldest) {
        try { unlinkSync(join(dir, oldest)) } catch { /* race condition */ }
      }
    }
  } catch { /* 轮转失败不影响写入 */ }
}

// ---- 格式化 ----

function ts(): string {
  const d = new Date()
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

const LABEL: Record<string, string> = {
  error: 'ERRO', warn: 'WARN', info: 'INFO', debug: 'DEBG',
}

function fileLine(level: string, message: string, args: unknown[]): string {
  const label = LABEL[level] ?? level.toUpperCase()
  let line = `${ts()} ${label} ${message}`
  if (args.length > 0) {
    const extra = args.map((a) => {
      if (a instanceof Error) return `\n  ${a.stack ?? a.message}`
      try { return ` ${JSON.stringify(a)}` } catch { return ` ${String(a)}` }
    }).join('')
    line += extra.length > 2000 ? extra.slice(0, 2000) + '...[truncated]' : extra
  }
  return line
}

// ---- 公开 API ----

let logFile: string | null = null

/** 初始化文件日志（在 app ready 后，logger 初始化之前调用） */
export function initMainLogFile(): void {
  try {
    const dir = resolveLogDir()
    logFile = join(dir, 'main.log')
    if (!existsSync(logFile)) appendFileSync(logFile, '', 'utf-8')
    rotateIfNeeded(logFile)
  } catch {
    logFile = null
  }
}

/**
 * Hook console 方法，使所有输出同时写入日志文件。
 *
 * 仅在主进程调用一次。生产环境所有级别写入文件；开发环境仅 WARN+ 写文件。
 */
export function hookConsoleToFile(level: LogLevel): void {
  if (!logFile) return

  const orig = {
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    log: console.log.bind(console),
    debug: console.debug.bind(console),
  }

  console.error = function (...args: unknown[]) {
    orig.error(...args)
    if (level <= LogLevel.ERROR) {
      try {
        rotateIfNeeded(logFile!)
        appendFileSync(logFile!, fileLine('error', String(args[0] ?? ''), args.slice(1)) + '\n', 'utf-8')
      } catch { /* 静默 */ }
    }
  } as typeof console.error

  console.warn = function (...args: unknown[]) {
    orig.warn(...args)
    if (level <= LogLevel.WARN) {
      try {
        rotateIfNeeded(logFile!)
        appendFileSync(logFile!, fileLine('warn', String(args[0] ?? ''), args.slice(1)) + '\n', 'utf-8')
      } catch { /* 静默 */ }
    }
  } as typeof console.warn

  console.log = function (...args: unknown[]) {
    orig.log(...args)
    // console.log 对应 info + debug 两个级别
    // hook 层面无法区分，按 INFO 级别处理
    if (level <= LogLevel.INFO) {
      try {
        rotateIfNeeded(logFile!)
        appendFileSync(logFile!, fileLine('info', String(args[0] ?? ''), args.slice(1)) + '\n', 'utf-8')
      } catch { /* 静默 */ }
    }
  } as typeof console.log

  console.debug = function (...args: unknown[]) {
    if (level <= LogLevel.DEBUG) {
      orig.debug(...args)
      try {
        rotateIfNeeded(logFile!)
        appendFileSync(logFile!, fileLine('debug', String(args[0] ?? ''), args.slice(1)) + '\n', 'utf-8')
      } catch { /* 静默 */ }
    }
  } as typeof console.debug
}
