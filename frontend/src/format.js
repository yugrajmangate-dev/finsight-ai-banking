const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export const money = (v) => inr.format(v || 0)
export const money0 = (v) => inr0.format(v || 0)
export function compact(v) {
  const n = Math.abs(v || 0)
  const sign = v < 0 ? '-' : ''
  if (n >= 1e7) return `${sign}₹${(n / 1e7).toFixed(2)} Cr`
  if (n >= 1e5) return `${sign}₹${(n / 1e5).toFixed(2)} L`
  if (n >= 1e3) return `${sign}₹${(n / 1e3).toFixed(1)}K`
  return `${sign}₹${n.toFixed(0)}`
}
export const date = (s) => new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
export const dateTime = (s) =>
  new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
export const pct = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`)
export const titleCase = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
export const initials = (n) => (n || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

export const CATEGORY_COLORS = {
  Housing: '#2F6FED', Groceries: '#10B981', Dining: '#F59E0B', Shopping: '#EC4899', Utilities: '#06B6D4',
  Transport: '#8B5CF6', Entertainment: '#F97316', Health: '#EF4444', Education: '#14B8A6', Travel: '#6366F1',
  Transfers: '#64748B', Cash: '#A16207', Loan: '#0EA5E9', Income: '#22C55E', Other: '#94A3B8',
}
export const catColor = (c) => CATEGORY_COLORS[c] || '#94A3B8'

export const CREDIT_TYPES = ['deposit', 'transfer_in', 'loan_disbursement']
export const TXN_LABEL = {
  deposit: 'Deposit', withdrawal: 'Withdrawal', transfer_in: 'Transfer In', transfer_out: 'Transfer Out',
  loan_disbursement: 'Loan Credit',
}
