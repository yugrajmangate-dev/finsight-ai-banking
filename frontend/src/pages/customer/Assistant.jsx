import { useEffect, useRef, useState } from 'react'
import { Bot, Cpu, Send, ShieldCheck, Sparkles, User } from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { Card, PageHeader } from '../../components/ui'

const STARTERS = ['What is my current balance?', 'How much did I spend this month?', 'What are my largest spending categories?',
  'Show my recent transactions', 'Summarize my financial activity', 'Give me budget tips', 'Forecast next month\'s spending', 'Any suspicious activity?']

// Minimal markdown: **bold**, line breaks and "- " bullets.
function Md({ text }) {
  return text.split('\n').map((line, i) => {
    const bullet = /^\s*(-|\d+\.)\s/.test(line)
    const parts = line.replace(/^\s*-\s/, '').split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith('**') ? <b key={j} className="font-semibold text-ink-900">{p.slice(2, -2)}</b> : p)
    return <p key={i} className={bullet ? 'ml-1 flex gap-2 before:content-["•"] before:text-brand-500' : 'min-h-[0.5rem]'}>{bullet ? <span>{parts}</span> : parts}</p>
  })
}

export default function Assistant() {
  const { user } = useAuth()
  const [msgs, setMsgs] = useState([{ role: 'bot', text: `Hi ${user.full_name.split(' ')[0]}! I'm FinSight AI. Ask me about your balance, spending, budget or recent activity — I only use **your own account data**.` }])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState('offline')
  const end = useRef(null)

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])
  useEffect(() => { api.get('/health').then((r) => setMode(r.data.assistant_mode)).catch(() => {}) }, [])

  const ask = async (question) => {
    const text = (question ?? q).trim()
    if (!text || busy) return
    setQ('')
    setMsgs((m) => [...m, { role: 'user', text }])
    setBusy(true)
    try {
      const r = await api.post('/ai/assistant', { question: text })
      setMsgs((m) => [...m, { role: 'bot', text: r.data.answer, intent: r.data.intent, mode: r.data.mode }])
    } catch (e) {
      setMsgs((m) => [...m, { role: 'bot', text: `Sorry — ${e.message}`, error: true }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title={<span className="flex items-center gap-2"><Sparkles className="text-violet-600" /> AI financial assistant</span>}
        subtitle="Conversational answers computed from your live account data" />
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <Card bodyClass="p-0" className="flex h-[calc(100vh-220px)] min-h-[480px] flex-col">
          <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5">
            {msgs.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${m.role === 'user' ? 'bg-navy-900 text-white' : 'bg-gradient-to-br from-violet-500 to-brand-500 text-white'}`}>
                  {m.role === 'user' ? <User size={15} /> : <Bot size={15} />}
                </span>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === 'user' ? 'rounded-tr-sm bg-brand-600 text-white' : m.error ? 'bg-rose-50 text-rose-700' : 'rounded-tl-sm bg-slate-100 text-ink-700'}`}>
                  {m.role === 'user' ? m.text : <div className="space-y-1"><Md text={m.text} /></div>}
                  {m.intent && <p className="mt-2 text-[10px] uppercase tracking-wider text-ink-500">intent: {m.intent} · {m.mode}</p>}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-brand-500 text-white"><Bot size={15} /></span>
                <div className="flex items-center gap-1 rounded-2xl bg-slate-100 px-4 py-3">
                  {[0, 1, 2].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d * 120}ms` }} />)}
                </div>
              </div>
            )}
            <div ref={end} />
          </div>
          <div className="border-t border-slate-100 p-4">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {STARTERS.slice(0, 5).map((s) => <button key={s} onClick={() => ask(s)} className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs text-ink-700 hover:border-violet-400 hover:text-violet-700">{s}</button>)}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); ask() }} className="flex gap-2">
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your finances…" maxLength={500} />
              <button className="btn-primary" disabled={busy || !q.trim()} aria-label="Send"><Send size={16} /></button>
            </form>
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="How it works">
            <ul className="space-y-3 text-xs text-ink-700">
              <li className="flex gap-2"><Cpu size={15} className="shrink-0 text-violet-600" /> NLP intent classifier maps your question to secure banking functions.</li>
              <li className="flex gap-2"><ShieldCheck size={15} className="shrink-0 text-emerald-600" /> All figures are computed by the backend from your own accounts — never guessed.</li>
              <li className="flex gap-2"><Sparkles size={15} className="shrink-0 text-brand-600" /> Engine mode: <b className="uppercase">{mode}</b>{mode === 'offline' ? ' (add an LLM API key to enable generative answers)' : ''}</li>
            </ul>
          </Card>
          <Card title="Try asking">
            <div className="flex flex-col gap-2">
              {STARTERS.map((s) => <button key={s} onClick={() => ask(s)} className="rounded-lg bg-slate-50 px-3 py-2 text-left text-xs hover:bg-violet-50 hover:text-violet-700">{s}</button>)}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
