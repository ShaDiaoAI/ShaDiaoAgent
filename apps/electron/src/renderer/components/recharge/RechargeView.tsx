/**
 * RechargeView — 「调用额度」独立充值页
 *
 * 使用与 CharacterPanelView 相同的布局模板：
 * 返回按钮 + 大标题 + 内容区。
 *
 * 流程：选档位（从后端动态获取）→ 微信扫码 → 轮询 → 到账确认
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Zap, ArrowLeft, Check, Loader2, Clock, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { callQuotaAtom } from '@/atoms/quota-atoms'
import { activeViewAtom } from '@/atoms/active-view'
import { createLogger } from '@shadiao/shared'

const log = createLogger('RechargeView')

// ===== 类型 =====

/** 后端返回的档位 */
interface ApiProduct {
  id: number
  name: string
  price_rmb: string       // "95.00"
  quota_amount: string    // "100.00"
  badge: string
  tagline: string
  character_asset_id: string
}

/** UI 使用的档位（派生字段） */
interface RechargeProduct {
  id: number
  name: string
  amount_rmb: string
  amount_display: string
  characterAssetId: string
  tagline: string
  badge?: string
  bonusInfo?: string
  originalPrice?: string
}

interface RechargeOrder {
  order_no: string
  qr_code: string
  expires_in: number
  amount_rmb: string
}

// ===== QR 图片 URL =====

function qrImageUrl(qrCode: string, size = 200): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(qrCode)}`
}

/** 从 API 返回的档位转换为 UI 需要的格式 */
function toRechargeProduct(p: ApiProduct): RechargeProduct {
  const price = parseFloat(p.price_rmb)
  const quota = parseFloat(p.quota_amount)
  const hasBonus = quota > price

  return {
    id: p.id,
    name: p.name,
    amount_rmb: p.price_rmb,
    amount_display: String(Math.round(price)),
    characterAssetId: p.character_asset_id,
    tagline: p.tagline,
    badge: p.badge || undefined,
    bonusInfo: hasBonus ? `实充${Math.round(quota)}额度` : undefined,
    originalPrice: hasBonus ? String(Math.round(quota)) : undefined,
  }
}

// ===== 主组件 =====

type Step = 'select' | 'paying' | 'success'

export function RechargeView(): React.ReactElement {
  const [balance, setBalance] = useAtom(callQuotaAtom)
  const setActiveView = useSetAtom(activeViewAtom)

  // 数据
  const [products, setProducts] = React.useState<RechargeProduct[]>([])
  const [loading, setLoading] = React.useState(true)

  // 选择
  const [selectedProductId, setSelectedProductId] = React.useState<number | null>(null)

  // 支付流程
  const [step, setStep] = React.useState<Step>('select')
  const [currentOrder, setCurrentOrder] = React.useState<RechargeOrder | null>(null)
  const [qrExpiry, setQrExpiry] = React.useState(0)
  const [paying, setPaying] = React.useState(false)
  const pollingRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  // 初始加载
  React.useEffect(() => {
    Promise.all([
      fetchBalance(),
      fetchProducts(),
    ]).finally(() => setLoading(false))
  }, [])

  // 清理轮询
  React.useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  async function fetchBalance() {
    try {
      const r = await window.electronAPI.getQuotaBalance?.()
      if (r?.success && r.data?.balance != null) {
        setBalance(r.data.balance)
      }
    } catch (e) { log.error('fetchBalance:', e) }
  }

  async function fetchProducts() {
    try {
      const r = await window.electronAPI.getRechargeProducts?.()
      if (r?.success && r.data?.products) {
        setProducts(r.data.products.map(toRechargeProduct))
      }
    } catch (e) {
      log.error('fetchProducts:', e)
      toast.error('获取充值档位失败')
    }
  }

  // ===== 创建订单 → 展示 QR =====

  const selectedProduct = products.find(p => p.id === selectedProductId)

  async function handleCreateOrder() {
    if (!selectedProductId || paying) return
    setPaying(true)
    try {
      const r = await window.electronAPI.createRechargeOrder?.(selectedProductId)
      if (!r?.success || !r.data) {
        throw new Error(r?.error || '创建订单失败')
      }
      const order: RechargeOrder = r.data
      setCurrentOrder(order)
      setQrExpiry(Date.now() + order.expires_in * 1000)
      setStep('paying')
      startPolling(order.order_no)
    } catch (e) {
      toast.error((e as Error).message || '创建订单失败，请稍后再试')
    } finally {
      setPaying(false)
    }
  }

  function startPolling(orderNo: string) {
    if (pollingRef.current) clearInterval(pollingRef.current)

    let fastPolls = 10 // 前 30 秒每 3 秒轮询 = 10 次
    pollingRef.current = setInterval(async () => {
      try {
        const r = await window.electronAPI.getRechargeOrderStatus?.(orderNo)
        if (r?.success && r.data) {
          if (r.data.status === 'paid') {
            handlePaymentSuccess()
            return
          } else if (r.data.status === 'expired') {
            toast.error('订单已过期')
            // 不清除轮询——倒计时 UI 会显示过期
          }
        }
      } catch (e) { /* 轮询失败静默，下次再试 */ }

      fastPolls--
      if (fastPolls <= 0 && pollingRef.current) {
        // 切换到 10 秒轮询
        clearInterval(pollingRef.current)
        pollingRef.current = setInterval(async () => {
          try {
            const r = await window.electronAPI.getRechargeOrderStatus?.(orderNo)
            if (r?.success && r.data?.status === 'paid') {
              handlePaymentSuccess()
            }
          } catch (e) { /* ignore */ }
        }, 10000)
      }
    }, 3000)
  }

  function handlePaymentSuccess() {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
    fetchBalance()
    setStep('success')
  }

  function handleCancelPayment() {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
    setStep('select')
    setCurrentOrder(null)
  }

  function handleDone() {
    setStep('select')
    setCurrentOrder(null)
    setSelectedProductId(null)
  }

  // ===== 倒计时 =====

  const [countdown, setCountdown] = React.useState('')
  React.useEffect(() => {
    if (step !== 'paying' || !qrExpiry) return
    const tick = () => {
      const remaining = Math.max(0, qrExpiry - Date.now())
      const m = Math.floor(remaining / 60000)
      const s = Math.floor((remaining % 60000) / 1000)
      setCountdown(`${m}:${String(s).padStart(2, '0')}`)
      if (remaining <= 0 && pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [step, qrExpiry])

  const qrExpired = qrExpiry > 0 && Date.now() >= qrExpiry

  // ===== 加载中 =====

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ===== 渲染 =====

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 返回栏 */}
      <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center px-8 pt-14 pb-5">
        <button
          type="button"
          onClick={() => setActiveView('conversations')}
          className="titlebar-no-drag -ml-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          aria-label="返回会话"
        >
          <ArrowLeft className="size-3.5" />
          <span>返回</span>
        </button>
      </div>

      {/* 标题栏 */}
      <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between px-8 pb-4">
        <div className="flex items-center gap-2.5">
          <Zap className="size-6 text-foreground/70" />
          <h1 className="text-2xl font-semibold text-foreground">调用额度</h1>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-8 pb-12 space-y-6">

          {/* 当前额度 */}
          <div className="rounded-xl border bg-card p-5">
            <div className="text-xs text-muted-foreground mb-1">当前额度</div>
            <div className="text-3xl font-bold tabular-nums text-foreground">
              {balance?.toFixed(2) ?? '--'}
            </div>
          </div>

          {step === 'select' && (
            <>
              {/* 充值档位 */}
              <div>
                <p className="text-sm font-medium text-foreground mb-3">选择充值金额</p>
                {products.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    暂无可用档位，请联系管理员
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {products.map((product) => {
                      const isSelected = selectedProductId === product.id
                      const previewPath = `./characters/${product.characterAssetId}/preview.png`
                      return (
                        <button
                          key={product.id}
                          onClick={() => setSelectedProductId(product.id)}
                          className={cn(
                            'group relative flex flex-col rounded-xl border bg-card transition-all duration-200 text-left',
                            'hover:-translate-y-0.5 hover:shadow-md',
                            isSelected
                              ? 'border-primary/60 ring-2 ring-primary/30 shadow-sm'
                              : 'border-border shadow-sm hover:border-primary/30',
                          )}
                        >
                          {/* Banner 条 — 绝对定位到按钮上，左右略微超出以覆盖卡片边框 */}
                          {product.badge && (
                            <div className="absolute -left-px -right-px -top-px z-10 flex items-center justify-center gap-1.5 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-[10px] font-semibold text-white rounded-t-xl">
                              🔥 {product.badge}{product.bonusInfo ? ` · ${product.bonusInfo}` : ''}
                            </div>
                          )}

                          {!product.badge && product.bonusInfo && (
                            <div className="absolute -left-px -right-px -top-px z-10 flex items-center justify-center py-1 text-[10px] font-medium text-foreground/70 rounded-t-xl">
                              {product.bonusInfo}
                            </div>
                          )}

                          {/* 角色预览图 */}
                          <div className="relative aspect-square bg-muted/30 flex items-center justify-center overflow-hidden rounded-b-xl">
                            <img
                              src={previewPath}
                              alt={product.characterAssetId}
                              className="w-full h-full object-cover object-top"
                            />
                            {isSelected && (
                              <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary text-[9px] font-medium text-primary-foreground shadow-sm">
                                <Check className="size-2.5" />
                                已选择
                              </div>
                            )}
                          </div>

                          {/* 信息栏 */}
                          <div className="flex flex-col items-center gap-0.5 px-2.5 py-2.5 border-t border-border/60">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-xl font-bold tabular-nums text-foreground">
                                ¥{product.amount_display}
                              </span>
                              {product.originalPrice && (
                                <span className="text-xs text-muted-foreground/50 line-through tabular-nums">
                                  ¥{product.originalPrice}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground text-center leading-tight mt-0.5">
                              {product.tagline}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 支付按钮 */}
              <button
                disabled={!selectedProductId || paying}
                onClick={handleCreateOrder}
                className={cn(
                  'flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-medium transition-all duration-200',
                  selectedProductId && !paying
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]'
                    : 'bg-muted text-muted-foreground cursor-not-allowed',
                )}
              >
                {paying ? (
                  <><Loader2 size={16} className="animate-spin" /> 创建订单中...</>
                ) : selectedProduct ? (
                  <>微信支付 ¥{selectedProduct.amount_display}</>
                ) : (
                  '请选择充值金额'
                )}
              </button>
            </>
          )}

          {step === 'paying' && currentOrder && (
            <div className="rounded-xl border bg-card p-6 text-center space-y-4">
              <h3 className="text-lg font-semibold text-foreground">
                微信扫码支付 ¥{currentOrder.amount_rmb}
              </h3>

              {/* QR Code */}
              <div className="inline-block rounded-xl border bg-white p-3">
                {qrExpired ? (
                  <div className="flex flex-col items-center justify-center gap-3 w-[200px] h-[200px] text-muted-foreground">
                    <RefreshCw size={24} />
                    <span className="text-xs">二维码已过期</span>
                    <button
                      onClick={handleCreateOrder}
                      disabled={paying}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      重新获取
                    </button>
                  </div>
                ) : (
                  <img
                    src={qrImageUrl(currentOrder.qr_code)}
                    alt="微信支付二维码"
                    className="w-[200px] h-[200px]"
                  />
                )}
              </div>

              {/* 倒计时 */}
              {!qrExpired && (
                <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <Clock size={12} />
                  <span className="tabular-nums">{countdown}</span>
                  <span>后过期</span>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                请用手机微信扫描二维码完成支付
              </p>

              <div className="pt-2">
                <button
                  onClick={handleCancelPayment}
                  className="py-2 px-6 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  取消支付
                </button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="rounded-xl border bg-card p-6 text-center space-y-3">
              <div className="flex items-center justify-center size-12 mx-auto rounded-full bg-emerald-100">
                <Check className="size-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">充值成功</h3>
              <p className="text-sm text-muted-foreground">
                额度已到账，请继续使用
              </p>
              <div className="rounded-lg bg-muted/30 py-2 px-4 inline-block">
                <span className="text-sm text-muted-foreground">当前额度 </span>
                <span className="text-sm font-bold tabular-nums text-foreground">
                  {balance?.toFixed(2) ?? '--'}
                </span>
              </div>
              <div className="pt-2">
                <button
                  onClick={handleDone}
                  className="px-6 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  完成
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
