import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BrainCircuit, Eye, EyeOff, LineChart, Lock, ShieldCheck, UserCog, UserRound } from 'lucide-react'
import { useAuth } from '../auth'
import { Field, Spinner, useToast } from '../components/ui'

function Shell({ children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-navy-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-brand-500">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round"><path d="M6 18V6h10M6 12h8" /></svg>
          </span>
          <span className="text-lg font-semibold">FinSight Bank</span>
        </div>
        <div className="relative max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-300">AI-Powered Finance & Banking</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight">Smarter banking with real-time intelligence.</h1>
          <p className="mt-4 text-slate-300">
            Manage accounts, move money, apply for loans and let machine learning watch for unusual activity — all in one
            secure dashboard.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              [ShieldCheck, 'Fraud detection', 'Hybrid rules + Isolation Forest'],
              [LineChart, 'Spending insights', 'Budgets & forecasts'],
              [BrainCircuit, 'AI assistant', 'Answers from your data'],
            ].map(([I, t, s]) => (
              <div key={t} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <I size={20} className="text-emerald-300" />
                <p className="mt-3 text-sm font-medium">{t}</p>
                <p className="mt-1 text-xs text-slate-400">{s}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-slate-500">Academic project · Simulated money only · Not a real bank</p>
      </div>
      <div className="flex items-center justify-center bg-white px-5 py-10">{children}</div>
    </div>
  )
}

export function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const toast = useToast()
  const [form, setForm] = useState({ email: '', password: '' })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e, creds = form) => {
    e?.preventDefault()
    setBusy(true)
    setError('')
    try {
      const u = await login(creds.email, creds.password)
      toast('success', `Signed in as ${u.full_name}`)
      nav(loc.state?.from && loc.state.from.startsWith(u.role === 'admin' ? '/admin' : '/app') ? loc.state.from : u.role === 'admin' ? '/admin' : '/app')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const demo = (email, password) => {
    setForm({ email, password })
    submit(null, { email, password })
  }

  return (
    <Shell>
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
        <p className="mt-1 text-sm text-ink-500">Access your FinSight dashboard</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <Field label="Email address">
            <input className="input" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
          </Field>
          <Field label="Password">
            <div className="relative">
              <input className="input pr-10" type={show ? 'text' : 'password'} autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-500" aria-label="Toggle password">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button className="btn-primary w-full !py-2.5" disabled={busy}>
            {busy ? <Spinner /> : <Lock size={16} />} Sign in securely
          </button>
        </form>
        <div className="mt-8">
          <p className="mb-3 text-center text-xs font-medium uppercase tracking-wider text-ink-500">Demo access</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => demo('priya@finsight.demo', 'Demo@123')} className="rounded-xl border border-slate-200 p-3 text-left transition hover:border-brand-500 hover:bg-brand-50">
              <UserRound size={18} className="text-brand-600" />
              <p className="mt-2 text-sm font-medium">Customer</p>
              <p className="text-[11px] text-ink-500">priya@finsight.demo</p>
            </button>
            <button onClick={() => demo('admin@finsight.demo', 'Admin@123')} className="rounded-xl border border-slate-200 p-3 text-left transition hover:border-brand-500 hover:bg-brand-50">
              <UserCog size={18} className="text-navy-800" />
              <p className="mt-2 text-sm font-medium">Administrator</p>
              <p className="text-[11px] text-ink-500">admin@finsight.demo</p>
            </button>
          </div>
        </div>
        <p className="mt-8 text-center text-sm text-ink-500">
          New to FinSight? <Link to="/register" className="font-medium text-brand-600 hover:underline">Open an account</Link>
        </p>
      </div>
    </Shell>
  )
}

export function Register() {
  const { register } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [f, setF] = useState({ full_name: '', email: '', phone: '', password: '', confirm: '', account_type: 'savings', city: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const validate = () => {
    const e = {}
    if (f.full_name.trim().length < 2) e.full_name = 'Enter your full name'
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email'
    if (!/^[6-9]\d{9}$/.test(f.phone)) e.phone = '10-digit mobile number starting with 6-9'
    if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = 'Min 8 characters with letters and numbers'
    if (f.password !== f.confirm) e.confirm = 'Passwords do not match'
    setErrors(e)
    return !Object.keys(e).length
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setBusy(true)
    try {
      const { confirm, ...body } = f
      await register(body)
      toast('success', 'Welcome to FinSight! Your account is ready.')
      nav('/app')
    } catch (err) {
      setErrors({ form: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <form onSubmit={submit} className="w-full max-w-md space-y-4" noValidate>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Open your account</h2>
          <p className="mt-1 text-sm text-ink-500">Takes less than a minute. Demo money only.</p>
        </div>
        <Field label="Full name" error={errors.full_name}><input className="input" value={f.full_name} onChange={set('full_name')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" error={errors.email}><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Mobile" error={errors.phone}><input className="input" inputMode="numeric" maxLength={10} value={f.phone} onChange={set('phone')} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City"><input className="input" value={f.city} onChange={set('city')} /></Field>
          <Field label="Account type">
            <select className="input" value={f.account_type} onChange={set('account_type')}>
              <option value="savings">Savings account</option>
              <option value="current">Current account</option>
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" error={errors.password}><input className="input" type="password" value={f.password} onChange={set('password')} /></Field>
          <Field label="Confirm password" error={errors.confirm}><input className="input" type="password" value={f.confirm} onChange={set('confirm')} /></Field>
        </div>
        {errors.form && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errors.form}</p>}
        <button className="btn-primary w-full !py-2.5" disabled={busy}>{busy && <Spinner />} Create account</button>
        <p className="text-center text-sm text-ink-500">
          Already a customer? <Link to="/login" className="font-medium text-brand-600 hover:underline">Sign in</Link>
        </p>
      </form>
    </Shell>
  )
}
