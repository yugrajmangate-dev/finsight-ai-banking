import { useState } from 'react'
import { Ban, CheckCircle2, Lock, Search, Unlock } from 'lucide-react'
import { api } from '../../api'
import { useApi, useDebounced } from '../../hooks'
import { Badge, Card, Field, Loading, Modal, PageHeader, Pagination, Spinner, Table, TxnColumns, useToast } from '../../components/ui'
import { date, initials, money } from '../../format'

function Toolbar({ q, setQ, children }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
      <div className="relative flex-1">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
        <input className="input pl-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {children}
    </div>
  )
}

export function AdminCustomers() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState(null)
  const dq = useDebounced(q)
  const list = useApi('/admin/customers', { q: dq, status, page, size: 10 })
  const detail = useApi(sel ? `/admin/customers/${sel}` : null, null, { enabled: !!sel })
  const toast = useToast()

  const toggle = async (u) => {
    try {
      await api.patch(`/admin/customers/${u.id}`, { is_active: !u.is_active })
      toast('success', `${u.full_name} ${u.is_active ? 'deactivated' : 'activated'}`)
      list.reload(); detail.reload()
    } catch (e) { toast('error', e.message) }
  }

  const cols = [
    { key: 'full_name', label: 'Customer', render: (u) => (
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{initials(u.full_name)}</span>
        <div><p className="font-medium text-ink-900">{u.full_name}</p><p className="text-xs text-ink-500">{u.email}</p></div>
      </div>) },
    { key: 'phone', label: 'Phone' },
    { key: 'city', label: 'City' },
    { key: 'accounts', label: 'Accounts' },
    { key: 'total_balance', label: 'Total balance', right: true, render: (u) => <b>{money(u.total_balance)}</b> },
    { key: 'is_active', label: 'Status', render: (u) => <Badge value={u.is_active ? 'active' : 'inactive'} /> },
    { key: 'created_at', label: 'Joined', render: (u) => date(u.created_at) },
  ]
  return (
    <>
      <PageHeader title="Customers" subtitle={`${list.meta?.total ?? '—'} registered customers`} />
      <Card bodyClass="p-0">
        <Toolbar q={q} setQ={(v) => { setQ(v); setPage(1) }}>
          <select className="input sm:w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
        </Toolbar>
        <Table columns={cols} rows={list.data} loading={list.loading} error={list.error} onRowClick={(u) => setSel(u.id)} />
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>
      <Modal open={!!sel} onClose={() => setSel(null)} title="Customer profile" size="max-w-3xl">
        {!detail.data ? <Loading /> : (() => {
          const u = detail.data
          return (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-navy-900 font-semibold text-white">{initials(u.full_name)}</span>
                  <div><p className="font-semibold">{u.full_name}</p><p className="text-xs text-ink-500">{u.email} · {u.phone} · {u.profile?.city}</p></div>
                </div>
                <button className={u.is_active ? 'btn-danger' : 'btn-success'} onClick={() => toggle(u)}>{u.is_active ? <><Ban size={15} /> Deactivate</> : <><CheckCircle2 size={15} /> Activate</>}</button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {u.accounts.map((a) => (
                  <div key={a.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex justify-between text-xs"><span className="capitalize text-ink-500">{a.type}</span><Badge value={a.status} /></div>
                    <p className="mt-1 font-mono text-xs">{a.account_number}</p>
                    <p className="mt-1 font-semibold">{money(a.balance)}</p>
                  </div>
                ))}
              </div>
              <p className="mb-2 mt-5 text-sm font-semibold">Recent transactions</p>
              <div className="rounded-xl border border-slate-200"><Table columns={TxnColumns().filter((c) => !['status', 'account_number'].includes(c.key))} rows={u.recent} /></div>
            </>
          )
        })()}
      </Modal>
    </>
  )
}

export function AdminAccounts() {
  const [q, setQ] = useState('')
  const [f, setF] = useState({ status: '', type: '' })
  const [page, setPage] = useState(1)
  const [action, setAction] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const dq = useDebounced(q)
  const list = useApi('/admin/accounts', { q: dq, ...f, page, size: 10 })
  const toast = useToast()

  const apply = async () => {
    setBusy(true)
    try {
      await api.patch(`/admin/accounts/${action.acc.id}/status`, { status: action.status, reason })
      toast('success', `Account ${action.acc.masked_number} is now ${action.status}`)
      setAction(null); setReason(''); list.reload()
    } catch (e) { toast('error', e.message) } finally { setBusy(false) }
  }

  const cols = [
    { key: 'account_number', label: 'Account', render: (a) => <span className="font-mono text-xs">{a.account_number}</span> },
    { key: 'owner', label: 'Owner', render: (a) => <div><p className="font-medium text-ink-900">{a.owner}</p><p className="text-xs text-ink-500">{a.owner_email}</p></div> },
    { key: 'type', label: 'Type', render: (a) => <span className="capitalize">{a.type}</span> },
    { key: 'balance', label: 'Balance', right: true, render: (a) => <b>{money(a.balance)}</b> },
    { key: 'status', label: 'Status', render: (a) => <Badge value={a.status} /> },
    { key: 'opened_at', label: 'Opened', render: (a) => date(a.opened_at) },
    { key: 'actions', label: 'Actions', render: (a) => a.status === 'closed' ? <span className="text-xs text-ink-500">—</span> : (
      <div className="flex gap-1.5">
        {a.status === 'active'
          ? <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => setAction({ acc: a, status: 'frozen' })}><Lock size={13} /> Freeze</button>
          : <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => setAction({ acc: a, status: 'active' })}><Unlock size={13} /> Unfreeze</button>}
        <button className="btn-secondary !px-2.5 !py-1 text-xs text-rose-600" onClick={() => setAction({ acc: a, status: 'closed' })}>Close</button>
      </div>) },
  ]
  return (
    <>
      <PageHeader title="Accounts" subtitle="Monitor and control customer accounts" />
      <Card bodyClass="p-0">
        <Toolbar q={q} setQ={(v) => { setQ(v); setPage(1) }}>
          <select className="input sm:w-40" value={f.status} onChange={(e) => { setF({ ...f, status: e.target.value }); setPage(1) }}>
            <option value="">All statuses</option><option value="active">Active</option><option value="frozen">Frozen</option><option value="closed">Closed</option>
          </select>
          <select className="input sm:w-40" value={f.type} onChange={(e) => { setF({ ...f, type: e.target.value }); setPage(1) }}>
            <option value="">All types</option><option value="savings">Savings</option><option value="current">Current</option>
          </select>
        </Toolbar>
        <Table columns={cols} rows={list.data} loading={list.loading} error={list.error} />
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>
      <Modal open={!!action} onClose={() => setAction(null)} title={`Confirm: ${action?.status === 'active' ? 'unfreeze' : action?.status} account`}
        footer={<><button className="btn-secondary" onClick={() => setAction(null)}>Cancel</button><button className={action?.status === 'active' ? 'btn-primary' : 'btn-danger'} onClick={apply} disabled={busy}>{busy && <Spinner />} Confirm</button></>}>
        <p className="text-sm text-ink-700">Account <b className="font-mono">{action?.acc.account_number}</b> owned by <b>{action?.acc.owner}</b> will be set to <b>{action?.status}</b>. This action is recorded in the audit log and the customer is notified.</p>
        <div className="mt-4"><Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Suspicious activity under review" /></Field></div>
      </Modal>
    </>
  )
}
