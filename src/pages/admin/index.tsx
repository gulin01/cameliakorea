import { GetServerSideProps } from 'next'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/guards'
import { formatUZS } from '@/lib/format'
import { useS, type SShape } from '@/consts/strings'
import { useT, type TFunc } from '@/i18n'
import { formatDate } from '@/lib/format'
import AdminNav from '@/components/AdminNav'
import Link from 'next/link'
import { TrendingUp, DollarSign, AlertCircle, ShoppingCart, Wallet, Package, Sparkles, Gift } from 'lucide-react'

// Top sellers for the dashboard leaderboard — image + units sold + revenue.
type TopProduct = { product_id: string; name: string; units_sold: number; revenue: number; image_url: string | null }
type RecentSale = { seller_name: string; product_name: string; qty: number; revenue: number; sold_at: string }
type KPIs = { totalRevenue: number; myProfit: number; totalOutstanding: number; unitsSold: number }
// Business progress (discounts applied to worth/expected)
type Biz = {
  invested: number        // Σ cost × units STILL IN STOCK — money currently tied up
  worth: number           // Σ (discount ?? retail) × units STILL IN STOCK
  expectedProfit: number  // worth − invested (gross, if the remaining stock sells)
  soldRevenue: number     // Σ sales revenue so far
  giveawayUnits: number
  giveawayValue: number   // at cost
}
// Folded in from the old /admin/stats page so each number lives in exactly one place.
type SellerStat = { seller_id: string; seller_name: string; owed_from_sales: number; received: number; balance: number }
type ProductRow  = { product_id: string; name: string; total_qty: number; units_sold: number; units_remaining: number; revenue: number }
type Props = { kpis: KPIs; biz: Biz; topProducts: TopProduct[]; recentSales: RecentSale[]; sellerStats: SellerStat[]; productRows: ProductRow[] }

const CHART_COLORS = ['#F4628E','#B9A7F0','#6FD8C0','#7CC4F2','#FFB088','#F4628E','#B9A7F0','#6FD8C0']

const kpiCards = (k: KPIs, t: TFunc, S: SShape) => [
  { label: t('adash.totalSales'), value: formatUZS(k.totalRevenue),    icon: DollarSign,  bg: 'bg-gradient-to-br from-rose to-roseDark',     text: 'text-white' },
  { label: S.earningsAdmin,       value: formatUZS(k.myProfit),        icon: TrendingUp,  bg: 'bg-gradient-to-br from-mint to-success',      text: 'text-white' },
  { label: S.moneyCollect,        value: formatUZS(k.totalOutstanding),icon: AlertCircle, bg: 'bg-gradient-to-br from-peach to-warning',     text: 'text-white' },
  { label: t('adash.unitsSold'),  value: String(k.unitsSold),          icon: ShoppingCart,bg: 'bg-gradient-to-br from-lavender to-sky',      text: 'text-white' },
]

function Metric({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-surface rounded-2xl p-5 shadow-card">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-muted">{label}</p>
        <Icon className="w-5 h-5 text-muted" />
      </div>
      <p className={`font-display text-xl font-bold ${accent ? 'text-success' : 'text-ink'}`}>{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

export default function AdminDashboard({ kpis, biz, topProducts, recentSales, sellerStats, productRows }: Props) {
  const t = useT()
  const S = useS()
  // Honest denominator: what's been sold + what's still on the shelf. Comparing
  // cumulative revenue against *current* stock value would mix two different bases.
  const potential = biz.soldRevenue + biz.worth
  const pct = potential > 0 ? (biz.soldRevenue / potential) * 100 : 0
  // Leaderboard bars are scaled against the top seller (topProducts is sorted desc).
  const topSold = topProducts[0]?.units_sold ?? 0
  return (
    <div className="min-h-screen bg-cream">
      <AdminNav />
      <main className="p-6 max-w-6xl mx-auto space-y-6">

        {/* Business progress */}
        <div className="space-y-4">
          <h2 className="font-display font-bold text-ink text-lg">{t('adash.bizStatus')}</h2>

          {/* Progress hero — sold vs total worth */}
          <div className="bg-gradient-to-br from-rose to-roseDark text-white rounded-2xl p-6 shadow-card">
            <div className="flex items-end justify-between gap-3 mb-3">
              <div>
                <p className="text-sm opacity-80">{t('adash.sold')}</p>
                <p className="font-display text-3xl font-bold">{formatUZS(biz.soldRevenue)}</p>
              </div>
              <p className="text-sm opacity-80 mb-1">/ {formatUZS(potential)}</p>
            </div>
            <div className="h-3 bg-white/25 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <p className="text-xs opacity-90 mt-2">
              {t('adash.progressNote', { pct: pct.toFixed(1), worth: formatUZS(biz.worth) })}
            </p>
          </div>

          {/* Metric grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Metric icon={Wallet}   label={t('adash.investedLabel')} value={formatUZS(biz.invested)}       sub={t('adash.investedSub')} />
            <Metric icon={Package}  label={t('adash.worthLabel')}    value={formatUZS(biz.worth)}          sub={t('adash.worthSub')} />
            <Metric icon={Sparkles} label={t('adash.expectedLabel')} value={formatUZS(biz.expectedProfit)} sub={t('adash.expectedSub')} accent />
            <Metric icon={Gift}     label={t('adash.giveawaysLabel')} value={t('adash.giveUnits', { n: biz.giveawayUnits })} sub={t('adash.giveSub', { v: formatUZS(biz.giveawayValue) })} />
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards(kpis, t, S).map(card => {
            const Icon = card.icon
            return (
              <div key={card.label} className={`${card.bg} ${card.text} rounded-2xl p-5 shadow-card`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium opacity-80">{card.label}</p>
                  <Icon className="w-5 h-5 opacity-70" />
                </div>
                <p className="font-display text-2xl font-bold">{card.value}</p>
              </div>
            )
          })}
        </div>

        {/* Best-selling products — ranked leaderboard with photo, units sold and revenue */}
        <div className="bg-surface rounded-2xl shadow-card p-6">
          <h2 className="font-display font-bold text-ink text-lg mb-5">{t('adash.topProducts')}</h2>
          {topProducts.length === 0 ? (
            <p className="text-muted text-sm py-6 text-center">{t('adash.noSales')}</p>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, i) => {
                const pct = topSold > 0 ? Math.max(6, (p.units_sold / topSold) * 100) : 0
                return (
                  <div key={p.product_id} className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full grid place-items-center text-xs font-bold flex-shrink-0 ${i === 0 ? 'bg-gradient-to-br from-rose to-peach text-white' : 'bg-cream text-muted'}`}>{i + 1}</span>
                    {p.image_url
                      ? <img src={p.image_url} alt={p.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0 shadow-sm" />
                      : <div className="w-12 h-12 rounded-xl grid place-items-center flex-shrink-0 text-white font-display font-bold text-lg" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>{p.name.charAt(0).toUpperCase()}</div>}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink text-sm truncate">{p.name}</p>
                      <div className="mt-1.5 h-2 rounded-full bg-cream overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-rose to-peach transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 w-28">
                      <p className="font-display font-bold text-ink">{t('adash.soldN', { n: p.units_sold })}</p>
                      <p className="text-xs text-muted">{formatUZS(p.revenue)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Per-product report (was /admin/stats) */}
        {productRows.length > 0 && (
          <div className="bg-surface rounded-2xl shadow-card p-6">
            <h2 className="font-display font-bold text-ink text-lg mb-4">{t('adash.productReport')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 px-3 font-semibold text-muted">{t('adash.colProduct')}</th>
                    <th className="text-right py-3 px-3 font-semibold text-muted">{t('adash.colTotal')}</th>
                    <th className="text-right py-3 px-3 font-semibold text-muted">{t('adash.sold')}</th>
                    <th className="text-right py-3 px-3 font-semibold text-muted">{t('adash.colLeft')}</th>
                    <th className="text-right py-3 px-3 font-semibold text-muted">{t('adash.colRevenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {productRows.map((p, i) => (
                    <tr key={p.product_id} className={i % 2 === 1 ? 'bg-cream/50' : ''}>
                      <td className="py-3 px-3 font-medium text-ink">{p.name}</td>
                      <td className="py-3 px-3 text-right text-muted">{p.total_qty}</td>
                      <td className="py-3 px-3 text-right text-rose font-semibold">{p.units_sold}</td>
                      <td className="py-3 px-3 text-right text-ink">{p.units_remaining}</td>
                      <td className="py-3 px-3 text-right font-display font-bold text-success">{formatUZS(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Per-seller results (was /admin/stats) */}
        {sellerStats.length > 0 && (
          <div className="bg-surface rounded-2xl shadow-card p-6">
            <h2 className="font-display font-bold text-ink text-lg mb-4">{t('adash.bySeller')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sellerStats.map((s, i) => (
                <Link key={s.seller_id} href={`/admin/sellers/${s.seller_id}`}
                  className="rounded-xl p-4 hover:shadow-card transition" style={{ backgroundColor: `${CHART_COLORS[i % CHART_COLORS.length]}20` }}>
                  <p className="font-display font-bold text-ink text-base">{s.seller_name}</p>
                  <p className="text-xs text-muted mt-2">{S.moneyCollect}</p>
                  <p className="font-semibold text-warning text-sm">{formatUZS(s.owed_from_sales)}</p>
                  <p className="text-xs text-muted mt-1">{S.moneyHandedOver}</p>
                  <p className="font-semibold text-success text-sm">{formatUZS(s.received)}</p>
                  <p className="text-xs text-muted mt-1">{t('adash.remaining')}</p>
                  <p className={`font-display font-bold ${s.balance > 0 ? 'text-danger' : 'text-success'}`}>{formatUZS(s.balance)}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent sales */}
        <div className="bg-surface rounded-2xl shadow-card p-6">
          <h2 className="font-display font-bold text-ink text-lg mb-4">{t('adash.recentSales')}</h2>
          <div className="space-y-1">
            {recentSales.map((s, i) => (
              <div key={i} className={`flex justify-between items-center py-3 px-3 rounded-xl ${i % 2 === 0 ? 'bg-cream' : ''}`}>
                <div>
                  <span className="font-semibold text-rose">{s.seller_name}</span>
                  <span className="text-muted mx-2">·</span>
                  <span className="text-ink">{s.product_name}</span>
                  <span className="text-muted text-sm ml-2">×{s.qty}</span>
                </div>
                <div className="text-right">
                  <p className="font-display font-bold text-success">{formatUZS(s.revenue)}</p>
                  <p className="text-xs text-muted">{formatDate(s.sold_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const guard = await requireRole(ctx, 'admin')
  if (guard) return guard

  const supabase = createClient(ctx)
  const [{ data: recent }, { data: productStats }, { data: balances }, { data: allSales }, { data: products }, { data: adjustments }] = await Promise.all([
    // Recent feed (15 newest) — display only
    supabase.from('v_sales_enriched').select('revenue, sold_at, seller_name, product_name, qty').order('sold_at', { ascending: false }).limit(15),
    // Leaderboard: top 6 best-selling products (by units sold)
    supabase.from('v_product_stats').select('product_id, name, units_sold, revenue').order('units_sold', { ascending: false }).limit(6),
    supabase.from('v_seller_balances').select('balance'),
    // ALL sales — for the TRUE totals (not just the last 20)
    supabase.from('v_sales_enriched').select('revenue, my_profit, qty'),
    // Inventory value + capital (+ cover image for the leaderboard)
    supabase.from('products').select('id, cost, total_qty, retail_price, discount_price, image_url'),
    // Giveaways (+ damaged/lost) for the "Sovg'a" metric
    supabase.from('stock_adjustments').select('reason, qty, product_id'),
  ])

  // Current stock per product (D4). Absent view → empty, and the maths falls back.
  const { data: availability } = await supabase
    .from('v_product_availability').select('product_id, remaining')

  // Folded in from /admin/stats — shown here so no metric appears on two pages.
  const [{ data: productRows }, { data: sellerStats }] = await Promise.all([
    supabase.from('v_product_stats').select('*').order('units_sold', { ascending: false }),
    supabase.from('v_seller_balances').select('*').order('seller_name'),
  ])

  const kpis: KPIs = {
    totalRevenue:    (allSales ?? []).reduce((s, r) => s + r.revenue, 0),
    myProfit:        (allSales ?? []).reduce((s, r) => s + r.my_profit, 0),
    totalOutstanding:(balances ?? []).reduce((s, r) => s + Math.max(0, r.balance), 0),
    unitsSold:       (allSales ?? []).reduce((s, r) => s + r.qty, 0),
  }

  const prods = products ?? []
  const costById: Record<string, number> = {}
  const imageById: Record<string, string | null> = {}
  for (const p of prods) { costById[p.id] = p.cost ?? 0; imageById[p.id] = (p as any).image_url ?? null }

  // Best-selling leaderboard: real top sellers, with their cover photo attached.
  const topProducts: TopProduct[] = (productStats ?? [])
    .filter((p: any) => (p.units_sold ?? 0) > 0)
    .map((p: any) => ({
      product_id: p.product_id,
      name:       p.name,
      units_sold: p.units_sold ?? 0,
      revenue:    p.revenue ?? 0,
      image_url:  imageById[p.product_id] ?? null,
    }))

  // Value CURRENT stock, not everything ever received (ux-walkthrough §7 #14).
  // `total_qty × cost` counted units sold months ago at today's cost, so both numbers
  // drifted upward forever. `remaining` comes from v_product_availability; if that view
  // is missing we fall back to total_qty and behave exactly as before.
  const remainingById: Record<string, number> = {}
  for (const a of availability ?? []) remainingById[(a as any).product_id] = (a as any).remaining ?? 0
  const stockOf = (p: any) => remainingById[p.id] ?? p.total_qty ?? 0

  // "Qoldi" must be the one true stock number (max(0, arrived − sold)), same as the website.
  // v_product_stats.units_remaining is the legacy total_qty − sold (can go negative) — override it.
  const productRowsReconciled = (productRows ?? []).map((p: any) => ({
    ...p,
    units_remaining: Math.max(0, remainingById[p.product_id] ?? p.units_remaining ?? 0),
  }))

  const invested = prods.reduce((s, p) => s + (p.cost ?? 0) * stockOf(p), 0)
  const worth    = prods.reduce((s, p) => s + ((p.discount_price ?? p.retail_price) ?? 0) * stockOf(p), 0)
  const giveaways = (adjustments ?? []).filter(a => a.reason === 'giveaway' || a.reason === 'gift')
  const biz: Biz = {
    invested,
    worth,
    expectedProfit: worth - invested,
    soldRevenue:    kpis.totalRevenue,
    giveawayUnits:  giveaways.reduce((s, a) => s + (a.qty ?? 0), 0),
    giveawayValue:  giveaways.reduce((s, a) => s + (costById[a.product_id] ?? 0) * (a.qty ?? 0), 0),
  }

  return { props: { kpis, biz, topProducts, recentSales: recent ?? [], sellerStats: sellerStats ?? [], productRows: productRowsReconciled } }
}
