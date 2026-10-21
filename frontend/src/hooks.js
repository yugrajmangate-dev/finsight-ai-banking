import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

/** Fetch helper with loading / error state and refetch. */
export function useApi(path, params, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, meta: null, loading: !!enabled, error: null })
  const key = JSON.stringify([path, params])
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!enabled || !path) return
    const id = ++seq.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await api.get(path, params)
      if (id === seq.current) setState({ data: res.data, meta: res.meta, loading: false, error: null })
    } catch (e) {
      if (id === seq.current) setState((s) => ({ ...s, loading: false, error: e }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])

  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
