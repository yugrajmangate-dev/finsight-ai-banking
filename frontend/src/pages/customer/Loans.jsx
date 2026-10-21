import { useEffect, useState } from 'react'
import { Calculator, CheckCircle2, Circle, Gauge, HandCoins, Info, XCircle } from 'lucide-react'
import { api } from '../../api'
import { useApi, useDebounced } from '../../hooks'
import { Badge, Card, Empty, Field, Loading, PageHeader, ProgressBar, Spinner, useToast } from '../../components/ui'
import { date, dateTime, money } from '../../format'

const TYPES = [['personal', 'Personal', 11.5], ['home', 'Home', 8.6], ['car', 'Car', 9.2], ['education', 'Education', 9.8], ['business', 'Business', 12.5]]

export function Timeline({ history }) {
  return (
    <ol className="relative ml-2 space-y-4 border-l border-slate-200 pl-5">
      {history.map((h, i) => {
        const I = h.to === 'approved' ? CheckCircle2 : h.to === 'rejected' ? XCircle : Circle
        const c = h.to === 'approved' ? 'text-emerald-500' : h.to === 'rejected' ? 'text-rose-500' : 'text-amber-500'
        return (
          <li key={i}>
            <I size={16} className={`absolute -left-2 bg-white ${c}`} />
            <p className="text-sm font-medium capitalize">{h.to}</p>
            <p className="text-xs text-ink-500">{dateTime(h.at)} · {h.comment}</p>
          </li>
        )
      })}
    </ol>
  )
}

export function ScoreGauge({ score, band }) {
  const color = score >= 75 ? '#10B981' : score >= 55 ? '#F59E0B' : '#EF4444'
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-20 w-20">
        <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#EEF2F7" strokeWidth="3.5" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3.5" strokeDasharray={`${score} 100`} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-lg font-semibold">{score}</span>
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color }}>{band || (score >= 75 ? 'Strong' : score >= 55 ? 'Fair' : 'Weak')} eligibility</p>
        <p className="text-xs text-ink-500">Educational estimate only</p>
      </div>
    </div>
  )
}

export default function Loans() {
  const { data: accounts } = useApi('/accounts')
  const loans = useApi('/loans')
  const toast = useToast()
  const [f, setF] = useState({ loan_type: 'personal', amount: '200000', term_months: '24', purpose: '', monthly_income: '75000', employment_type: 'salaried', account_id: '' })
  const [est, setEst] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const debounced = useDebounced(f, 500)
  const accId = f.account_id || accounts?.find((a) => a.status === 'active')?.id
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  useEffect(() => {
    if (!accId || !(Number(debounced.amount) > 0) || !(Number(debounced.monthly_income) > 0)) return
    api.post('/loans/estimate', { ...debounced, purpose: debounced.purpose.length >= 5 ? debounced.purpose : 'estimate', account_id: accId, term_months: Number(debounced.term_months) })
      .then((r) => setEst(r.data)).catch(() => setEst(null))
  }, [debounced, accId])

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (f.purpose.trim().length < 5) return setErr('Please describe the purpose (min 5 characters)')
    setBusy(true)
    try {
      await api.post('/loans', { ...f, account_id: accId, term_months: Number(f.term_months) })
      toast('success', 'Loan application submitted for review')
      setF({ ...f, purpose: '' })
      loans.reload()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Loans" subtitle="Apply for a loan and track your application status" />
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <Card title="New loan application" subtitle="Live EMI and eligibility estimate update as you type">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {TYPES.map(([v, l, r]) => (
                <button type="button" key={v} onClick={() => setF({ ...f, loan_type: v })} className={`rounded-xl border p-3 text-left transition ${f.loan_type === v ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <p className="text-sm font-medium">{l}</p><p className="text-[11px] text-ink-500">{r}% p.a.</p>
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Loan amount (₹)"><input className="input" inputMode="decimal" value={f.amount} onChange={set('amount')} /></Field>
              <Field label={`Tenure: ${f.term_months} months`}>
                <input type="range" min="6" max="360" step="6" value={f.term_months} onChange={set('term_months')} className="mt-2 w-full accent-brand-600" />
              </Field>
              <Field label="Monthly income (₹)"><input className="input" inputMode="decimal" value={f.monthly_income} onChange={set('monthly_income')} /></Field>
              <Field label="Employment type">
                <select className="input" value={f.employment_type} onChange={set('employment_type')}>
                  <option value="salaried">Salaried</option><option value="self_employed">Self-employed</option><option value="student">Student</option><option value="other">Other</option>
                </select>
              </Field>
              <Field label="Credit to account">
                <select className="input" value={accId || ''} onChange={set('account_id')}>
                  {(accounts || []).filter((a) => a.status === 'active').map((a) => <option key={a.id} value={a.id}>{a.type} · {a.masked_number}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Purpose of loan"><textarea className="input" rows={3} maxLength={300} value={f.purpose} onChange={set('purpose')} placeholder="e.g. Home renovation and furniture" /></Field>
            {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
            <button className="btn-primary w-full !py-2.5" disabled={busy}>{busy ? <Spinner /> : <HandCoins size={16} />} Submit application</button>
          </form>
        </Card>
        <div className="space-y-4">
          <Card title="AI eligibility estimate" action={<Gauge size={16} className="text-ink-500" />}>
            {est ? (
              <>
                <ScoreGauge score={est.score} band={est.band} />
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-center">
                  <div><p className="text-[11px] text-ink-500">Monthly EMI</p><p className="font-semibold">{money(est.emi)}</p></div>
                  <div><p className="text-[11px] text-ink-500">Interest rate</p><p className="font-semibold">{est.interest_rate}% p.a.</p></div>
                  <div><p className="text-[11px] text-ink-500">Total payable</p><p className="font-semibold">{money(est.emi * Number(f.term_months))}</p></div>
                  <div><p className="text-[11px] text-ink-500">Total interest</p><p className="font-semibold">{money(est.emi * Number(f.term_months) - Number(f.amount))}</p></div>
                </div>
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-500">Scoring factors</p>
                <ul className="mt-2 space-y-1.5 text-xs text-ink-700">
                  {est.reasons.map((r) => <li key={r} className="flex gap-2"><Calculator size={13} className="mt-0.5 shrink-0 text-brand-600" />{r}</li>)}
                </ul>
                <p className="mt-4 flex gap-2 rounded-lg bg-amber-50 p-2.5 text-[11px] text-amber-800"><Info size={14} className="shrink-0" />{est.disclaimer}</p>
              </>
            ) : <Empty title="Enter loan details" text="Your estimate appears here." icon={Calculator} />}
          </Card>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold">My applications</h2>
      {loans.loading && !loans.data ? <Loading /> : loans.data?.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {loans.data.map((l) => (
            <Card key={l.id} title={<span className="capitalize">{l.loan_type} loan · #{l.id}</span>} subtitle={`Applied ${date(l.created_at)} · ${l.account}`} action={<Badge value={l.status} />}>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-[11px] text-ink-500">Amount</p><p className="font-semibold">{money(l.amount)}</p></div>
                <div><p className="text-[11px] text-ink-500">Tenure</p><p className="font-semibold">{l.term_months} mo</p></div>
                <div><p className="text-[11px] text-ink-500">EMI</p><p className="font-semibold">{money(l.emi)}</p></div>
              </div>
              <p className="mt-3 text-xs text-ink-500">{l.purpose}</p>
              <div className="mt-3 flex items-center gap-3 text-xs"><span className="text-ink-500">Eligibility</span><ProgressBar value={l.eligibility_score} color={l.eligibility_score >= 75 ? '#10B981' : l.eligibility_score >= 55 ? '#F59E0B' : '#EF4444'} /><b>{l.eligibility_score}</b></div>
              <div className="mt-4"><Timeline history={l.history} /></div>
            </Card>
          ))}
        </div>
      ) : <Card><Empty title="No loan applications yet" /></Card>}
    </>
  )
}
