import { useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useApi, useDebounced } from '../../hooks'
import { Card, Modal, PageHeader, Pagination, Table, TxnColumns, Amount, Badge, CategoryPill } from '../../components/ui'
import { TXN_LABEL, dateTime, money } from '../../format'

export function TxnFilters({ f, setF, accounts }) {
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, page: 1 })
  const { data: cats } = useApi('/categories')
  return (
    <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-6">
      <div className="relative lg:col-span-2">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
        <input className="input pl-9" placeholder="Search description or reference" value={f.q} onChange={set('q')} />
      </div>
      {accounts && (
        <select className="input" value={f.account_id} onChange={set('account_id')}>
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.type} · {a.masked_number}</option>)}
        </select>
      )}
      <select className="input" value={f.type} onChange={set('type')}>
        <option value="">All types</option>
        {Object.entries(TXN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select className="input" value={f.category} onChange={set('category')}>
        <option value="">All categories</option>
        {(cats || []).map((c) => <option key={c}>{c}</option>)}
      </select>
      <select className="input" value={f.sort} onChange={set('sort')}>
        <option value="-created_at">Newest first</option>
        <option value="created_at">Oldest first</option>
        <option value="-amount">Amount: high to low</option>
        <option value="amount">Amount: low to high</option>
      </select>
      <input type="date" className="input" value={f.start} onChange={set('start')} aria-label="From date" />
      <input type="date" className="input" value={f.end} onChange={set('end')} aria-label="To date" />
      <input className="input" inputMode="decimal" placeholder="Min ₹" value={f.min_amount} onChange={set('min_amount')} />
      <input className="input" inputMode="decimal" placeholder="Max ₹" value={f.max_amount} onChange={set('max_amount')} />
      <button className="btn-secondary" onClick={() => setF({ ...EMPTY })}><X size={15} /> Clear filters</button>
    </div>
  )
}

export const EMPTY = { q: '', account_id: '', type: '', category: '', sort: '-created_at', start: '', end: '', min_amount: '', max_amount: '', page: 1 }

export function TxnDetail({ t, onClose }) {
  return (
    <Modal open={!!t} onClose={onClose} title="Transaction details">
      {t && (
        <>
          <div className="text-center">
            <Amount txn={t} className="text-3xl" />
            <p className="mt-1 text-sm text-ink-500">{t.description}</p>
          </div>
          <dl className="mt-5 space-y-2.5 text-sm">
            {[['Reference', <span className="font-mono">{t.reference}</span>], ['Type', TXN_LABEL[t.type]], ['Status', <Badge value={t.status} />],
              ['Category', <CategoryPill category={t.category} />], ['Account', t.account_number], ['Counterparty', t.counterparty ? `${t.counterparty_name} · ${t.counterparty}` : '—'],
              ['Balance after', money(t.balance_after)], ['Date & time', dateTime(t.created_at)]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2.5 last:border-0"><dt className="text-ink-500">{k}</dt><dd className="text-right">{v}</dd></div>
            ))}
          </dl>
        </>
      )}
    </Modal>
  )
}

export default function Transactions() {
  const [f, setF] = useState(EMPTY)
  const [sel, setSel] = useState(null)
  const [show, setShow] = useState(true)
  const q = useDebounced(f.q)
  const { data: accounts } = useApi('/accounts')
  const { data, meta, loading, error, reload } = useApi('/transactions', { ...f, q, size: 15 })
  return (
    <>
      <PageHeader title="Transaction history" subtitle={meta ? `${meta.total.toLocaleString('en-IN')} transactions found` : 'All activity across your accounts'}
        actions={<button className="btn-secondary" onClick={() => setShow(!show)}><SlidersHorizontal size={15} /> Filters</button>} />
      <Card bodyClass="p-0">
        {show && <TxnFilters f={f} setF={setF} accounts={accounts} />}
        <Table columns={TxnColumns()} rows={data} loading={loading} error={error} onRetry={reload} onRowClick={setSel}
          empty={{ title: 'No matching transactions', text: 'Try adjusting your filters.' }} />
        <Pagination meta={meta} onPage={(p) => setF({ ...f, page: p })} />
      </Card>
      <TxnDetail t={sel} onClose={() => setSel(null)} />
    </>
  )
}
