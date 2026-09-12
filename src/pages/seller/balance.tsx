import { GetServerSideProps } from 'next'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/guards'
import { formatUZS, formatDate } from '@/lib/format'
import SellerNav from '@/components/SellerNav'
import { useState } from 'react'
import { History, Sparkles, CircleDollarSign, CheckCircle2, ChevronDown, CalendarDays } from 'lucide-react'
import { useS } from '@/consts/strings'
import { useT, useLocale } from '@/i18n'

const UZ_MONTH = ['', 'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr']
// Locale-aware month label: Uzbek keeps the custom names; en/ru/ko use the platform's month names.
const monthLabel = (ym: string, locale: string) => {
  const [y, m] = ym.split('-'); const n = parseInt(m, 10)
  if (locale === 'uz') return `${UZ_MONTH[n] ?? m} ${y}`
  return `${new Date(Number(y), n - 1, 1).toLocaleString(locale, { month: 'long' })} ${y}`
}

// From v_my_summary (a definer view — correct for sellers, unlike v_seller_balances
// which returns 0 because of the products-RLS cascade).
type Summary = {
  your_total_profit: number   // her 40% — hers to keep
  total_owed: number          // total she must hand over
  submitted: number           // already handed over
  not_submitted: number       // still owed
}
type Payment = { id: string; amount: number; note: string | null; paid_at: string }
type Monthly = { month: string; units_sold: number; revenue: number; your_profit: number }

type Props = { summary: Summary | null; payments: Payment[]; monthly: Monthly[]; commissionPct: number }

export default function MyBalance({ summary, payments, monthly, commissionPct }: Props) {
  const S = useS()
  const t = useT()
  const locale = useLocale()
  const [showBreakdown, setShowBreakdown] = useState(false)

  if (!summary) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <p className="text-muted">{S.noData}</p>
    </div>
  )

  // Total money the seller collected from customers = her kept profit + what Camelia is owed.
  const collected = summary.your_total_profit + summary.total_owed

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-gradient-to-br from-rose to-peach text-white px-5 pt-8 pb-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4" />
        <h1 className="font-display text-2xl font-bold relative">{S.myBalance}</h1>
      </header>

      <main className="px-4 -mt-6 pb-28 relative z-10 space-y-3">

        {/* Your earnings — the friendly, positive number (her 40%) */}
        <div className="rounded-2xl p-6 shadow-rose text-white bg-gradient-to-br from-success to-mint">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-6 h-6 opacity-90" />
            <p className="font-medium opacity-90">{S.myEarnings}</p>
          </div>
          <p className="font-display text-4xl font-bold">{formatUZS(summary.your_total_profit)}</p>
          <p className="text-white/80 text-xs mt-2">{S.earningsHint(commissionPct)}</p>
        </div>

        {/* Hand-over block */}
        <div className="grid grid-cols-2 gap-3">
          {/* Topshirilgan — clickable to reveal the breakdown */}
          <button onClick={() => setShowBreakdown(v => !v)}
            className="text-left bg-surface rounded-2xl p-5 shadow-card active:scale-[0.98] transition">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <p className="text-xs font-medium text-muted">{S.handedOver}</p>
            </div>
            <p className="font-display text-xl font-bold text-success">{formatUZS(summary.submitted)}</p>
            <p className="flex items-center gap-1 text-[11px] text-rose font-semibold mt-1">
              {S.tapForDetails} <ChevronDown className={`w-3 h-3 transition ${showBreakdown ? 'rotate-180' : ''}`} />
            </p>
          </button>
          <div className="bg-surface rounded-2xl p-5 shadow-card">
            <div className="flex items-center gap-2 mb-2">
              <CircleDollarSign className="w-4 h-4 text-muted" />
              <p className="text-xs font-medium text-muted">{S.toHandOver}</p>
            </div>
            <p className="font-display text-xl font-bold text-ink">{formatUZS(summary.total_owed)}</p>
          </div>
        </div>

        {/* Breakdown — plain-language money flow (shown when Topshirilgan tapped) */}
        {showBreakdown && (
          <div className="bg-surface rounded-2xl shadow-card p-5">
            <p className="font-display font-bold text-ink mb-4">{S.breakdownTitle}</p>

            {/* Total collected */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <span className="text-sm text-muted">{S.collected}</span>
              <span className="font-display font-bold text-ink">{formatUZS(collected)}</span>
            </div>

            {/* Her profit — kept */}
            <div className="flex items-center justify-between py-3 pl-4 border-l-2 border-success/40 ml-1 mt-2">
              <span className="text-sm text-ink flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-success" /> {S.yoursKept(commissionPct)}</span>
              <span className="font-display font-bold text-success">{formatUZS(summary.your_total_profit)}</span>
            </div>

            {/* Camelia's share */}
            <div className="flex items-center justify-between py-2 pl-4 border-l-2 border-rose/40 ml-1">
              <span className="text-sm text-ink">{S.cameliaShare}</span>
              <span className="font-display font-bold text-ink">{formatUZS(summary.total_owed)}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 pl-10 ml-1 text-sm">
              <span className="text-muted flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success" /> {S.ofWhichPaid}</span>
              <span className="font-semibold text-success">{formatUZS(summary.submitted)}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 pl-10 ml-1 text-sm">
              <span className="text-muted">⏳ {S.ofWhichLeft}</span>
              <span className="font-semibold text-danger">{formatUZS(Math.max(0, summary.not_submitted))}</span>
            </div>

            <p className="text-xs text-muted leading-relaxed mt-4 bg-cream rounded-xl px-4 py-3">
              {S.breakdownNote(commissionPct)}
            </p>
          </div>
        )}

        {/* Still owed — the big number that matters */}
        <div className={`rounded-2xl p-6 shadow-card ${summary.not_submitted > 0 ? 'bg-gradient-to-br from-rose to-peach text-white' : 'bg-gradient-to-br from-success to-mint text-white'}`}>
          <p className="font-medium opacity-90 mb-1">{S.stillOwed}</p>
          <p className="font-display text-4xl font-bold">{formatUZS(Math.max(0, summary.not_submitted))}</p>
          {summary.not_submitted <= 0 && <p className="text-white/80 text-sm mt-2">{S.settled}</p>}
        </div>

        {/* Monthly statement — screenshot-friendly per-month summary */}
        {monthly.length > 0 && (
          <div className="bg-surface rounded-2xl shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-rose" />
              <h3 className="font-display font-bold text-ink text-base">{t('sbal.monthlyReport')}</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {[...monthly].reverse().map(m => (
                <div key={m.month} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-display font-bold text-ink">{monthLabel(m.month, locale)}</p>
                    <span className="text-xs text-muted">{t('sbal.soldCount', { n: m.units_sold })}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-cream rounded-xl px-3 py-2">
                      <p className="text-[11px] text-muted">{t('sbal.sales')}</p>
                      <p className="font-display font-bold text-ink text-sm">{formatUZS(m.revenue)}</p>
                    </div>
                    <div className="bg-gradient-to-br from-success/10 to-mint/10 rounded-xl px-3 py-2">
                      <p className="text-[11px] text-muted">{t('sbal.yourEarnings')}</p>
                      <p className="font-display font-bold text-success text-sm">{formatUZS(m.your_profit)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment history */}
        <div className="bg-surface rounded-2xl shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <History className="w-4 h-4 text-rose" />
            <h3 className="font-display font-bold text-ink text-base">{S.paymentHistory}</h3>
          </div>
          {payments.length === 0 ? (
            <p className="text-muted text-sm px-5 py-6 text-center">{S.noPayments}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {payments.map(p => (
                <li key={p.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="font-display font-bold text-success">{formatUZS(p.amount)}</p>
                    {p.note && <p className="text-xs text-muted mt-0.5">{p.note}</p>}
                  </div>
                  <p className="text-xs text-muted">{formatDate(p.paid_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <SellerNav />
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const guard = await requireRole(ctx, 'seller')
  if (guard) return guard

  const supabase = createClient(ctx)
  const { data: { session } } = await supabase.auth.getSession()

  const { data: profile } = await supabase
    .from('profiles').select('id, commission_rate').eq('user_id', session!.user.id).single()

  // v_my_summary is a definer view → correct numbers even with the products-RLS cascade.
  // (v_seller_balances returns balance=0 for sellers — do NOT use it here.)
  const [summaryRes, paymentsRes, monthlyRes] = await Promise.all([
    supabase.from('v_my_summary').select('your_total_profit, total_owed, submitted, not_submitted').maybeSingle(),
    supabase.from('payments').select('id, amount, note, paid_at').eq('seller_id', profile!.id).order('paid_at', { ascending: false }),
    supabase.from('v_my_monthly').select('month, units_sold, revenue, your_profit'),
  ])

  return {
    props: {
      summary: summaryRes.data ?? null,
      payments: paymentsRes.data ?? [],
      monthly: monthlyRes.data ?? [],
      commissionPct: Math.round((profile?.commission_rate ?? 0.4) * 100),
    },
  }
}
