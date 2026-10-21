import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownLeft, ArrowUpRight, Banknote, Building2, HandCoins, Landmark, ShieldAlert, Users } from 'lucide-react'
import { useApi } from '../../hooks'
import { Badge, Card, ErrorBox, Loading, PageHeader, Segmented, Stat, Table, TxnColumns } from '../../components/ui'
import { catColor, compact, money, money0 } from '../../format'
import { ChartTip, PERIODS } from '../customer/Dashboard'

export default function AdminDashboard() {
  const [days, setDays] = useState(30)
  const { data: d, loading, error, reload } = useApi('/admin/dashboard', { days })
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!d) return <Loading rows={8} />
  const loanPie = [['Pending', d.loans.pending, '#F59E0B'], ['Approved', d.loans.approved, '#10B981'], ['Rejected', d.loans.rejected, '#EF4444']].map(([name, value, fill]) => ({ name, value, fill }))
  const acctPie = [['Active', d.accounts.active, '#2F6FED'], ['Frozen', d.accounts.frozen, '#06B6D4'], ['Closed', d.accounts.closed, '#94A3B8']].map(([name, value, fill]) => ({ name, value, fill }))
  const openAlerts = d.alerts.high + d.alerts.medium + d.alerts.low

  return (
    <div className={loading ? 'opacity-70 transition' : ''}>
      <PageHeader title="Bank overview" subtitle="All metrics are aggregated live from the database"
        actions={<Segmented options={PERIODS} value={days} onChange={setDays} />} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total customers" value={d.customers} icon={Users} hint={`${d.active_customers} active`} />
        <Stat label="Accounts" value={d.accounts.total} icon={Building2} tone="cyan" hint={`${d.accounts.active} active · ${d.accounts.frozen} frozen`} />
        <Stat label="Deposits held" value={compact(d.total_balance)} icon={Landmark} tone="violet" hint={money0(d.total_balance)} />
        <Stat label="Open AI alerts" value={openAlerts} icon={ShieldAlert} tone="rose" hint={`${d.alerts.high} high · ${d.alerts.medium} medium`} />
        <Stat label={`Deposits (${days}d)`} value={compact(d.deposits)} icon={ArrowDownLeft} tone="green" hint={money0(d.deposits)} />
        <Stat label={`Withdrawals (${days}d)`} value={compact(d.withdrawals)} icon={ArrowUpRight} tone="amber" hint={money0(d.withdrawals)} />
        <Stat label={`Transfers (${days}d)`} value={compact(d.transfers)} icon={Banknote} tone="blue" hint={`${d.transaction_count.toLocaleString('en-IN')} transactions`} />
        <Stat label="Loans pending" value={d.loans.pending} icon={HandCoins} tone="slate" hint={`${compact(d.approved_loan_amount)} approved total`} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card title="Transaction activity" subtitle={`Daily inflow vs outflow and volume · last ${days} days`} className="xl:col-span-2">
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={d.daily}>
                <defs>
                  <linearGradient id="in" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10B981" stopOpacity={0.25} /><stop offset="100%" stopColor="#10B981" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} minTickGap={20} />
                <YAxis yAxisId="m" tickFormatter={compact} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={64} />
                <YAxis yAxisId="c" orientation="right" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                    <p className="mb-1 font-medium">{label}</p>
                    {payload.map((p) => <p key={p.dataKey}>{p.name}: <b>{p.dataKey === 'count' ? p.value : money(p.value)}</b></p>)}
                  </div>) : null} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="c" dataKey="count" name="Transactions" fill="#E2E8F0" radius={[3, 3, 0, 0]} maxBarSize={14} />
                <Area yAxisId="m" type="monotone" dataKey="inflow" name="Inflow" stroke="#10B981" fill="url(#in)" strokeWidth={2} />
                <Line yAxisId="m" type="monotone" dataKey="outflow" name="Outflow" stroke="#2F6FED" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Loan pipeline" action={<Link to="/admin/loans" className="text-xs font-medium text-brand-600">Review</Link>}>
          <div className="h-44">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={loanPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={75} paddingAngle={3}>
                  {loanPie.map((p) => <Cell key={p.name} fill={p.fill} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {loanPie.map((p) => <div key={p.name} className="rounded-lg bg-slate-50 py-2"><p className="text-lg font-semibold" style={{ color: p.fill }}>{p.value}</p><p className="text-[11px] text-ink-500">{p.name}</p></div>)}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Spending by category" subtitle="Customer debits across the bank">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={d.categories} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="category" width={90} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: '#F8FAFC' }} />
                <Bar dataKey="amount" name="Amount" radius={[0, 4, 4, 0]} barSize={12}>
                  {d.categories.map((c) => <Cell key={c.category} fill={catColor(c.category)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Account status">
          <div className="h-44">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={acctPie} dataKey="value" nameKey="name" outerRadius={75}>
                  {acctPie.map((p) => <Cell key={p.name} fill={p.fill} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1.5 text-xs">
            {acctPie.map((p) => <p key={p.name} className="flex justify-between"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: p.fill }} />{p.name}</span><b>{p.value}</b></p>)}
            {Object.entries(d.account_types).map(([k, v]) => <p key={k} className="flex justify-between capitalize text-ink-500"><span>{k} accounts</span><span>{v}</span></p>)}
          </div>
        </Card>
        <Card title="Highest-risk alerts" action={<Link to="/admin/alerts" className="text-xs font-medium text-brand-600">Fraud monitor</Link>} bodyClass="p-0">
          <ul className="divide-y divide-slate-100">
            {d.top_alerts.map((a) => (
              <li key={a.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{a.customer}</p>
                  <Badge value={a.severity}>{a.risk_score} · {a.severity}</Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-500">{money(a.transaction.amount)} · {a.reasons[0]}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4" title="Recent transactions" action={<Link to="/admin/transactions" className="text-xs font-medium text-brand-600">View all</Link>} bodyClass="p-0">
        <Table columns={TxnColumns().filter((c) => c.key !== 'status')} rows={d.recent} />
      </Card>
    </div>
  )
}
