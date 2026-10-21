import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts'
import { AlertTriangle, BrainCircuit, CheckCircle2, Lightbulb, LineChart as LineIcon, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { useApi } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, PageHeader, ProgressBar, Segmented, Stat } from '../../components/ui'
import { catColor, compact, money, pct } from '../../format'
import { ChartTip, PERIODS, TrendChip } from './Dashboard'

const TIP_ICON = { warning: [AlertTriangle, 'bg-amber-50 text-amber-600'], success: [CheckCircle2, 'bg-emerald-50 text-emerald-600'], info: [Lightbulb, 'bg-brand-50 text-brand-600'] }

export default function Insights() {
  const [days, setDays] = useState(30)
  const { data: d, loading, error, reload } = useApi('/ai/insights', { days })
  const fc = useApi('/ai/forecast')
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const s = d?.summary
  const forecastData = fc.data?.available ? [...fc.data.history, { label: 'Next (est.)', estimate: fc.data.next_month_estimate, actual: null }] : []

  return (
    <>
      <PageHeader title={<span className="flex items-center gap-2"><BrainCircuit className="text-brand-600" /> Smart insights</span>}
        subtitle="AI analysis of your real transaction data — estimates are clearly labelled"
        actions={<Segmented options={PERIODS} value={days} onChange={setDays} />} />
      {loading && !d ? <Loading rows={8} /> : d && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Income" value={money(s.income)} icon={TrendingUp} tone="green" trend={<TrendChip v={s.income_change_pct} good="up" />} hint="vs previous period" />
            <Stat label="Spending" value={money(s.expense)} icon={TrendingDown} tone="rose" trend={<TrendChip v={s.expense_change_pct} good="down" />} hint={`Prev. ${money(s.previous_expense)}`} />
            <Stat label="Net cash flow" value={money(s.net)} icon={Wallet} tone={s.net >= 0 ? 'blue' : 'amber'} hint={`${s.transactions} transactions`} />
            <Stat label="Savings rate" value={`${s.savings_rate}%`} icon={LineIcon} tone="violet" hint="Target: 20%+" />
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            <Card title="AI recommendations" subtitle="Generated from your spending patterns" className="xl:col-span-1" bodyClass="p-0">
              {d.tips.length ? (
                <ul className="divide-y divide-slate-100">
                  {d.tips.map((t, i) => {
                    const [I, c] = TIP_ICON[t.type]
                    return (
                      <li key={i} className="flex gap-3 px-5 py-4">
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${c}`}><I size={16} /></span>
                        <div><p className="text-sm font-medium">{t.title}</p><p className="mt-0.5 text-xs leading-relaxed text-ink-500">{t.text}</p></div>
                      </li>
                    )
                  })}
                </ul>
              ) : <Empty title="All good" text="No recommendations for this period." />}
            </Card>
            <Card title="Category breakdown" subtitle="Current vs previous period" className="xl:col-span-2">
              {d.categories.length ? (
                <div className="h-72">
                  <ResponsiveContainer>
                    <BarChart data={d.categories.slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" horizontal={false} />
                      <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="category" tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} width={90} />
                      <Tooltip content={<ChartTip />} cursor={{ fill: '#F8FAFC' }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="previous" name="Previous" fill="#CBD5E1" radius={[0, 4, 4, 0]} barSize={10} />
                      <Bar dataKey="amount" name="Current" radius={[0, 4, 4, 0]} barSize={10}>
                        {d.categories.slice(0, 8).map((c) => <Cell key={c.category} fill={catColor(c.category)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <Empty title="No spending in this period" />}
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Card title="Budget health" subtitle={d.budget.guideline}>
              {[['needs', 'Needs', '#2F6FED'], ['wants', 'Wants', '#F59E0B'], ['savings', 'Savings', '#10B981']].map(([k, l, c]) => (
                <div key={k} className="mb-4">
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="font-medium">{l}</span>
                    <span className="text-ink-500"><b className="text-ink-900">{d.budget.actual[k]}%</b> / target {d.budget.target[k]}%</span>
                  </div>
                  <ProgressBar value={d.budget.actual[k]} color={c} />
                  <p className="mt-1 text-[11px] text-ink-500">Suggested limit: {money(d.budget.suggested_limits[k])}</p>
                </div>
              ))}
            </Card>
            <Card title={<span className="flex items-center gap-2">Expense forecast <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700">Estimate</span></span>}
              subtitle={fc.data?.method || 'Linear trend + moving average'} className="xl:col-span-2">
              {fc.data?.available ? (
                <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
                  <div className="h-60">
                    <ResponsiveContainer>
                      <ComposedChart data={forecastData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={60} />
                        <Tooltip content={<ChartTip />} cursor={{ fill: '#F8FAFC' }} />
                        <Bar dataKey="actual" name="Actual spending" fill="#2F6FED" radius={[4, 4, 0, 0]} maxBarSize={30} />
                        <Bar dataKey="estimate" name="Forecast (estimate)" fill="#A78BFA" radius={[4, 4, 0, 0]} maxBarSize={30} fillOpacity={0.6} stroke="#7C3AED" strokeDasharray="4 2" />
                        <Line dataKey="actual" name="Trend" stroke="#0B2545" strokeWidth={1.5} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-xl bg-violet-50 p-4">
                      <p className="text-[11px] font-medium uppercase text-violet-700">Next month (estimate)</p>
                      <p className="text-2xl font-semibold text-violet-900">{money(fc.data.next_month_estimate)}</p>
                      <p className="text-[11px] text-violet-700">Range {compact(fc.data.range[0])} – {compact(fc.data.range[1])} · trend {fc.data.trend}</p>
                    </div>
                    <ul className="space-y-1.5 text-xs">
                      {fc.data.by_category.slice(0, 5).map((c) => (
                        <li key={c.category} className="flex justify-between"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: catColor(c.category) }} />{c.category}</span><span>{money(c.estimate)}</span></li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : <Empty title="Not enough history" text={fc.data?.reason} />}
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card title="Monthly cash flow" subtitle="Actual records, last 6 months">
              <div className="h-60">
                <ResponsiveContainer>
                  <ComposedChart data={d.monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: '#F8FAFC' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="income" name="Income" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="expense" name="Expenses" fill="#F43F5E" radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Line dataKey="savings" name="Net savings" stroke="#2F6FED" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Largest expenses" subtitle={`Top 5 in last ${days} days`} bodyClass="p-0">
              {d.largest_expenses.length ? (
                <ul className="divide-y divide-slate-100">
                  {d.largest_expenses.map((t) => (
                    <li key={t.reference} className="flex items-center justify-between px-5 py-3 text-sm">
                      <div><p className="font-medium">{t.description}</p><p className="text-xs text-ink-500">{t.category} · {new Date(t.date).toLocaleDateString('en-IN')}</p></div>
                      <b className="tabular-nums">{money(t.amount)}</b>
                    </li>
                  ))}
                </ul>
              ) : <Empty />}
            </Card>
          </div>
          <p className="mt-6 text-center text-xs text-ink-500">Change figures compare with the previous {days} days: income {pct(s.income_change_pct)}, spending {pct(s.expense_change_pct)}.</p>
        </>
      )}
    </>
  )
}
