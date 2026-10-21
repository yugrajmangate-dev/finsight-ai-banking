import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Inbox, Loader2, X, XCircle } from 'lucide-react'
import { CREDIT_TYPES, TXN_LABEL, catColor, dateTime, money } from '../format'

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, subtitle, action, children, className = '', bodyClass = 'p-5' }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

const TONES = {
  blue: 'bg-brand-50 text-brand-600', green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600', violet: 'bg-violet-50 text-violet-600', slate: 'bg-slate-100 text-slate-600',
  cyan: 'bg-cyan-50 text-cyan-600',
}

export function Stat({ label, value, icon: Icon, tone = 'blue', hint, trend, loading }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
        {Icon && (
          <span className={`grid h-9 w-9 place-items-center rounded-lg ${TONES[tone]}`}>
            <Icon size={18} />
          </span>
        )}
      </div>
      {loading ? (
        <div className="mt-3 h-7 w-32 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">{value}</p>
      )}
      {(hint || trend) && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-500">
          {trend}
          {hint}
        </p>
      )}
    </div>
  )
}

const BADGES = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', reviewed: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20', open: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  frozen: 'bg-sky-50 text-sky-700 ring-sky-600/20', medium: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-600/20', failed: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  high: 'bg-rose-50 text-rose-700 ring-rose-600/20', escalated: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  closed: 'bg-slate-100 text-slate-600 ring-slate-500/20', dismissed: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  low: 'bg-yellow-50 text-yellow-800 ring-yellow-600/20', inactive: 'bg-slate-100 text-slate-600 ring-slate-500/20',
}

export function Badge({ value, children }) {
  const v = (value || '').toLowerCase()
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset ${BADGES[v] || BADGES.closed}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {children || v}
    </span>
  )
}

export function CategoryPill({ category }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-700">
      <span className="h-2 w-2 rounded-full" style={{ background: catColor(category) }} />
      {category}
    </span>
  )
}

export function Amount({ txn, className = '' }) {
  const credit = CREDIT_TYPES.includes(txn.type)
  return (
    <span className={`font-medium tabular-nums ${credit ? 'text-emerald-600' : 'text-ink-900'} ${className}`}>
      {credit ? '+' : '−'}
      {money(txn.amount)}
    </span>
  )
}

export function Spinner({ className = '' }) {
  return <Loader2 className={`animate-spin ${className}`} size={18} />
}

export function Loading({ rows = 4 }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
      ))}
    </div>
  )
}

export function Empty({ title = 'Nothing here yet', text, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
        <Icon size={22} />
      </span>
      <p className="mt-3 text-sm font-medium text-ink-900">{title}</p>
      {text && <p className="mt-1 max-w-sm text-xs text-ink-500">{text}</p>}
    </div>
  )
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="m-4 flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      <span className="flex items-center gap-2">
        <XCircle size={16} /> {error.message}
      </span>
      {onRetry && (
        <button className="font-medium underline" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.pages <= 1) return null
  const from = (meta.page - 1) * meta.size + 1
  const to = Math.min(meta.total, meta.page * meta.size)
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-ink-500">
      <span>
        Showing <b className="text-ink-900">{from}–{to}</b> of <b className="text-ink-900">{meta.total}</b>
      </span>
      <div className="flex items-center gap-1">
        <button className="btn-secondary !px-2 !py-1" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label="Previous page">
          <ChevronLeft size={16} />
        </button>
        <span className="px-2">
          Page {meta.page} / {meta.pages}
        </span>
        <button className="btn-secondary !px-2 !py-1" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)} aria-label="Next page">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

export function Table({ columns, rows, loading, error, onRetry, empty, onRowClick, rowKey = 'id' }) {
  if (loading && !rows) return <Loading rows={6} />
  if (error) return <ErrorBox error={error} onRetry={onRetry} />
  if (!rows?.length) return <Empty {...(empty || {})} />
  return (
    <div className={`scrollbar-thin overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
      <table className="min-w-full divide-y divide-slate-100">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`th ${c.right ? 'text-right' : ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((r) => (
            <tr key={r[rowKey]} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : 'hover:bg-slate-50/60'}>
              {columns.map((c) => (
                <td key={c.key} className={`td ${c.right ? 'text-right' : ''} ${c.className || ''}`}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TxnColumns({ owner = false } = {}) {
  return [
    {
      key: 'created_at', label: 'Date', render: (t) => <span className="text-ink-500">{dateTime(t.created_at)}</span>,
    },
    {
      key: 'description', label: 'Description',
      render: (t) => (
        <div className="max-w-[260px]">
          <p className="truncate font-medium text-ink-900">{t.description}</p>
          <p className="text-[11px] text-ink-500">{t.reference}</p>
        </div>
      ),
    },
    ...(owner ? [{ key: 'owner', label: 'Customer' }] : []),
    { key: 'type', label: 'Type', render: (t) => TXN_LABEL[t.type] },
    { key: 'category', label: 'Category', render: (t) => <CategoryPill category={t.category} /> },
    { key: 'account_number', label: 'Account', render: (t) => <span className="font-mono text-xs">{t.account_number}</span> },
    { key: 'status', label: 'Status', render: (t) => <Badge value={t.status} /> },
    { key: 'amount', label: 'Amount', right: true, render: (t) => <Amount txn={t} /> },
  ]
}

export function Modal({ open, onClose, title, children, footer, size = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return
    const h = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className={`w-full ${size} max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-ink-500 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, error, children, hint }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-500">{hint}</span> : null}
    </label>
  )
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={`rounded-md px-3 py-1.5 transition ${value === v ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900'}`}>
          {l}
        </button>
      ))}
    </div>
  )
}

export function ProgressBar({ value, color = '#2F6FED', max = 100 }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
    </div>
  )
}

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((type, message) => {
    const id = Math.random()
    setItems((s) => [...s, { id, type, message }])
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4200)
  }, [])
  const icons = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle }
  const colors = { success: 'text-emerald-600', error: 'text-rose-600', info: 'text-brand-600', warning: 'text-amber-600' }
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
        {items.map((t) => {
          const I = icons[t.type]
          return (
            <div key={t.id} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg">
              <I size={18} className={`mt-0.5 shrink-0 ${colors[t.type]}`} />
              <p className="text-ink-700">{t.message}</p>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}
