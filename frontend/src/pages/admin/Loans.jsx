import { useState } from 'react'
import { CheckCircle2, Search, XCircle } from 'lucide-react'
import { api } from '../../api'
import { useApi, useDebounced } from '../../hooks'
import { Badge, Card, Field, Modal, PageHeader, Pagination, Segmented, Spinner, Table, useToast } from '../../components/ui'
import { date, money, titleCase } from '../../format'
import { ScoreGauge, Timeline } from '../customer/Loans'

export default function AdminLoans() {
  const [status, setStatus] = useState('pending')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState('')
  const dq = useDebounced(q)
  const list = useApi('/admin/loans', { status, q: dq, page, size: 10 })
  const toast = useToast()

  const decide = async (decision) => {
    if (comment.trim().length < 3) return toast('warning', 'Add a review comment (min 3 characters)')
    setBusy(decision)
    try {
      await api.post(`/admin/loans/${sel.id}/decision`, { decision, comment })
      toast('success', `Loan #${sel.id} ${decision}${decision === 'approved' ? ' and disbursed' : ''}`)
      setSel(null); setComment(''); list.reload()
    } catch (e) { toast('error', e.message) } finally { setBusy('') }
  }

  const cols = [
    { key: 'id', label: 'ID', render: (l) => `#${l.id}` },
    { key: 'applicant', label: 'Applicant', render: (l) => <div><p className="font-medium text-ink-900">{l.applicant}</p><p className="text-xs text-ink-500">{l.applicant_email}</p></div> },
    { key: 'loan_type', label: 'Type', render: (l) => titleCase(l.loan_type) },
    { key: 'amount', label: 'Amount', right: true, render: (l) => <b>{money(l.amount)}</b> },
    { key: 'term_months', label: 'Tenure', render: (l) => `${l.term_months} mo` },
    { key: 'eligibility_score', label: 'AI score', render: (l) => <span className={`font-semibold ${l.eligibility_score >= 75 ? 'text-emerald-600' : l.eligibility_score >= 55 ? 'text-amber-600' : 'text-rose-600'}`}>{l.eligibility_score}</span> },
    { key: 'status', label: 'Status', render: (l) => <Badge value={l.status} /> },
    { key: 'created_at', label: 'Applied', render: (l) => date(l.created_at) },
  ]

  return (
    <>
      <PageHeader title="Loan review" subtitle="Assess applications and record approval decisions"
        actions={<Segmented options={[['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['', 'All']]} value={status} onChange={(v) => { setStatus(v); setPage(1) }} />} />
      <Card bodyClass="p-0">
        <div className="border-b border-slate-100 p-4">
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
            <input className="input pl-9" placeholder="Search applicant" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
          </div>
        </div>
        <Table columns={cols} rows={list.data} loading={list.loading} error={list.error} onRowClick={setSel} empty={{ title: 'No applications in this view' }} />
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `${titleCase(sel.loan_type)} loan #${sel.id}` : ''} size="max-w-2xl"
        footer={sel?.status === 'pending' && <>
          <button className="btn-danger" onClick={() => decide('rejected')} disabled={!!busy}>{busy === 'rejected' ? <Spinner /> : <XCircle size={16} />} Reject</button>
          <button className="btn-success" onClick={() => decide('approved')} disabled={!!busy}>{busy === 'approved' ? <Spinner /> : <CheckCircle2 size={16} />} Approve & disburse</button>
        </>}>
        {sel && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <dl className="space-y-2 text-sm">
                {[['Applicant', sel.applicant], ['Amount', money(sel.amount)], ['Tenure', `${sel.term_months} months @ ${sel.interest_rate}%`], ['EMI', money(sel.emi)],
                  ['Monthly income', money(sel.monthly_income)], ['EMI / income', `${((sel.emi / sel.monthly_income) * 100).toFixed(0)}%`], ['Employment', titleCase(sel.employment_type)], ['Credit account', sel.account]].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="text-ink-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
                ))}
              </dl>
              <div className="rounded-xl bg-slate-50 p-4">
                <ScoreGauge score={sel.eligibility_score} />
                <ul className="mt-3 space-y-1 text-xs text-ink-700">{sel.eligibility_reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
              </div>
            </div>
            <div><p className="text-xs font-medium text-ink-500">Purpose</p><p className="text-sm">{sel.purpose}</p></div>
            <div><p className="mb-2 text-xs font-medium text-ink-500">Status history</p><Timeline history={sel.history} /></div>
            {sel.status === 'pending' && <Field label="Review comment (required)"><textarea className="input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Income verified, DTI within policy" /></Field>}
          </div>
        )}
      </Modal>
    </>
  )
}
