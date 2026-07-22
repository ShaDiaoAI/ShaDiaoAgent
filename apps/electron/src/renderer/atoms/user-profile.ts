/**
 * User Profile Atom - 用户档案状态
 *
 * 管理用户名和头像，通过 IPC 从本地配置文件加载/保存。
 */

import { atom } from 'jotai'
import { DEFAULT_USER_AVATAR, DEFAULT_USER_NAME } from '../../types'
import type { UserProfile } from '../../types'

/** 用户档案 */
export const userProfileAtom = atom<UserProfile>({
  userName: DEFAULT_USER_NAME,
  avatar: DEFAULT_USER_AVATAR,
})
