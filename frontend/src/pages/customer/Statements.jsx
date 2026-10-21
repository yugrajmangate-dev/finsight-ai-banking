import { useState } from 'react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { downloadUrl } from '../../api'
import { useApi } from '../../hooks'
import { Card, Field, PageHeader, Table, TxnColumns } from '../../components/ui'
import { money } from '../../format'

const iso = (d) => d.toISOString().slice(0, 10)

export default function Statements() {
  const { data: accounts } = useApi('/accounts')
  const today = new Date()
  const [f, setF] = useState({ account_id: '', start: iso(new Date(today.getFullYear(), today.getMonth() - 2, 1)), end: iso(today) })
  const acc = accounts?.find((a) => String(a.id) === String(f.account_id)) || accounts?.[0]
  const preview = useApi('/transactions', { account_id: acc?.id, start: f.start, end: f.end, size: 100, sort: 'created_at' }, { enabled: !!acc })
  const credits = (preview.data || []).filter((t) => t.direction === 'credit').reduce((s, t) => s + t.amount, 0)
  const debits = (preview.data || []).filter((t) => t.direction === 'debit').reduce((s, t) => s + t.amount, 0)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const presets = [['This month', 0], ['Last 3 months', 2], ['Last 6 months', 5]]

  return (
    <>
      <PageHeader title="Account statements" subtitle="Generate and download official PDF or CSV statements" />
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Card title="Statement options">
          <div className="space-y-4">
            <Field label="Account">
              <select className="input" value={acc?.id || ''} onChange={set('account_id')}>
                {(accounts || []).map((a) => <option key={a.id} value={a.id}>{a.type} · {a.masked_number}</option>)}
              </select>
            </Field>
            <div className="flex flex-wrap gap-2">
              {presets.map(([l, m]) => (
                <button key={l} onClick={() => setF({ ...f, start: iso(new Date(today.getFullYear(), today.getMonth() - m, 1)), end: iso(today) })} className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:border-brand-500">{l}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From"><input type="date" className="input" value={f.start} onChange={set('start')} /></Field>
              <Field label="To"><input type="date" className="input" value={f.end} onChange={set('end')} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-center text-xs">
              <div><p className="text-ink-500">Credits</p><p className="text-sm font-semibold text-emerald-600">{money(credits)}</p></div>
              <div><p className="text-ink-500">Debits</p><p className="text-sm font-semibold">{money(debits)}</p></div>
            </div>
            {acc && (
              <div className="grid gap-2">
                <a className="btn-primary" href={downloadUrl(`/accounts/${acc.id}/statement`, { start: f.start, end: f.end, format: 'pdf' })}><FileText size={16} /> Download PDF</a>
                <a className="btn-secondary" href={downloadUrl(`/accounts/${acc.id}/statement`, { start: f.start, end: f.end, format: 'csv' })}><FileSpreadsheet size={16} /> Download CSV</a>
              </div>
            )}
          </div>
        </Card>
        <Card title="Preview" subtitle={`${preview.meta?.total ?? 0} transactions in period`} bodyClass="p-0" action={<Download size={16} className="text-ink-500" />}>
          <Table columns={TxnColumns().filter((c) => c.key !== 'account_number')} rows={preview.data} loading={preview.loading} error={preview.error} empty={{ title: 'No transactions in this period' }} />
        </Card>
      </div>
    </>
  )
}
