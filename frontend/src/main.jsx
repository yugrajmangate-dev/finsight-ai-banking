import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { AuthProvider, RequireRole, useAuth } from './auth'
import { ToastProvider } from './components/ui'
import Layout from './components/Layout'
import { Login, Register } from './pages/Auth'
import CustomerDashboard from './pages/customer/Dashboard'
import Accounts from './pages/customer/Accounts'
import Payments from './pages/customer/Payments'
import Transactions from './pages/customer/Transactions'
import Statements from './pages/customer/Statements'
import Loans from './pages/customer/Loans'
import Insights from './pages/customer/Insights'
import Assistant from './pages/customer/Assistant'
import { Notifications, Profile, SecurityAlerts } from './pages/customer/Misc'
import AdminDashboard from './pages/admin/Dashboard'
import { AdminAccounts, AdminCustomers } from './pages/admin/People'
import AdminTransactions from './pages/admin/Transactions'
import AdminLoans from './pages/admin/Loans'
import { AdminAlerts, AiAnalytics } from './pages/admin/Alerts'
import AuditLog from './pages/admin/Audit'

function Home() {
  const { user } = useAuth()
  if (user === undefined) return null
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'admin' ? '/admin' : '/app'} replace />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/app" element={<RequireRole role="customer"><Layout /></RequireRole>}>
              <Route index element={<CustomerDashboard />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="payments" element={<Payments />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="statements" element={<Statements />} />
              <Route path="loans" element={<Loans />} />
              <Route path="insights" element={<Insights />} />
              <Route path="assistant" element={<Assistant />} />
              <Route path="security" element={<SecurityAlerts />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="profile" element={<Profile />} />
            </Route>
            <Route path="/admin" element={<RequireRole role="admin"><Layout /></RequireRole>}>
              <Route index element={<AdminDashboard />} />
              <Route path="customers" element={<AdminCustomers />} />
              <Route path="accounts" element={<AdminAccounts />} />
              <Route path="transactions" element={<AdminTransactions />} />
              <Route path="loans" element={<AdminLoans />} />
              <Route path="alerts" element={<AdminAlerts />} />
              <Route path="ai" element={<AiAnalytics />} />
              <Route path="audit" element={<AuditLog />} />
            </Route>
            <Route path="*" element={<Home />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
