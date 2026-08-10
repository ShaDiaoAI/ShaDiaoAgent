import { join } from 'node:path'
import { app } from 'electron'
import { getConfigDir } from './config-paths.js'
import { readJsonFileSafe, writeJsonFileAtomic } from './safe-file.js'

const DEV_BASE_URL = 'http://localhost:8000'
const PROD_BASE_URL = 'https://api.shaodiao.ai'  // TODO: 生产环境 URL 待定

const AUTH_FILE = 'django-auth.json'
const CHARS_FILE = 'characters-cache.json'

/** 根据打包环境返回默认后端 URL（dev/prod 写死，不暴露给用户） */
export function getDefaultBaseUrl(): string {
  return app.isPackaged ? PROD_BASE_URL : DEV_BASE_URL
}

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
  current_level_xp: number
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
  /** 持有数量（/api/characters/skins/mine 可能不返回此字段，前端自行聚合） */
  quantity?: number
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

export interface DrawSkinOut {
  id: number; name: string; description: string
  rarity: string; rive_asset_id: string; preview_url: string
}

export interface DrawResult {
  skin: DrawSkinOut
  is_new: boolean
  quantity: number
}

export interface DrawOutput {
  results: DrawResult[]
  coins_spent: number
  coins_remaining: number
}

export interface GachaProgress {
  coins: number
  single_draw_cost: number
  multi_draw_cost: number
  progress_to_single: number
  can_single_draw: boolean
  can_multi_draw: boolean
}

export interface CreationLimit {
  max_characters: number
  current_count: number
  can_create: boolean
  base: number
  from_characters: Array<{
    character_id: number
    name: string
    level: number
    slots: number
  }>
  total_extra: number
}

// ===== Auth =====

export function getAuthState(): DjangoAuthState {
  return readJsonFileSafe<DjangoAuthState>(join(getConfigDir(), AUTH_FILE))
    ?? { baseUrl: getDefaultBaseUrl(), token: '', username: '', isLoggedIn: false }
}

export async function loginToDjango(username: string, password: string, baseUrl?: string): Promise<DjangoAuthState> {
  const url = baseUrl || getDefaultBaseUrl()
  const r = await fetch(url + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!r.ok) throw new Error('Login failed: ' + r.status)
  const d = await r.json() as { id: number; username: string; token: string }
  const s: DjangoAuthState = { baseUrl: url, token: d.token, username, isLoggedIn: true }
  writeJsonFileAtomic(join(getConfigDir(), AUTH_FILE), s)
  return s
}

export function logoutFromDjango() {
  writeJsonFileAtomic(join(getConfigDir(), AUTH_FILE),
    { baseUrl: getDefaultBaseUrl(), token: '', username: '', isLoggedIn: false })
}

export async function registerToDjango(username: string, password: string, baseUrl?: string): Promise<DjangoAuthState> {
  const url = baseUrl || getDefaultBaseUrl()
  const r = await fetch(url + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!r.ok) {
    const errorData = await r.json().catch(() => ({})) as Record<string, unknown>
    const detail = typeof errorData.detail === 'string' ? errorData.detail : ''
    if (detail) throw new Error(detail)
    throw new Error('注册失败: ' + r.status)
  }
  const d = await r.json() as { id: number; username: string; token: string }
  const s: DjangoAuthState = { baseUrl: url, token: d.token, username, isLoggedIn: true }
  writeJsonFileAtomic(join(getConfigDir(), AUTH_FILE), s)
  return s
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

export async function equipSkin(characterId: number, skinId: number | string): Promise<void> {
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

// ===== Call Quota (调用额度) =====

export interface QuotaBalance {
  balance: number  // CNY float，来自 /api/auth/me
}

export async function fetchQuotaBalance(): Promise<QuotaBalance> {
  return djangoApiRequest<QuotaBalance>('/api/auth/me')
}

// ===== Gacha =====

export async function drawGacha(count: number): Promise<DrawOutput> {
  return djangoApiRequest<DrawOutput>('/api/gacha/draw', {
    method: 'POST',
    body: JSON.stringify({ count }),
  })
}

export async function fetchGachaProgress(): Promise<GachaProgress> {
  return djangoApiRequest<GachaProgress>('/api/gacha/progress')
}

export async function fetchCreationLimit(): Promise<CreationLimit> {
  return djangoApiRequest<CreationLimit>('/api/characters/creation-limit')
}

// ===== Recharge (充值) =====

export interface RechargeProduct {
  id: number
  name: string
  price_rmb: string       // "95.00"
  quota_amount: string    // "100.00" — 实充额度
  badge: string
  tagline: string
  character_asset_id: string
}

export interface ProductList {
  products: RechargeProduct[]
}

export interface RechargeOrder {
  order_no: string
  qr_code: string
  expires_in: number
  amount_rmb: string
}

export interface OrderStatus {
  order_no: string
  status: string   // "pending" | "paid" | "expired"
  amount_rmb: string
}

/** 获取充值档位列表（无需认证） */
export async function fetchRechargeProducts(): Promise<ProductList> {
  // /recharge/products 是公开接口，直接调 baseUrl 不经过 djangoApiRequest（它要求已登录）
  const s = getAuthState()
  const r = await fetch(s.baseUrl + '/api/recharge/products')
  if (!r.ok) throw new Error(`获取充值档位失败: ${r.status}`)
  return r.json() as ProductList
}

/** 创建充值订单 */
export async function createRechargeOrder(productId: number): Promise<RechargeOrder> {
  return djangoApiRequest<RechargeOrder>('/api/recharge/orders/create', {
    method: 'POST',
    body: JSON.stringify({ product_id: productId }),
  })
}

/** 查询订单支付状态 */
export async function getRechargeOrderStatus(orderNo: string): Promise<OrderStatus> {
  return djangoApiRequest<OrderStatus>(`/api/recharge/orders/status/${orderNo}`)
}
