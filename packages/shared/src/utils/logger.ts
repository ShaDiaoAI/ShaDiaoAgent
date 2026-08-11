/**
 * ShadiaoAgent 集中式 Logger
 *
 * 设计原则：
 * - 生产安全默认：仅输出 WARN 和 ERROR 级别
 * - 开发环境默认：输出所有级别（DEBUG+）
 * - 命名空间隔离：每个模块通过 createLogger(namespace) 获取独立 logger
 * - 跨环境兼容：同时支持 Node.js 主进程和浏览器渲染进程
 *
 * 环境变量：
 * - SHADIAO_LOG_LEVEL: 覆盖日志级别（debug / info / warn / error）
 */

/** 日志级别（数值越小越严重） */
export enum LogLevel {
  ERROR = 0,
  /** 不可恢复的错误 — 生产环境始终输出 */
  WARN = 1,
  /** 可恢复的异常 — 生产环境始终输出 */
  INFO = 2,
  /** 关键状态变更 — 仅开发环境输出 */
  DEBUG = 3,
}

// 模块级状态：全局日志级别
// 默认 WARN，确保未初始化时生产环境安全
let globalLevel: LogLevel = LogLevel.WARN

/** 设置全局日志级别（通常在应用启动时调用一次） */
export function setGlobalLogLevel(level: LogLevel): void {
  globalLevel = level
}

/** 获取当前全局日志级别 */
export function getGlobalLogLevel(): LogLevel {
  return globalLevel
}

/** 从字符串解析日志级别 */
export function parseLogLevel(raw: string): LogLevel {
  switch (raw.toLowerCase()) {
    case 'debug':
      return LogLevel.DEBUG
    case 'info':
      return LogLevel.INFO
    case 'warn':
      return LogLevel.WARN
    case 'error':
      return LogLevel.ERROR
    default:
      return LogLevel.WARN
  }
}

function formatPrefix(namespace: string): string {
  return `[${namespace}]`
}

/** Logger 接口 */
export interface Logger {
  /** 不可恢复的错误 — 始终输出 */
  error(message: string, ...args: unknown[]): void
  /** 可恢复的异常 — 生产环境输出 */
  warn(message: string, ...args: unknown[]): void
  /** 关键状态变更 — 仅开发环境输出 */
  info(message: string, ...args: unknown[]): void
  /** 调试详细信息 — 仅开发环境输出 */
  debug(message: string, ...args: unknown[]): void
}

/**
 * 创建带命名空间的 Logger 实例
 *
 * @example
 *   import { createLogger } from '@shadiao/shared'
 *   const log = createLogger('Agent 编排')
 *   log.info('Agent 启动完成')
 *   log.debug('SDK binary 路径:', binaryPath)
 *   log.warn('重试中:', err)
 *   log.error('致命错误:', err)
 */
export function createLogger(namespace: string): Logger {
  const prefix = formatPrefix(namespace)

  return {
    error(message: string, ...args: unknown[]): void {
      if (globalLevel >= LogLevel.ERROR) {
        console.error(prefix, message, ...args)
      }
    },
    warn(message: string, ...args: unknown[]): void {
      if (globalLevel >= LogLevel.WARN) {
        console.warn(prefix, message, ...args)
      }
    },
    info(message: string, ...args: unknown[]): void {
      if (globalLevel >= LogLevel.INFO) {
        console.log(prefix, message, ...args)
      }
    },
    debug(message: string, ...args: unknown[]): void {
      if (globalLevel >= LogLevel.DEBUG) {
        console.log(prefix, message, ...args)
      }
    },
  }
}
