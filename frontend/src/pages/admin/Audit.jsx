import { useState } from 'react'
import { useApi } from '../../hooks'
import { Card, PageHeader, Pagination, Segmented, Table } from '../../components/ui'
import { dateTime } from '../../format'

const TONE = { loan: 'bg-amber-50 text-amber-700', account: 'bg-sky-50 text-sky-700', alert: 'bg-rose-50 text-rose-700', customer: 'bg-violet-50 text-violet-700', user: 'bg-slate-100 text-slate-700' }

export default function AuditLog() {
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const { data, meta, loading, error } = useApi('/admin/audit-logs', { action, page, size: 15 })
  const cols = [
    { key: 'created_at', label: 'Time', render: (l) => <span className="text-ink-500">{dateTime(l.created_at)}</span> },
    { key: 'actor', label: 'Actor', render: (l) => <span className="font-medium text-ink-900">{l.actor}</span> },
    { key: 'action', label: 'Action', render: (l) => <span className={`rounded-md px-2 py-0.5 font-mono text-xs ${TONE[l.action.split('.')[0]] || TONE.user}`}>{l.action}</span> },
    { key: 'entity', label: 'Entity', render: (l) => <span className="font-mono text-xs">{l.entity}</span> },
    { key: 'details', label: 'Details', render: (l) => <span className="block max-w-[320px] truncate text-xs text-ink-500">{Object.entries(l.details || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}</span> },
    { key: 'ip', label: 'IP', render: (l) => <span className="font-mono text-xs">{l.ip || '—'}</span> },
  ]
  return (
    <>
      <PageHeader title="Audit log" subtitle="Tamper-evident record of sensitive actions"
        actions={<Segmented options={[['', 'All'], ['loan', 'Loans'], ['account', 'Accounts'], ['alert', 'Alerts'], ['customer', 'Customers'], ['user', 'Auth']]} value={action} onChange={(v) => { setAction(v); setPage(1) }} />} />
      <Card bodyClass="p-0">
        <Table columns={cols} rows={data} loading={loading} error={error} />
        <Pagination meta={meta} onPage={setPage} />
      </Card>
    </>
  )
}
