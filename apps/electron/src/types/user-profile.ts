/**
 * 用户档案类型
 *
 * 用户名、头像、IPC 通道等定义。
 */

/** 默认用户头像 emoji */
export const DEFAULT_USER_AVATAR = '🧑‍💻'

/** 默认用户名 */
export const DEFAULT_USER_NAME = '用户'

/** 用户档案 */
export interface UserProfile {
  /** 用户名 */
  userName: string
  /** 头像（emoji 字符串 或 data:image/* base64 URL） */
  avatar: string
}

/** 用户档案 IPC 通道 */
export const USER_PROFILE_IPC_CHANNELS = {
  GET: 'user-profile:get',
  UPDATE: 'user-profile:update',
} as const
