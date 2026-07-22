// @shadiao/shared/types — ShaDiaoAgent 独有类型
// 沙雕人物系统、Django 认证、Rive 动画相关类型

// ===== Django 认证 =====

export const DJANGO_DEFAULT_BASE_URL = 'http://localhost:8000'

export const STORAGE_FILES = {
  AUTH: 'django-auth.json',
  CHARACTERS_CACHE: 'characters-cache.json',
  RIVE_CACHE: 'rive-cache',
} as const

export interface UserInfo {
  id: number
  username: string
  token?: string
}

// ===== 人物系统 =====

export interface Character {
  id: number
  name: string
  description?: string
  system_prompt: string
  bound_model?: string
  character_class_id?: number
  level?: number
  experience?: number
  /** 当前穿戴皮肤 */
  equipped_skin?: Skin
  /** 当前装备道具 */
  equipped_items?: UserItem[]
}

export interface Skin {
  id: number
  name: string
  description?: string
  image_url?: string
  /** Rive 动画文件 URL */
  rive_url?: string
  /** 是否已拥有 */
  owned?: boolean
}

export interface Item {
  id: number
  name: string
  description?: string
  type: 'weapon' | 'armor' | 'accessory'
  image_url?: string
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
}

export interface UserItem {
  id: number
  item: Item
  equipped: boolean
  acquired_at?: string
}

export interface Wallet {
  coins: number
  gems?: number
}

export interface RewardLog {
  id: number
  reward_type: string
  reward_data: Record<string, unknown>
  coins?: number
  created_at: string
}

// ===== Rive 动画 =====

export interface RiveAsset {
  id: string
  url: string
  localPath?: string
}

// ===== 奖励掉落 =====

export interface RewardDropEvent {
  reward_type: string
  reward_data: Record<string, unknown>
}
