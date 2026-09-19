import { GetServerSideProps } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPublicClient } from '@/lib/supabase/api'
import { TOPICS } from '@/consts/community'
import { formatDate } from '@/lib/format'
import { useT, useLocale, type TFunc, type Locale } from '@/i18n'
import LangSwitcher from '@/components/LangSwitcher'
import { ArrowLeft, MessageCircleQuestion, Send, X, Loader2, Copy, Check, Tag, User, ArrowDownUp } from 'lucide-react'

type QA = { id: string; name: string | null; question: string; answer: string; topic: string | null; created_at: string | null; answered_at: string | null }

// One-tap starters (chip/question come from the dictionary) so the blank page never intimidates.
const EXAMPLES = [
  { chipKey: 'comm.ex1.chip', qKey: 'comm.ex1.q', topic: 'koreys_tili' },
  { chipKey: 'comm.ex2.chip', qKey: 'comm.ex2.q', topic: 'koreya' },
  { chipKey: 'comm.ex3.chip', qKey: 'comm.ex3.q', topic: 'dasturchilik' },
  { chipKey: 'comm.ex4.chip', qKey: 'comm.ex4.q', topic: 'boshqa' },
]

// Each topic gets its own colour so the filter list reads as a playful, varied set
// rather than one flat colour. Assigned by the topic's position in TOPICS, so a given
// category always keeps the same colour (stable, not flickering on every render).
// How many answered questions to show per page.
const PAGE_SIZE = 8

const TOPIC_STYLES = [
  { badge: 'bg-rose/15 text-rose',          chip: 'bg-rose/10 text-rose',          active: 'bg-gradient-to-br from-rose to-peach text-white shadow-rose' },
  { badge: 'bg-lavender/20 text-lavender',  chip: 'bg-lavender/15 text-lavender',  active: 'bg-lavender text-white shadow-card' },
  { badge: 'bg-sky/20 text-sky',            chip: 'bg-sky/15 text-sky',            active: 'bg-sky text-white shadow-card' },
  { badge: 'bg-mint/25 text-success',       chip: 'bg-mint/20 text-success',       active: 'bg-success text-white shadow-card' },
  { badge: 'bg-orange-100 text-warning',    chip: 'bg-orange-50 text-warning',     active: 'bg-warning text-white shadow-card' },
  { badge: 'bg-red-100 text-danger',        chip: 'bg-red-50 text-danger',         active: 'bg-danger text-white shadow-card' },
  { badge: 'bg-peach/30 text-rose',         chip: 'bg-peach/20 text-rose',         active: 'bg-peach text-white shadow-card' },
]
function topicStyle(value: string | null) {
  const i = value ? TOPICS.findIndex(tp => tp.value === value) : -1
  return TOPIC_STYLES[(i < 0 ? 0 : i) % TOPIC_STYLES.length]
}

// "2 kun oldin" style. Uses the platform's Intl.RelativeTimeFormat when it can
// actually format the locale (great for en/ru/ko plurals); falls back to the
// invariant dictionary strings otherwise (notably Uzbek, which Intl often lacks).
const REL_STEPS: { limit: number; div: number; unit: Intl.RelativeTimeFormatUnit; key: string }[] = [
  { limit: 3600,     div: 60,       unit: 'minute', key: 'comm.relMin' },
  { limit: 86400,    div: 3600,     unit: 'hour',   key: 'comm.relHour' },
  { limit: 604800,   div: 86400,    unit: 'day',    key: 'comm.relDay' },
  { limit: 2592000,  div: 604800,   unit: 'week',   key: 'comm.relWeek' },
  { limit: 31536000, div: 2592000,  unit: 'month',  key: 'comm.relMonth' },
  { limit: Infinity, div: 31536000, unit: 'year',   key: 'comm.relYear' },
]
function relativeTime(dateStr: string, locale: Locale, t: TFunc): string {
  const sec = Math.round((Date.now() - new Date(dateStr).getTime()) / 1000)
  const abs = Math.abs(sec)
  if (abs < 60) return t('comm.relNow')
  const step = REL_STEPS.find(s => abs < s.limit)!
  const value = Math.round(abs / step.div)
  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    if (rtf.resolvedOptions().locale.startsWith(locale)) return rtf.format(-value, step.unit)
  } catch { /* locale unsupported → dict fallback */ }
  return t(step.key, { n: value })
}

// A date that reads as relative time, with the exact date+time available on hover.
// Renders the absolute date on the server + first client paint (so no hydration
// mismatch), then swaps to relative once mounted.
function RelativeDate({ value, labelKey }: { value: string; labelKey: string }) {
  const t = useT()
  const locale = useLocale()
  const [rel, setRel] = useState<string | null>(null)
  useEffect(() => { setRel(relativeTime(value, locale, t)) }, [value, locale]) // eslint-disable-line react-hooks/exhaustive-deps
  return <span title={formatDate(value, true)}>{t(labelKey)}: {rel ?? formatDate(value)}</span>
}

// Lightweight, safe rich text for answers: **bold**, [label](https://…) and bare URLs.
// Builds React nodes (never dangerouslySetInnerHTML), so answer text can't inject markup.
// Newlines are preserved by the container's `whitespace-pre-line`.
const LINK_CLS = 'text-rose font-medium underline underline-offset-2 hover:text-roseDark break-words'
function renderRich(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|\[([^\]]+?)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)/g
  let last = 0, i = 0, m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      out.push(<strong key={i} className="font-semibold text-ink">{m[1]}</strong>)
    } else if (m[2] !== undefined) {
      out.push(<a key={i} href={m[3]} target="_blank" rel="noopener noreferrer" className={LINK_CLS}>{m[2]}</a>)
    } else {
      out.push(<a key={i} href={m[4]} target="_blank" rel="noopener noreferrer" className={LINK_CLS}>{m[4]}</a>)
    }
    last = re.lastIndex; i++
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// One answered question. Long answers are clamped to a few lines with a "See more"
// toggle so the list stays scannable; each card owns its own expand state.
function QACard({ qa, t }: { qa: QA; t: TFunc }) {
  const [expanded, setExpanded] = useState(false)
  const long = qa.answer.length > 220
  const style = topicStyle(qa.topic)
  return (
    <div className="bg-surface rounded-2xl shadow-card p-5">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {qa.topic && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${style.badge}`}>
            <Tag className="w-3 h-3" /> {t(`topic.${qa.topic}`)}
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          <User className="w-3.5 h-3.5" /> {qa.name || t('common.anonim')}
        </span>
      </div>
      <p className="font-semibold text-ink">{qa.question}</p>
      <div className="mt-3 pl-3 border-l-2 border-rose/40">
        <p className="text-xs font-semibold text-rose mb-0.5">{t('comm.answerLabel')}</p>
        <p className={`text-ink/90 whitespace-pre-line leading-relaxed ${long && !expanded ? 'line-clamp-4' : ''}`}>{renderRich(qa.answer)}</p>
        {long && (
          <button onClick={() => setExpanded(e => !e)}
            className="mt-1.5 text-xs font-semibold text-rose hover:text-roseDark transition">
            {expanded ? t('comm.seeLess') : t('comm.seeMore')}
          </button>
        )}
      </div>
      {/* Dates — bottom-right: when the question was asked, when it was answered.
          Relative ("2 kun oldin"); hover shows the exact date + time. */}
      {(qa.created_at || qa.answered_at) && (
        <div className="mt-3 flex flex-wrap justify-end gap-x-3 gap-y-0.5 text-[11px] text-muted">
          {qa.created_at && <RelativeDate value={qa.created_at} labelKey="comm.askedLabel" />}
          {qa.answered_at && <RelativeDate value={qa.answered_at} labelKey="comm.answeredLabel" />}
        </div>
      )}
    </div>
  )
}

export default function Community({ items }: { items: QA[] }) {
  const t = useT()
  const router = useRouter()
  const [ask, setAsk] = useState(false)
  const [filterTopic, setFilterTopic] = useState('')

  // Instagram deep link → /community?ask=1 opens the modal.
  useEffect(() => { if (router.query.ask) setAsk(true) }, [router.query.ask])

  // Ask form
  const [form, setForm] = useState({ name: '', topic: '', question: '' })
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/community` : 'cameliakorea.com/community'
  async function copyLink() {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard blocked */ }
  }

  async function submit() {
    setError('')
    if (form.question.trim().length < 5) { setError(t('comm.errShort')); return }
    setBusy(true)
    const res = await fetch('/api/community/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(j.error ?? 'Xatolik'); return }
    setSent(true); setForm({ name: '', topic: '', question: '' })
  }
  function closeAsk() { setAsk(false); setSent(false); setError(''); if (router.query.ask) router.replace('/community', undefined, { shallow: true }) }

  // Sort by when the question was answered (fall back to asked date).
  const [sort, setSort] = useState<'new' | 'old'>('new')
  const shown = useMemo(() => {
    const base = filterTopic ? items.filter(i => i.topic === filterTopic) : items
    const stamp = (q: QA) => new Date(q.answered_at ?? q.created_at ?? 0).getTime()
    return [...base].sort((a, b) => sort === 'new' ? stamp(b) - stamp(a) : stamp(a) - stamp(b))
  }, [items, filterTopic, sort])
  const usedTopics = TOPICS.filter(tp => items.some(i => i.topic === tp.value))

  // Pagination — the list can grow long, so show a page at a time.
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  // Switching filter or sort (or the page count shrinking) must never leave us on a dead page.
  useEffect(() => { setPage(1) }, [filterTopic, sort])
  const curPage = Math.min(page, totalPages)
  const paged = shown.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE)
  function goto(p: number) {
    setPage(Math.min(totalPages, Math.max(1, p)))
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <Head><title>{t('comm.metaTitle')}</title>
        <meta name="description" content={t('comm.metaDesc')} />
      </Head>
      <div className="min-h-screen bg-cream">
        <header className="sticky top-0 z-20 bg-cream/80 backdrop-blur border-b border-black/5">
          <div className="max-w-2xl mx-auto px-5 h-16 flex items-center gap-3">
            <Link href="/" className="text-muted hover:text-ink transition"><ArrowLeft className="w-5 h-5" /></Link>
            <h1 className="font-display font-bold text-ink text-lg">{t('nav.qa')}</h1>
            <div className="ml-auto"><LangSwitcher /></div>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-5 py-8">
          {/* Intro + CTA */}
          <div className="bg-gradient-to-br from-rose to-peach text-white rounded-3xl p-6 md:p-8 mb-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/3 translate-x-1/4" />
            <h2 className="font-display font-bold text-2xl md:text-3xl relative">{t('comm.heroTitle')}</h2>
            <p className="text-white/90 mt-2 relative max-w-md">{t('comm.heroBody')}</p>
            <button onClick={() => setAsk(true)}
              className="relative mt-5 inline-flex items-center gap-2 bg-white text-rose font-display font-bold px-6 py-3 rounded-full active:scale-95 transition">
              <MessageCircleQuestion className="w-5 h-5" /> {t('comm.ask')}
            </button>
          </div>

          {/* Topic filter */}
          {usedTopics.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              <button onClick={() => setFilterTopic('')}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${filterTopic === '' ? 'bg-gradient-to-br from-rose to-peach text-white shadow-rose' : 'bg-surface text-muted shadow-card hover:text-ink'}`}>{t('home.all')}</button>
              {usedTopics.map(tp => {
                const style = topicStyle(tp.value)
                return (
                  <button key={tp.value} onClick={() => setFilterTopic(tp.value)}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${filterTopic === tp.value ? style.active : `${style.chip} shadow-card hover:brightness-95`}`}>{t(`topic.${tp.value}`)}</button>
                )
              })}
            </div>
          )}

          {/* Sort toggle */}
          {shown.length > 1 && (
            <div className="flex justify-end mb-3">
              <button onClick={() => setSort(s => s === 'new' ? 'old' : 'new')}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink bg-surface shadow-card rounded-full px-4 py-1.5 active:scale-95 transition">
                <ArrowDownUp className="w-4 h-4" /> {sort === 'new' ? t('comm.sortNew') : t('comm.sortOld')}
              </button>
            </div>
          )}

          {/* Q&A list */}
          {shown.length === 0 ? (
            <div className="bg-surface rounded-2xl shadow-card p-10 text-center">
              <MessageCircleQuestion className="w-8 h-8 text-muted mx-auto mb-2" />
              <p className="text-muted">{t('comm.empty')}</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {paged.map(qa => <QACard key={qa.id} qa={qa} t={t} />)}
              </div>

              {/* Pagination — only when there's more than one page */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-2">
                  <button onClick={() => goto(curPage - 1)} disabled={curPage <= 1}
                    className="px-4 py-2 rounded-full text-sm font-semibold bg-surface text-ink shadow-card disabled:opacity-40 active:scale-95 transition">
                    {t('comm.prev')}
                  </button>
                  <span className="px-3 text-sm font-semibold text-muted tabular-nums">{t('comm.pageOf', { page: curPage, total: totalPages })}</span>
                  <button onClick={() => goto(curPage + 1)} disabled={curPage >= totalPages}
                    className="px-4 py-2 rounded-full text-sm font-semibold bg-surface text-ink shadow-card disabled:opacity-40 active:scale-95 transition">
                    {t('comm.next')}
                  </button>
                </div>
              )}
            </>
          )}
        </main>

        {/* Ask modal */}
        {ask && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={closeAsk} />
            <div className="relative bg-surface rounded-3xl shadow-card w-full max-w-md overflow-hidden max-h-[92vh] overflow-y-auto">
              {/* Cute gradient header */}
              <div className="relative bg-gradient-to-br from-rose via-peach to-lavender text-white px-6 pt-7 pb-10 text-center">
                <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/15 rounded-full" />
                <div className="absolute -bottom-8 -left-4 w-24 h-24 bg-white/10 rounded-full" />
                <button aria-label={t('common.close')} onClick={closeAsk} className="absolute top-4 right-4 text-white/80 hover:text-white transition z-10"><X className="w-5 h-5" /></button>
                <div className="text-5xl mb-1 relative">💌</div>
                <h3 className="font-display font-bold text-2xl relative">{t('comm.modalTitle')}</h3>
                <p className="text-white/90 text-sm mt-1 max-w-xs mx-auto relative">{t('comm.modalSub')}</p>
              </div>

              <div className="px-6 py-5 -mt-5 bg-surface rounded-t-3xl relative">
                {sent ? (
                  <div className="text-center py-4">
                    <div className="text-5xl mb-3">🌷</div>
                    <p className="font-display font-bold text-ink text-lg">{t('comm.thanks')}</p>
                    <p className="text-sm text-muted mt-1">{t('comm.answerHere')}</p>
                    <div className="mt-3 flex items-center gap-2 bg-cream rounded-xl pl-3 pr-1.5 py-1.5">
                      <span className="text-sm text-ink truncate flex-1 text-left">{shareUrl}</span>
                      <button onClick={copyLink}
                        className={`flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-lg active:scale-95 transition flex-shrink-0 ${copied ? 'text-success' : 'text-white bg-gradient-to-br from-rose to-peach'}`}>
                        {copied ? <><Check className="w-4 h-4" /> {t('order.copied')}</> : <><Copy className="w-4 h-4" /> {t('comm.copy')}</>}
                      </button>
                    </div>
                    <button onClick={closeAsk} className="mt-4 bg-cream text-ink font-semibold px-6 py-2.5 rounded-full active:scale-95 transition">{t('comm.viewQA')}</button>
                  </div>
                ) : (
                  <>
                    {/* What you can write */}
                    <div className="bg-cream/70 rounded-2xl p-4 mb-4">
                      <p className="text-sm font-semibold text-ink mb-1">{t('comm.whatTitle')}</p>
                      <p className="text-xs text-muted leading-relaxed">{t('comm.whatBody')}</p>
                    </div>

                    {/* One-tap starters */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {EXAMPLES.map((ex, i) => (
                        <button key={i} type="button" onClick={() => setForm(f => ({ ...f, question: t(ex.qKey), topic: ex.topic }))}
                          className="text-xs font-medium bg-white text-rose border border-rose/20 rounded-full px-3 py-1.5 hover:bg-rose/5 active:scale-95 transition">
                          {t(ex.chipKey)}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <textarea value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value.slice(0, 1000) }))} rows={4}
                          placeholder={t('comm.qPlaceholder')} autoFocus
                          className="w-full bg-cream text-ink rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose border-2 border-transparent transition resize-none" />
                        <p className="text-[11px] text-muted text-right mt-1">{form.question.length}/1000</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          placeholder={t('comm.namePh')}
                          className="bg-cream text-ink rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose border-2 border-transparent transition" />
                        <select value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                          className="bg-cream text-ink rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose border-2 border-transparent transition">
                          <option value="">{t('comm.topicPh')}</option>
                          {TOPICS.map(tp => <option key={tp.value} value={tp.value}>{t(`topic.${tp.value}`)}</option>)}
                        </select>
                      </div>
                      {error && <p className="text-danger text-sm">{error}</p>}
                      <button onClick={submit} disabled={busy}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-br from-rose to-peach text-white font-display font-bold py-3.5 rounded-full shadow-rose active:scale-95 transition disabled:opacity-50">
                        {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('common.sending')}</> : <><Send className="w-5 h-5" /> {t('comm.send')}</>}
                      </button>
                      <p className="text-[11px] text-muted text-center">{t('comm.anonNote')}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export const getServerSideProps: GetServerSideProps = async () => {
  let items: QA[] = []
  try {
    const pub = createPublicClient()
    const { data } = await pub.from('community_questions')
      .select('id, name, question, answer, topic, created_at, answered_at')
      .eq('status', 'answered')
      .order('answered_at', { ascending: false })
    items = (data as QA[]) ?? []
  } catch { /* table may not exist yet → empty state */ }
  return { props: { items } }
}
