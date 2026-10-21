import { useState } from 'react'
import { Copy, Plus } from 'lucide-react'
import { api } from '../../api'
import { useApi } from '../../hooks'
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHeader, Spinner, Table, TxnColumns, useToast } from '../../components/ui'
import { date, money } from '../../format'
import { AccountCard } from './Dashboard'

export default function Accounts() {
  const { data, loading, error, reload } = useApi('/accounts')
  const [selected, setSelected] = useState(null)
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('savings')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const acc = selected || data?.[0]
  const txns = useApi('/transactions', { account_id: acc?.id, size: 8 }, { enabled: !!acc })

  const openAccount = async () => {
    setBusy(true)
    try {
      const r = await api.post('/accounts', { type })
      toast('success', `New ${type} account ${r.data.masked_number} opened`)
      setOpen(false)
      reload()
    } catch (e) {
      toast('error', e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="My accounts" subtitle="Savings and current accounts held with FinSight"
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Open new account</button>} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {data?.map((a) => (
            <button key={a.id} onClick={() => setSelected(a)} className={`rounded-2xl text-left ring-offset-2 transition ${acc?.id === a.id ? 'ring-2 ring-brand-500' : ''}`}>
              <AccountCard a={a} />
            </button>
          ))}
        </div>
      )}
      {acc && (
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          <Card title="Account details">
            <dl className="space-y-3 text-sm">
              {[
                ['Account number', <span className="flex items-center gap-2 font-mono">{acc.account_number}
                  <button onClick={() => { navigator.clipboard?.writeText(acc.account_number); toast('info', 'Account number copied') }} className="text-ink-500 hover:text-brand-600" aria-label="Copy"><Copy size={14} /></button></span>],
                ['Type', <span className="capitalize">{acc.type}</span>],
                ['Status', <Badge value={acc.status} />],
                ['Balance', <b>{money(acc.balance)}</b>],
                ['Currency', acc.currency],
                ['IFSC (demo)', <span className="font-mono">FSBK0001024</span>],
                ['Opened on', date(acc.opened_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0">
                  <dt className="text-ink-500">{k}</dt><dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title="Latest activity" subtitle={acc.masked_number} className="xl:col-span-2" bodyClass="p-0">
            <Table columns={TxnColumns().filter((c) => !['account_number', 'status'].includes(c.key))} rows={txns.data} loading={txns.loading} error={txns.error} empty={{ title: 'No transactions on this account' }} />
          </Card>
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Open a new account"
        footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" onClick={openAccount} disabled={busy}>{busy && <Spinner />} Open account</button></>}>
        <Field label="Account type">
          <div className="grid grid-cols-2 gap-3">
            {[['savings', 'Savings', 'Earn on idle balance, personal use'], ['current', 'Current', 'High-volume transactions']].map(([v, l, s]) => (
              <button key={v} onClick={() => setType(v)} className={`rounded-xl border p-4 text-left ${type === v ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
                <p className="text-sm font-medium">{l}</p><p className="mt-1 text-xs text-ink-500">{s}</p>
              </button>
            ))}
          </div>
        </Field>
        <p className="mt-4 text-xs text-ink-500">Accounts are activated instantly with a zero balance. Maximum 4 open accounts.</p>
      </Modal>
    </>
  )
}
