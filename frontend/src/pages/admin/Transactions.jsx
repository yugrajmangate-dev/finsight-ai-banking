import { useState } from 'react'
import { useApi, useDebounced } from '../../hooks'
import { Card, PageHeader, Pagination, Table, TxnColumns } from '../../components/ui'
import { EMPTY, TxnDetail, TxnFilters } from '../customer/Transactions'

export default function AdminTransactions() {
  const [f, setF] = useState(EMPTY)
  const [sel, setSel] = useState(null)
  const q = useDebounced(f.q)
  const { account_id, ...rest } = f
  const { data, meta, loading, error, reload } = useApi('/admin/transactions', { ...rest, q, size: 15 })
  return (
    <>
      <PageHeader title="All transactions" subtitle={meta ? `${meta.total.toLocaleString('en-IN')} matching records` : 'Bank-wide transaction ledger'} />
      <Card bodyClass="p-0">
        <TxnFilters f={f} setF={setF} />
        <Table columns={TxnColumns({ owner: true })} rows={data} loading={loading} error={error} onRetry={reload} onRowClick={setSel} />
        <Pagination meta={meta} onPage={(p) => setF({ ...f, page: p })} />
      </Card>
      <TxnDetail t={sel} onClose={() => setSel(null)} />
    </>
  )
}
