import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CheckCircle2, ShieldCheck, UserCheck } from 'lucide-react'
import { api, newKey } from '../../api'
import { useApi, useDebounced } from '../../hooks'
import { Card, Field, Modal, PageHeader, Spinner, useToast } from '../../components/ui'
import { money } from '../../format'

const TABS = [
  ['transfer', 'Transfer', ArrowLeftRight],
  ['deposit', 'Deposit', ArrowDownLeft],
  ['withdraw', 'Withdraw', ArrowUpRight],
]
const SPEND_CATS = ['Groceries', 'Dining', 'Shopping', 'Utilities', 'Transport', 'Entertainment', 'Health', 'Education', 'Travel', 'Housing', 'Other']

function validAmount(v) {
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return 'Enter a valid amount (max 2 decimals)'
  if (Number(v) <= 0) return 'Amount must be greater than zero'
  if (Number(v) > 1000000) return 'Max ₹10,00,000 per transaction'
  return null
}

export default function Payments() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'transfer'
  const { data: accounts, reload } = useApi('/accounts')
  const active = useMemo(() => (accounts || []).filter((a) => a.status === 'active'), [accounts])
  const [form, setForm] = useState({ account_id: '', to: '', amount: '', description: '', category: '' })
  const [errors, setErrors] = useState({})
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [payee, setPayee] = useState(null)
  const [key, setKey] = useState(newKey())
  const toast = useToast()
  const to = useDebounced(form.to, 400)
  const src = active.find((a) => String(a.id) === String(form.account_id)) || active[0]

  useEffect(() => {
    setPayee(null)
    if (tab !== 'transfer' || !/^\d{12}$/.test(to)) return
    api.get('/transfers/lookup', { account_number: to }).then((r) => setPayee(r.data)).catch((e) => setPayee({ error: e.message }))
  }, [to, tab])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const review = (e) => {
    e.preventDefault()
    const errs = {}
    const amtErr = validAmount(form.amount)
    if (amtErr) errs.amount = amtErr
    if (!src) errs.account = 'No active account available'
    if (tab !== 'deposit' && src && Number(form.amount) > src.balance) errs.amount = `Insufficient balance (${money(src.balance)} available)`
    if (tab === 'transfer') {
      if (!/^\d{12}$/.test(form.to)) errs.to = 'Enter a 12-digit account number'
      else if (payee?.error) errs.to = payee.error
      else if (src && form.to === src.account_number) errs.to = 'Choose a different account'
    }
    setErrors(errs)
    if (!Object.keys(errs).length) setConfirm(true)
  }

  const submit = async () => {
    setBusy(true)
    try {
      const body = { amount: form.amount, description: form.description, category: form.category || null }
      let r
      if (tab === 'transfer') r = await api.post('/transfers', { ...body, from_account_id: src.id, to_account_number: form.to }, { idempotent: key })
      else r = await api.post(`/accounts/${src.id}/${tab}`, body, { idempotent: key })
      setReceipt({ ...r.data, payee })
      toast('success', `${tab === 'deposit' ? 'Deposit' : tab === 'withdraw' ? 'Withdrawal' : 'Transfer'} of ${money(r.data.amount)} successful`)
      setForm({ ...form, to: '', amount: '', description: '', category: '' })
      setKey(newKey())
      reload()
    } catch (e) {
      toast('error', e.message)
    } finally {
      setBusy(false)
      setConfirm(false)
    }
  }

  return (
    <>
      <PageHeader title="Payments" subtitle="Move money instantly between FinSight accounts" />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card bodyClass="p-0">
          <div className="flex border-b border-slate-100">
            {TABS.map(([v, l, I]) => (
              <button key={v} onClick={() => { setParams({ tab: v }); setErrors({}); setReceipt(null) }}
                className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-3.5 text-sm font-medium transition ${tab === v ? 'border-brand-600 text-brand-600' : 'border-transparent text-ink-500 hover:text-ink-900'}`}>
                <I size={16} /> {l}
              </button>
            ))}
          </div>
          <form onSubmit={review} className="space-y-5 p-6" noValidate>
            <Field label={tab === 'deposit' ? 'Deposit to' : 'Pay from'} error={errors.account}>
              <select className="input" value={src?.id || ''} onChange={set('account_id')}>
                {active.map((a) => <option key={a.id} value={a.id}>{a.type.toUpperCase()} · {a.masked_number} · {money(a.balance)}</option>)}
              </select>
            </Field>
            {tab === 'transfer' && (
              <Field label="Beneficiary account number" error={errors.to} hint="Try another demo customer's account, e.g. from the Accounts page">
                <input className="input font-mono" inputMode="numeric" maxLength={12} placeholder="12-digit account number" value={form.to} onChange={set('to')} />
                {payee && !payee.error && (
                  <span className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    <UserCheck size={14} /> Verified: <b>{payee.name}</b> · {payee.masked_number} {payee.own_account && '(your account)'}
                  </span>
                )}
              </Field>
            )}
            <Field label="Amount (₹)" error={errors.amount}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500">₹</span>
                <input className="input pl-7 text-lg font-semibold" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={set('amount')} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {[500, 1000, 5000, 10000].map((v) => (
                  <button type="button" key={v} onClick={() => setForm({ ...form, amount: String(v) })} className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:border-brand-500 hover:text-brand-600">{money(v).replace('.00', '')}</button>
                ))}
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Remarks (optional)"><input className="input" maxLength={200} value={form.description} onChange={set('description')} placeholder={tab === 'transfer' ? 'e.g. Rent share' : 'e.g. Swiggy order'} /></Field>
              {tab !== 'deposit' && (
                <Field label="Category" hint="Leave blank to let AI auto-categorise">
                  <select className="input" value={form.category} onChange={set('category')}>
                    <option value="">Auto-detect (AI)</option>
                    {SPEND_CATS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <button className="btn-primary w-full !py-3">Review {tab}</button>
          </form>
        </Card>

        <div className="space-y-4">
          {receipt ? (
            <Card>
              <div className="text-center">
                <CheckCircle2 size={44} className="mx-auto text-emerald-500" />
                <p className="mt-3 text-lg font-semibold">{money(receipt.amount)}</p>
                <p className="text-sm text-ink-500">Transaction successful</p>
              </div>
              <dl className="mt-5 space-y-2 border-t border-dashed border-slate-200 pt-4 text-sm">
                {[['Reference', receipt.reference], ['Account', receipt.account_number], ['Category', receipt.category],
                  ['Balance after', money(receipt.balance_after)], ['Time', new Date(receipt.created_at).toLocaleString('en-IN')]].map(([k, v]) => (
                  <div key={k} className="flex justify-between"><dt className="text-ink-500">{k}</dt><dd className="font-medium">{v}</dd></div>
                ))}
              </dl>
            </Card>
          ) : (
            <Card title="Secure payments">
              <ul className="space-y-3 text-sm text-ink-700">
                {['Balances are validated on the server in a single atomic database transaction',
                  'Duplicate submissions are blocked with idempotency keys',
                  'Every debit is scored by the AI fraud engine in real time',
                  'Transfers either fully complete or fully roll back'].map((t) => (
                  <li key={t} className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />{t}</li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Your accounts" bodyClass="p-0">
            <ul className="divide-y divide-slate-100">
              {(accounts || []).map((a) => (
                <li key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span><span className="capitalize">{a.type}</span> <span className="font-mono text-xs text-ink-500">{a.account_number}</span></span>
                  <b>{money(a.balance)}</b>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title={`Confirm ${tab}`}
        footer={<><button className="btn-secondary" onClick={() => setConfirm(false)}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy}>{busy && <Spinner />} Confirm & {tab}</button></>}>
        <div className="rounded-xl bg-slate-50 p-4 text-center">
          <p className="text-xs uppercase tracking-wider text-ink-500">Amount</p>
          <p className="text-3xl font-semibold">{money(Number(form.amount))}</p>
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-ink-500">{tab === 'deposit' ? 'To' : 'From'}</dt><dd>{src?.masked_number}</dd></div>
          {tab === 'transfer' && <div className="flex justify-between"><dt className="text-ink-500">To</dt><dd>{payee?.name} · {payee?.masked_number}</dd></div>}
          {tab !== 'deposit' && <div className="flex justify-between"><dt className="text-ink-500">Balance after</dt><dd>{money((src?.balance || 0) - Number(form.amount))}</dd></div>}
          {form.description && <div className="flex justify-between"><dt className="text-ink-500">Remarks</dt><dd>{form.description}</dd></div>}
        </dl>
      </Modal>
    </>
  )
}
