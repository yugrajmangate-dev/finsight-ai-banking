import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, BrainCircuit, CheckCircle2, Cpu, Eye, Gauge, Lock, ShieldAlert, ShieldCheck, Siren, XCircle } from 'lucide-react'
import { api } from '../../api'
import { useApi } from '../../hooks'
import { Amount, Badge, Card, ErrorBox, Loading, Modal, PageHeader, Pagination, Segmented, Spinner, Stat, Table, useToast } from '../../components/ui'
import { dateTime, money } from '../../format'

const SEV = { high: '#EF4444', medium: '#F59E0B', low: '#EAB308' }

function RiskBar({ score }) {
  const c = score >= 70 ? SEV.high : score >= 55 ? SEV.medium : SEV.low
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full" style={{ width: `${score}%`, background: c }} /></div>
      <span className="text-xs font-semibold tabular-nums">{score}</span>
    </div>
  )
}

export function AdminAlerts() {
  const [status, setStatus] = useState('open')
  const [severity, setSeverity] = useState('')
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState(null)
  const [busy, setBusy] = useState('')
  const list = useApi('/admin/alerts', { status, severity, page, size: 10 })
  const toast = useToast()
  const by = list.meta?.by_status || {}

  const review = async (s, freeze = false) => {
    setBusy(s + freeze)
    try {
      await api.patch(`/admin/alerts/${sel.id}`, { status: s, freeze_account: freeze })
      toast('success', `Alert #${sel.id} marked ${s}${freeze ? ' and account frozen' : ''}`)
      setSel(null); list.reload()
    } catch (e) { toast('error', e.message) } finally { setBusy('') }
  }

  const cols = [
    { key: 'created_at', label: 'Detected', render: (a) => <span className="text-ink-500">{dateTime(a.created_at)}</span> },
    { key: 'customer', label: 'Customer', render: (a) => <span className="font-medium text-ink-900">{a.customer}</span> },
    { key: 'txn', label: 'Transaction', render: (a) => <div className="max-w-[220px]"><p className="truncate">{a.transaction.description}</p><p className="text-[11px] text-ink-500">{a.transaction.reference}</p></div> },
    { key: 'amount', label: 'Amount', right: true, render: (a) => <Amount txn={a.transaction} /> },
    { key: 'risk', label: 'Risk', render: (a) => <RiskBar score={a.risk_score} /> },
    { key: 'severity', label: 'Severity', render: (a) => <Badge value={a.severity} /> },
    { key: 'reason', label: 'Primary reason', render: (a) => <span className="block max-w-[260px] truncate text-xs">{a.reasons[0]}</span> },
    { key: 'status', label: 'Status', render: (a) => <Badge value={a.status} /> },
  ]
  return (
    <>
      <PageHeader title={<span className="flex items-center gap-2"><ShieldAlert className="text-rose-600" /> Fraud monitor</span>}
        subtitle="AI-flagged transactions awaiting human review. Alerts are signals, not confirmed fraud." />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open" value={by.open || 0} icon={Siren} tone="amber" />
        <Stat label="Escalated" value={by.escalated || 0} icon={ShieldAlert} tone="rose" />
        <Stat label="Reviewed" value={by.reviewed || 0} icon={CheckCircle2} tone="blue" />
        <Stat label="Dismissed" value={by.dismissed || 0} icon={XCircle} tone="slate" />
      </div>
      <Card bodyClass="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <Segmented options={[['open', 'Open'], ['escalated', 'Escalated'], ['reviewed', 'Reviewed'], ['dismissed', 'Dismissed'], ['', 'All']]} value={status} onChange={(v) => { setStatus(v); setPage(1) }} />
          <select className="input w-40" value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1) }}>
            <option value="">All severities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
        </div>
        <Table columns={cols} rows={list.data} loading={list.loading} error={list.error} onRowClick={setSel} empty={{ title: 'No alerts in this queue', icon: ShieldCheck }} />
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `Alert #${sel.id} · ${sel.customer}` : ''} size="max-w-2xl"
        footer={sel && <>
          <button className="btn-secondary" onClick={() => review('dismissed')} disabled={!!busy}>{busy === 'dismissedfalse' && <Spinner />} Dismiss</button>
          <button className="btn-secondary" onClick={() => review('reviewed')} disabled={!!busy}>{busy === 'reviewedfalse' ? <Spinner /> : <Eye size={15} />} Mark reviewed</button>
          <button className="btn-danger" onClick={() => review('escalated', true)} disabled={!!busy}>{busy === 'escalatedtrue' ? <Spinner /> : <Lock size={15} />} Escalate & freeze</button>
        </>}>
        {sel && (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
              <div><Amount txn={sel.transaction} className="text-2xl" /><p className="text-sm text-ink-500">{sel.transaction.description}</p></div>
              <div className="text-right">
                <p className="text-[11px] uppercase text-ink-500">Risk score</p>
                <p className="text-3xl font-semibold" style={{ color: SEV[sel.severity] }}>{sel.risk_score}</p>
                <Badge value={sel.severity}>{sel.severity} severity</Badge>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Why the AI flagged this</p>
              <ul className="space-y-2">
                {sel.reasons.map((r) => <li key={r} className="flex gap-2 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-sm text-amber-900"><Activity size={15} className="mt-0.5 shrink-0" />{r}</li>)}
              </ul>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[['Reference', sel.transaction.reference], ['Account', sel.transaction.account_number], ['Counterparty', sel.transaction.counterparty_name || '—'],
                ['Time', dateTime(sel.transaction.created_at)], ['Balance after', money(sel.transaction.balance_after)], ['Model', sel.model_version], ['Status', <Badge value={sel.status} />]].map(([k, v]) => (
                <div key={k}><dt className="text-[11px] text-ink-500">{k}</dt><dd className="font-medium">{v}</dd></div>
              ))}
            </dl>
          </div>
        )}
      </Modal>
    </>
  )
}

export function AiAnalytics() {
  const { data: d, loading, error, reload } = useApi('/admin/ai-analytics')
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (loading || !d) return <Loading rows={8} />
  const sevPie = ['high', 'medium', 'low'].map((k) => ({ name: k, value: d.by_severity[k] || 0, fill: SEV[k] }))
  return (
    <>
      <PageHeader title={<span className="flex items-center gap-2"><BrainCircuit className="text-violet-600" /> AI analytics</span>} subtitle="Performance and behaviour of the anomaly detection engine" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Transactions scanned" value={d.scanned.toLocaleString('en-IN')} icon={Cpu} tone="violet" hint="All customer debits" />
        <Stat label="Alerts raised" value={d.total_alerts} icon={ShieldAlert} tone="rose" hint={`${d.alert_rate}% alert rate`} />
        <Stat label="Alert threshold" value={`${d.model.threshold}/100`} icon={Gauge} tone="amber" hint="Minimum risk score" />
        <Stat label="Model status" value={d.model.trained ? 'Trained' : 'Rules only'} icon={BrainCircuit} tone="green" hint={d.model.version} />
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card title="Detection signals" subtitle="How often each indicator contributed to an alert" className="xl:col-span-2">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={d.reasons} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="reason" width={130} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#F8FAFC' }} />
                <Bar dataKey="count" name="Alerts" fill="#7C3AED" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Severity mix">
          <div className="h-48">
            <ResponsiveContainer>
              <PieChart><Pie data={sevPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={3}>{sevPie.map((p) => <Cell key={p.name} fill={p.fill} />)}</Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">{sevPie.map((p) => <div key={p.name} className="rounded-lg bg-slate-50 py-2"><p className="text-lg font-semibold" style={{ color: p.fill }}>{p.value}</p><p className="text-[11px] capitalize text-ink-500">{p.name}</p></div>)}</div>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Risk score distribution">
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={d.score_distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip cursor={{ fill: '#F8FAFC' }} />
                <Bar dataKey="count" name="Alerts" radius={[4, 4, 0, 0]}>{d.score_distribution.map((b, i) => <Cell key={b.bucket} fill={i >= 3 ? SEV.high : i >= 1 ? SEV.medium : SEV.low} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Model configuration">
          <dl className="space-y-2 text-sm">
            {[['Algorithm', d.model.algorithm], ['Estimators', d.model.estimators ?? '—'], ['Contamination', d.model.contamination ?? '—'], ['Features', d.model.n_features ?? d.model.features.length]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3"><dt className="text-ink-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
            ))}
          </dl>
          <p className="mb-2 mt-4 text-xs font-semibold uppercase text-ink-500">Feature vector</p>
          <div className="flex flex-wrap gap-1.5">{d.model.features.map((f) => <span key={f} className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700">{f}</span>)}</div>
        </Card>
        <Card title="Most-flagged customers" bodyClass="p-0">
          <Table rowKey="customer" columns={[{ key: 'customer', label: 'Customer' }, { key: 'alerts', label: 'Alerts', right: true }]} rows={d.top_customers} />
        </Card>
      </div>
    </>
  )
}
