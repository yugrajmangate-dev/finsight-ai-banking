import { useState } from 'react'
import { Bell, CheckCheck, HandCoins, Info, KeyRound, ShieldAlert, ShieldCheck, Wallet } from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { useApi } from '../../hooks'
import { Amount, Badge, Card, Empty, ErrorBox, Field, Loading, PageHeader, Spinner, useToast } from '../../components/ui'
import { date, dateTime, initials } from '../../format'

const KIND = { security: [ShieldAlert, 'bg-rose-50 text-rose-600'], loan: [HandCoins, 'bg-amber-50 text-amber-600'], credit: [Wallet, 'bg-emerald-50 text-emerald-600'], info: [Info, 'bg-brand-50 text-brand-600'] }

export function Notifications() {
  const { data, loading, error, reload } = useApi('/notifications')
  const toast = useToast()
  const readAll = async () => {
    await api.post('/notifications/read-all')
    toast('success', 'All notifications marked as read')
    reload()
  }
  return (
    <>
      <PageHeader title="Notifications" subtitle="Alerts, loan updates and account activity"
        actions={<button className="btn-secondary" onClick={readAll}><CheckCheck size={16} /> Mark all read</button>} />
      <Card bodyClass="p-0">
        {loading && !data ? <Loading /> : error ? <ErrorBox error={error} onRetry={reload} /> : data?.length ? (
          <ul className="divide-y divide-slate-100">
            {data.map((n) => {
              const [I, c] = KIND[n.kind] || KIND.info
              return (
                <li key={n.id} className={`flex gap-4 px-5 py-4 ${n.is_read ? '' : 'bg-brand-50/40'}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${c}`}><I size={17} /></span>
                  <div className="flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">{n.title}{!n.is_read && <span className="h-2 w-2 rounded-full bg-brand-500" />}</p>
                    <p className="mt-0.5 text-sm text-ink-500">{n.body}</p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-500">{dateTime(n.created_at)}</span>
                </li>
              )
            })}
          </ul>
        ) : <Empty title="You're all caught up" icon={Bell} />}
      </Card>
    </>
  )
}

export function SecurityAlerts() {
  const { data, loading, error, reload } = useApi('/ai/alerts')
  return (
    <>
      <PageHeader title="Security alerts" subtitle="Transactions our AI engine flagged as unusual. Alerts are reviewed by the bank and are not confirmed fraud." />
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} onRetry={reload} /> : data?.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((a) => (
            <Card key={a.id} title={a.transaction.description} subtitle={`${a.transaction.reference} · ${dateTime(a.created_at)}`} action={<Badge value={a.severity}>{a.severity} risk</Badge>}>
              <div className="flex items-center justify-between">
                <Amount txn={a.transaction} className="text-xl" />
                <div className="text-right"><p className="text-[11px] text-ink-500">Risk score</p><p className="text-lg font-semibold">{a.risk_score}/100</p></div>
              </div>
              <ul className="mt-4 space-y-1.5 text-xs text-ink-700">
                {a.reasons.map((r) => <li key={r} className="flex gap-2"><ShieldAlert size={13} className="mt-0.5 shrink-0 text-amber-600" />{r}</li>)}
              </ul>
              <p className="mt-4 text-xs text-ink-500">Review status: <Badge value={a.status} /></p>
            </Card>
          ))}
        </div>
      ) : <Card><Empty title="No unusual activity" text="Our AI engine continuously monitors your transactions." icon={ShieldCheck} /></Card>}
    </>
  )
}

export function Profile() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const [f, setF] = useState({ full_name: user.full_name, phone: user.phone || '', address: user.profile?.address || '', city: user.profile?.city || '', occupation: user.profile?.occupation || '' })
  const [pw, setPw] = useState({ current_password: '', new_password: '' })
  const [busy, setBusy] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy('profile')
    try {
      const r = await api.patch('/auth/me', f)
      setUser(r.data)
      toast('success', 'Profile updated')
    } catch (err) { toast('error', err.message) } finally { setBusy('') }
  }
  const changePw = async (e) => {
    e.preventDefault()
    setBusy('pw')
    try {
      await api.post('/auth/change-password', pw)
      setPw({ current_password: '', new_password: '' })
      toast('success', 'Password changed. Other sessions were signed out.')
    } catch (err) { toast('error', err.message) } finally { setBusy('') }
  }

  return (
    <>
      <PageHeader title="Profile & security" />
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <Card>
          <div className="flex flex-col items-center text-center">
            <span className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-navy-900 to-brand-600 text-2xl font-semibold text-white">{initials(user.full_name)}</span>
            <p className="mt-3 text-lg font-semibold">{user.full_name}</p>
            <p className="text-sm text-ink-500">{user.email}</p>
            <div className="mt-3"><Badge value="active">Verified customer</Badge></div>
            <dl className="mt-6 w-full space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Customer ID</dt><dd className="font-mono">FS{String(user.id).padStart(6, '0')}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Member since</dt><dd>{date(user.created_at)}</dd></div>
              {user.profile?.monthly_income > 0 && <div className="flex justify-between"><dt className="text-ink-500">Declared income</dt><dd>₹{user.profile.monthly_income.toLocaleString('en-IN')}/mo</dd></div>}
            </dl>
          </div>
        </Card>
        <div className="space-y-6">
          <Card title="Personal information">
            <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name"><input className="input" value={f.full_name} onChange={set('full_name')} /></Field>
              <Field label="Mobile"><input className="input" maxLength={10} value={f.phone} onChange={set('phone')} /></Field>
              <Field label="Address"><input className="input" value={f.address} onChange={set('address')} /></Field>
              <Field label="City"><input className="input" value={f.city} onChange={set('city')} /></Field>
              <Field label="Occupation"><input className="input" value={f.occupation} onChange={set('occupation')} /></Field>
              <div className="flex items-end"><button className="btn-primary" disabled={busy === 'profile'}>{busy === 'profile' && <Spinner />} Save changes</button></div>
            </form>
          </Card>
          <Card title="Change password" subtitle="Changing your password signs out all other sessions">
            <form onSubmit={changePw} className="grid gap-4 sm:grid-cols-3">
              <Field label="Current password"><input type="password" className="input" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
              <Field label="New password" hint="8+ chars, letters & numbers"><input type="password" className="input" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
              <div className="flex items-start pt-6"><button className="btn-secondary" disabled={busy === 'pw'}>{busy === 'pw' ? <Spinner /> : <KeyRound size={16} />} Update password</button></div>
            </form>
          </Card>
        </div>
      </div>
    </>
  )
}
