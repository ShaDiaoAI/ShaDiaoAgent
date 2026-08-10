/**
 * Quota Atoms — 调用额度状态
 *
 * 管理从 Django /api/auth/me → balance 字段获取的 CNY 余额。
 * 用于侧边栏额度条展示 + 充值页面。
 */

import { atom } from 'jotai'

/** 调用额度余额（CNY float，null = 未加载） */
export const callQuotaAtom = atom<number | null>(null)

/** 额度条进度百分比（0-100，满额 = 100） */
export const quotaPercentAtom = atom<number>((get) => {
  const balance = get(callQuotaAtom)
  if (balance == null || balance <= 0) return 0
  return Math.min(100, Math.floor(balance))
})

/** 额度条状态词 */
export function getQuotaStatusText(balance: number | null): string {
  if (balance == null) return '加载中...'
  if (balance <= 0) return '已用完'
  if (balance < 10) return '马上用完'
  if (balance < 50) return '该充电了'
  return '电量充足'
}

/** 额度条颜色 */
export function getQuotaColor(balance: number | null): {
  fill: string
  text: string
} {
  if (balance == null || balance <= 0) return { fill: 'bg-slate-300', text: 'text-slate-400' }
  if (balance < 10) return { fill: 'bg-red-500', text: 'text-red-500' }
  if (balance < 50) return { fill: 'bg-amber-500', text: 'text-amber-500' }
  return { fill: 'bg-emerald-500', text: 'text-emerald-500' }
}
