import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Bot, HandCoins, PiggyBank, ShieldAlert, Wallet } from 'lucide-react'
import { useApi } from '../../hooks'
import { Amount, Badge, Card, Empty, ErrorBox, Loading, PageHeader, Segmented, Stat } from '../../components/ui'
import { catColor, compact, date, money, pct } from '../../format'

export const PERIODS = [[7, '7D'], [30, '30D'], [90, '90D'], [180, '6M']]

export function AccountCard({ a }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-card ${a.type === 'savings' ? 'bg-gradient-to-br from-navy-900 to-brand-700' : 'bg-gradient-to-br from-slate-800 to-emerald-800'}`}>
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10" />
      <div className="absolute -bottom-12 right-10 h-24 w-24 rounded-full bg-white/5" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[.16em] text-white/60">{a.type} account</p>
          <p className="mt-1 font-mono text-sm tracking-wider text-white/90">{a.masked_number}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${a.status === 'active' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-rose-400/20 text-rose-200'}`}>{a.status}</span>
      </div>
      <p className="relative mt-6 text-[11px] text-white/60">Available balance</p>
      <p className="relative text-2xl font-semibold tracking-tight">{money(a.balance)}</p>
    </div>
  )
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-ink-900">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-ink-700">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload.fill }} /> {p.name}: <b>{money(p.value)}</b>
        </p>
      ))}
    </div>
  )
}
export { ChartTip }

export default function CustomerDashboard() {
  const [days, setDays] = useState(30)
  const { data: d, loading, error, reload } = useApi('/dashboard/customer', { days })

  if (error) return <ErrorBox error={error} onRetry={reload} />
  const s = d?.summary
  return (
    <>
      <PageHeader
        title="Financial overview"
        subtitle="Live balances and activity from your FinSight accounts"
        actions={<Segmented options={PERIODS} value={days} onChange={setDays} />}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat loading={loading && !d} label="Total balance" value={money(d?.total_balance)} icon={Wallet} hint={`${d?.accounts.length || 0} account(s)`} />
        <Stat loading={loading && !d} label="Money in" value={money(s?.income)} icon={ArrowDownLeft} tone="green"
          trend={s && <TrendChip v={s.income_change_pct} good="up" />} hint="vs previous period" />
        <Stat loading={loading && !d} label="Money out" value={money(s?.expense)} icon={ArrowUpRight} tone="rose"
          trend={s && <TrendChip v={s.expense_change_pct} good="down" />} hint="vs previous period" />
        <Stat loading={loading && !d} label="Savings rate" value={`${s?.savings_rate ?? 0}%`} icon={PiggyBank} tone="violet" hint={`Net ${money(s?.net)}`} />
      </div>

      {d && (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {d.accounts.map((a) => <AccountCard key={a.id} a={a} />)}
            <div className="grid grid-cols-2 gap-3">
              {[
                ['/app/payments?tab=transfer', 'Transfer', ArrowLeftRight, 'bg-brand-50 text-brand-600'],
                ['/app/payments?tab=deposit', 'Deposit', ArrowDownLeft, 'bg-emerald-50 text-emerald-600'],
                ['/app/loans', 'Apply loan', HandCoins, 'bg-amber-50 text-amber-600'],
                ['/app/assistant', 'Ask AI', Bot, 'bg-violet-50 text-violet-600'],
              ].map(([to, l, I, c]) => (
                <Link key={to} to={to} className="card flex flex-col items-center justify-center gap-2 p-4 text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-md">
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${c}`}><I size={19} /></span>
                  {l}
                </Link>
              ))}
            </div>
          </div>

          {(d.open_alerts > 0) && (
            <Link to="/app/security" className="mt-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <ShieldAlert size={18} /> Our AI flagged {d.open_alerts} transaction(s) for review. Tap to see why.
            </Link>
          )}

          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            <Card title="Balance trend" subtitle={`Combined closing balance, last ${days} days`} className="xl:col-span-2">
              <div className="h-64">
                <ResponsiveContainer>
                  <AreaChart data={d.balance_trend}>
                    <defs>
                      <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2F6FED" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#2F6FED" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={64} />
                    <Tooltip content={<ChartTip />} />
                    <Area type="monotone" dataKey="balance" name="Balance" stroke="#2F6FED" strokeWidth={2} fill="url(#bal)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Spending by category" subtitle={`Last ${days} days`}>
              {d.categories.length ? (
                <>
                  <div className="h-44">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={d.categories} dataKey="amount" nameKey="category" innerRadius={48} outerRadius={78} paddingAngle={2}>
                          {d.categories.map((c) => <Cell key={c.category} fill={catColor(c.category)} />)}
                        </Pie>
                        <Tooltip content={<ChartTip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {d.categories.map((c) => (
                      <li key={c.category} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: catColor(c.category) }} />{c.category}</span>
                        <span className="tabular-nums text-ink-700">{money(c.amount)} <span className="text-ink-500">· {c.share}%</span></span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : <Empty title="No spending yet" />}
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Card title="Income vs expenses" subtitle="Monthly, last 6 months" className="xl:col-span-2">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={d.monthly} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={64} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: '#F1F5F9' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="income" name="Income" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="expense" name="Expenses" fill="#2F6FED" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Loan applications" action={<Link to="/app/loans" className="text-xs font-medium text-brand-600">View all</Link>} bodyClass="p-0">
              {d.loans.length ? (
                <ul className="divide-y divide-slate-100">
                  {d.loans.map((l) => (
                    <li key={l.id} className="flex items-center justify-between px-5 py-3.5">
                      <div>
                        <p className="text-sm font-medium capitalize">{l.loan_type} loan</p>
                        <p className="text-xs text-ink-500">{money(l.amount)} · {l.term_months} mo · {date(l.created_at)}</p>
                      </div>
                      <Badge value={l.status} />
                    </li>
                  ))}
                </ul>
              ) : <Empty title="No loan applications" text="Need funds? Apply in minutes." />}
            </Card>
          </div>

          <Card className="mt-4" title="Recent transactions" action={<Link to="/app/transactions" className="text-xs font-medium text-brand-600">View all</Link>} bodyClass="p-0">
            {d.recent.length ? (
              <ul className="divide-y divide-slate-100">
                {d.recent.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: catColor(t.category) + '1A', color: catColor(t.category) }}>
                        {t.direction === 'credit' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{t.description}</p>
                        <p className="text-xs text-ink-500">{t.category} · {date(t.created_at)}</p>
                      </div>
                    </div>
                    <Amount txn={t} className="text-sm" />
                  </li>
                ))}
              </ul>
            ) : <Empty title="No transactions yet" text="Make your first deposit to get started." />}
          </Card>
        </>
      )}
      {loading && !d && <Loading rows={6} />}
    </>
  )
}

export function TrendChip({ v, good }) {
  if (v === null || v === undefined) return null
  const positive = (v >= 0) === (good === 'up')
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{pct(v)}</span>
}
