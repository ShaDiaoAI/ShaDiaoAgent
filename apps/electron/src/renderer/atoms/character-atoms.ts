import { atom } from 'jotai'

// ===== Character Types =====

export interface ShadiaoCharacter {
  id: number
  name: string
  level: number
  experience: number
  exp_to_next: number
  character_class: { id: number; name: string; description: string } | null
  bound_model: string
  system_prompt: string
  equipped_skin: {
    id: number; name: string; description: string
    rarity: string; rive_asset_id: string; preview_url: string
  } | null
  equipped_items: Array<{
    id: number; name: string; item_type: string
    rarity: string; icon_url: string
  }>
  created_at: string
}

export interface Skin {
  id: number; name: string; description: string
  rarity: string; rive_asset_id: string; preview_url: string
}

export interface UserItem {
  id: number; name: string; item_type: string
  rarity: string; icon_url: string; quantity: number; equipped: boolean
}

export interface WalletInfo {
  coins: number
  total_tokens_used: number
  recent_transactions: Array<{ amount: number; reason: string; created_at: string }>
}

// ===== Character Atoms =====

export const charactersAtom = atom<ShadiaoCharacter[]>([])
export const selectedCharacterAtom = atom<ShadiaoCharacter | null>(null)
export const charactersLoadingAtom = atom<boolean>(false)

// ===== Skin Atoms =====

export const skinCatalogAtom = atom<Skin[]>([])
export const mySkinsAtom = atom<Skin[]>([])

// ===== Item/Inventory Atoms =====

export const inventoryAtom = atom<UserItem[]>([])
export const inventoryLoadingAtom = atom<boolean>(false)

// ===== Wallet Atoms =====

export const walletAtom = atom<WalletInfo | null>(null)

// ===== Reward Atoms =====

export interface RewardNotification {
  id: string
  reward_type: 'coin' | 'skin' | 'item'
  name: string
  amount?: number
  rarity?: string
  image_url?: string
  timestamp: number
  dismissed: boolean
}

export const rewardQueueAtom = atom<RewardNotification[]>([])
export const rewardHistoryAtom = atom<Array<{ id: number; reward_type: string; reward_data: Record<string, unknown>; triggered_at: string }>>([])
