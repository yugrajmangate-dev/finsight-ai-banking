const BASE = '/api/v1'

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    Object.assign(this, { status, code, details })
  }
}

async function request(method, path, { body, params, idempotent } = {}) {
  const url = new URL(BASE + path, window.location.origin)
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
  })
  const headers = { 'Content-Type': 'application/json' }
  if (idempotent) headers['Idempotency-Key'] = idempotent
  let res
  try {
    res = await fetch(url, { method, headers, credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined })
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the server. Is the backend running?')
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = json.error || {}
    if (res.status === 401 && path !== '/auth/me' && path !== '/auth/login') window.dispatchEvent(new Event('auth:expired'))
    throw new ApiError(res.status, e.code, e.message || 'Request failed', e.details)
  }
  return json
}

export const api = {
  get: (p, params) => request('GET', p, { params }),
  post: (p, body, opts) => request('POST', p, { body, ...opts }),
  patch: (p, body) => request('PATCH', p, { body }),
}

export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))

export function downloadUrl(path, params) {
  const url = new URL(BASE + path, window.location.origin)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return url.toString()
}
