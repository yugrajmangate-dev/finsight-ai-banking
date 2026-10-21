import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api } from './api'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = still checking

  const refresh = useCallback(async () => {
    try {
      setUser((await api.get('/auth/me')).data)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    refresh()
    const onExpired = () => setUser(null)
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [refresh])

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    setUser(res.data)
    return res.data
  }
  const register = async (body) => {
    const res = await api.post('/auth/register', body)
    setUser(res.data)
    return res.data
  }
  const logout = async () => {
    await api.post('/auth/logout').catch(() => {})
    setUser(null)
  }
  return <AuthCtx.Provider value={{ user, setUser, login, register, logout, refresh }}>{children}</AuthCtx.Provider>
}

export function RequireRole({ role, children }) {
  const { user } = useAuth()
  const loc = useLocation()
  if (user === undefined)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-ink-500">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    )
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/app'} replace />
  return children
}
