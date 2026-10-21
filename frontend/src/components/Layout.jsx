import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight, Bell, Bot, BrainCircuit, Building2, ChevronDown, FileText, HandCoins, LayoutDashboard, LogOut,
  Menu, ReceiptText, ScrollText, ShieldAlert, Sparkles, User, Users, Wallet, X,
} from 'lucide-react'
import { useAuth } from '../auth'
import { api } from '../api'
import { initials } from '../format'

const CUSTOMER_NAV = [
  ['Overview', [
    ['/app', 'Dashboard', LayoutDashboard],
    ['/app/accounts', 'Accounts', Wallet],
    ['/app/payments', 'Payments', ArrowLeftRight],
    ['/app/transactions', 'Transactions', ReceiptText],
    ['/app/statements', 'Statements', FileText],
    ['/app/loans', 'Loans', HandCoins],
  ]],
  ['AI Suite', [
    ['/app/insights', 'Smart Insights', BrainCircuit],
    ['/app/assistant', 'AI Assistant', Bot],
    ['/app/security', 'Security Alerts', ShieldAlert],
  ]],
  ['Account', [
    ['/app/notifications', 'Notifications', Bell],
    ['/app/profile', 'Profile', User],
  ]],
]

const ADMIN_NAV = [
  ['Operations', [
    ['/admin', 'Dashboard', LayoutDashboard],
    ['/admin/customers', 'Customers', Users],
    ['/admin/accounts', 'Accounts', Building2],
    ['/admin/transactions', 'Transactions', ReceiptText],
    ['/admin/loans', 'Loan Review', HandCoins],
  ]],
  ['AI & Compliance', [
    ['/admin/alerts', 'Fraud Monitor', ShieldAlert],
    ['/admin/ai', 'AI Analytics', Sparkles],
    ['/admin/audit', 'Audit Log', ScrollText],
  ]],
]

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-2">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-brand-500 shadow-inner">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round">
          <path d="M6 18V6h10M6 12h8" />
        </svg>
      </span>
      <div className="leading-tight">
        <p className="text-[15px] font-semibold text-white">FinSight</p>
        <p className="text-[10px] font-medium uppercase tracking-[.18em] text-emerald-300/80">AI Banking</p>
      </div>
    </Link>
  )
}

function Sidebar({ nav, onNavigate }) {
  return (
    <nav className="flex h-full flex-col bg-navy-900 px-3 py-5">
      <Logo />
      <div className="scrollbar-thin mt-8 flex-1 space-y-6 overflow-y-auto">
        {nav.map(([section, items]) => (
          <div key={section}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400/70">{section}</p>
            <ul className="space-y-0.5">
              {items.map(([to, label, Icon]) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/app' || to === '/admin'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                        isActive ? 'bg-white/10 font-medium text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon size={17} className={isActive ? 'text-emerald-300' : ''} />
                        {label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] leading-relaxed text-slate-300">
        <p className="font-medium text-white">Simulated environment</p>
        Demo money only · Educational project
      </div>
    </nav>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const nav = user.role === 'admin' ? ADMIN_NAV : CUSTOMER_NAV
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [unread, setUnread] = useState(0)
  const navigate = useNavigate()
  const loc = useLocation()

  useEffect(() => {
    if (user.role !== 'customer') return
    api.get('/notifications').then((r) => setUnread(r.data.filter((n) => !n.is_read).length)).catch(() => {})
  }, [user.role, loc.pathname])

  const doLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar nav={nav} />
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72">
            <Sidebar nav={nav} onNavigate={() => setOpen(false)} />
            <button className="absolute right-3 top-5 text-white" onClick={() => setOpen(false)} aria-label="Close menu">
              <X size={20} />
            </button>
          </div>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 text-ink-700 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <div className="hidden sm:block">
              <p className="text-xs text-ink-500">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <p className="text-sm font-semibold text-ink-900">
                {user.role === 'admin' ? 'Bank Operations Console' : `Welcome back, ${user.full_name.split(' ')[0]}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 md:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> AI engine online
            </span>
            {user.role === 'customer' && (
              <Link to="/app/notifications" className="relative rounded-lg p-2 text-ink-700 hover:bg-slate-100" aria-label="Notifications">
                <Bell size={19} />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                    {unread}
                  </span>
                )}
              </Link>
            )}
            <div className="relative">
              <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-navy-900 text-xs font-semibold text-white">{initials(user.full_name)}</span>
                <span className="hidden text-left sm:block">
                  <span className="block text-sm font-medium leading-tight">{user.full_name}</span>
                  <span className="block text-[11px] capitalize leading-tight text-ink-500">{user.role}</span>
                </span>
                <ChevronDown size={15} className="text-ink-500" />
              </button>
              {menu && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg" onMouseLeave={() => setMenu(false)}>
                  {user.role === 'customer' && (
                    <Link to="/app/profile" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
                      <User size={16} /> Profile
                    </Link>
                  )}
                  <button onClick={doLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
                    <LogOut size={16} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
