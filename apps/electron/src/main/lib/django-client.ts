import { join } from 'node:path'
import { getConfigDir } from './config-paths.js'
import { readJsonFileSafe, writeJsonFileAtomic } from './safe-file.js'

const BASE = 'http://localhost:8000'
const AUTH_FILE = 'django-auth.json'
const CHARS_FILE = 'characters-cache.json'

// ===== Types =====

export interface DjangoAuthState {
  baseUrl: string
  token: string
  username: string
  isLoggedIn: boolean
}

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

export interface Item {
  id: number; name: string; item_type: string
  description: string; rarity: string; icon_url: string
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

export interface RewardLog {
  id: number; reward_type: string
  reward_data: Record<string, unknown>
  token_threshold: number | null
  triggered_at: string
}

// ===== Auth =====

export function getAuthState(): DjangoAuthState {
  return readJsonFileSafe<DjangoAuthState>(join(getConfigDir(), AUTH_FILE))
    ?? { baseUrl: BASE, token: '', username: '', isLoggedIn: false }
}

export async function loginToDjango(baseUrl: string, username: string, password: string): Promise<DjangoAuthState> {
  const r = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!r.ok) throw new Error('Login failed: ' + r.status)
  const d = await r.json() as { id: number; username: string; token: string }
  const s: DjangoAuthState = { baseUrl, token: d.token, username, isLoggedIn: true }
  writeJsonFileAtomic(join(getConfigDir(), AUTH_FILE), s)
  return s
}

export function logoutFromDjango() {
  writeJsonFileAtomic(join(getConfigDir(), AUTH_FILE),
    { baseUrl: BASE, token: '', username: '', isLoggedIn: false })
}

export async function validateToken(): Promise<boolean> {
  const s = getAuthState()
  if (!s.token) return false
  try {
    const r = await fetch(s.baseUrl + '/api/auth/me',
      { headers: { Authorization: 'Bearer ' + s.token } })
    return r.ok
  } catch { return false }
}

// ===== Generic API =====

export async function djangoApiRequest<T>(endpoint: string, opts: RequestInit = {}): Promise<T> {
  const s = getAuthState()
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  }
  if (s.token) {
    h['Authorization'] = 'Bearer ' + s.token
    h['x-api-key'] = s.token
  }
  const r = await fetch(s.baseUrl + endpoint, { ...opts, headers: h })
  if (!r.ok) throw new Error(`Django API error: ${r.status}`)
  return r.json() as T
}

// ===== Characters =====

export async function fetchCharacters(): Promise<ShadiaoCharacter[]> {
  try {
    const d = await djangoApiRequest<ShadiaoCharacter[]>('/api/characters/')
    writeJsonFileAtomic(join(getConfigDir(), CHARS_FILE), d)
    return d
  } catch { return getCachedCharacters() }
}

export async function getCharacter(id: number): Promise<ShadiaoCharacter> {
  return djangoApiRequest<ShadiaoCharacter>(`/api/characters/${id}`)
}

export async function createCharacter(data: {
  name: string
  character_class_id?: number
  bound_model?: string
  system_prompt?: string
}): Promise<ShadiaoCharacter> {
  return djangoApiRequest<ShadiaoCharacter>('/api/characters/', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateCharacter(id: number, data: {
  name?: string
  bound_model?: string
  system_prompt?: string
}): Promise<ShadiaoCharacter> {
  return djangoApiRequest<ShadiaoCharacter>(`/api/characters/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteCharacter(id: number): Promise<void> {
  await djangoApiRequest(`/api/characters/${id}`, { method: 'DELETE' })
}

export function getCachedCharacters(): ShadiaoCharacter[] {
  return readJsonFileSafe<ShadiaoCharacter[]>(join(getConfigDir(), CHARS_FILE)) ?? []
}

// ===== Skins =====

export async function fetchSkinCatalog(): Promise<Skin[]> {
  return djangoApiRequest<Skin[]>('/api/characters/skins/catalog')
}

export async function fetchMySkins(): Promise<Skin[]> {
  return djangoApiRequest<Skin[]>('/api/characters/skins/mine')
}

export async function equipSkin(characterId: number, skinId: number): Promise<void> {
  await djangoApiRequest(`/api/characters/${characterId}/equip-skin`, {
    method: 'POST',
    body: JSON.stringify({ skin_id: skinId }),
  })
}

// ===== Items =====

export async function fetchItemCatalog(): Promise<Item[]> {
  return djangoApiRequest<Item[]>('/api/items/catalog')
}

export async function fetchInventory(): Promise<UserItem[]> {
  return djangoApiRequest<UserItem[]>('/api/items/inventory')
}

export async function equipItem(inventoryId: number): Promise<void> {
  await djangoApiRequest(`/api/items/inventory/${inventoryId}/equip`, { method: 'POST' })
}

export async function unequipItem(inventoryId: number): Promise<void> {
  await djangoApiRequest(`/api/items/inventory/${inventoryId}/unequip`, { method: 'POST' })
}

// ===== Wallet & Rewards =====

export async function fetchWallet(): Promise<WalletInfo> {
  return djangoApiRequest<WalletInfo>('/api/wallet')
}

export async function fetchRewards(): Promise<RewardLog[]> {
  return djangoApiRequest<RewardLog[]>('/api/rewards')
}
