import { atom } from 'jotai'

/** 用户是否已通过 Django 认证（控制登录页 vs 主界面的显示） */
export const isAuthenticatedAtom = atom<boolean | null>(null)
// null = 尚未检查认证状态；true = 已登录；false = 未登录
