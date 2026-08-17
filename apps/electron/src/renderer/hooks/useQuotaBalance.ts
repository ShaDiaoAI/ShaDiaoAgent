/**
 * useQuotaBalance — 调用额度余额获取 hook
 *
 * 统一封装「获取余额 + 回写 callQuotaAtom」的重复逻辑：
 * - fetchQuotaBalance()：纯获取，只返回 balance（不写 atom），供需要自定义回写时序的调用方（如 AgentView 的防抖）使用。
 * - useQuotaBalance({ autoFetch })：autoFetch 时挂载拉取 + 断网恢复（online）重拉。
 *   不做定时重试；失败/未登录保持 null，由展示层显示「--」。
 */

import { useCallback, useEffect } from 'react'
import { useSetAtom, useStore } from 'jotai'
import { callQuotaAtom } from '@/atoms/quota-atoms'

/** 获取调用额度余额，成功返回 balance，失败/缺失返回 null。不写 atom。 */
export async function fetchQuotaBalance(): Promise<number | null> {
  try {
    const r = await window.electronAPI.getQuotaBalance?.()
    if (r?.success && r.data?.balance != null) return r.data.balance
    return null
  } catch {
    return null
  }
}

export function useQuotaBalance(options?: { autoFetch?: boolean }): {
  refresh: () => Promise<number | null>
} {
  const store = useStore()
  const setBalance = useSetAtom(callQuotaAtom)
  const autoFetch = options?.autoFetch ?? false

  const refresh = useCallback(async (): Promise<number | null> => {
    const balance = await fetchQuotaBalance()
    if (balance != null) setBalance(balance)
    return balance
  }, [setBalance])

  useEffect(() => {
    if (!autoFetch) return
    // 挂载时 balance 尚未有值才拉一次；之后不重试，靠 online 事件兜底断网恢复
    if (store.get(callQuotaAtom) == null) void refresh()
    const onOnline = () => { void refresh() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [autoFetch, store, refresh])

  return { refresh }
}
