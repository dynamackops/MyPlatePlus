import { useState } from 'react'
import { ArrowRight, Check, HeartHandshake, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react'
import { requestMagicLink } from '../lib/supabase'

export function AuthGate({ onDemo }: { onDemo: () => void }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setState('loading')
    const { error } = await requestMagicLink(email)
    setState(error ? 'error' : 'sent')
  }

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <a className="brand brand-light" href="#top" aria-label="MyPlate Plus home"><span className="brand-mark">+</span><span>MyPlate<b>+</b></span></a>
        <div className="auth-copy">
          <p className="eyebrow">CAPACITY, CARE, AND CONNECTION</p>
          <h1>Everyone has a plate.<br />No one should carry the whole table alone.</h1>
          <p>See your capacity, make room without shame, and ask the people you trust for exactly the support you need.</p>
          <div className="auth-points">
            <span><Sparkles size={18} /> Human-approved AI</span>
            <span><ShieldCheck size={18} /> Private by default</span>
            <span><HeartHandshake size={18} /> Built for shared care</span>
          </div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mini-plate"><span>72%</span></div>
          <p className="eyebrow">WELCOME TO YOUR TABLE</p>
          <h2>Sign in to MyPlate+</h2>
          <p>We’ll email you a secure sign-in link. No password to remember.</p>
          {state === 'sent' ? (
            <div className="success-box"><Check size={22} /><div><strong>Check your email</strong><span>Your private plate is waiting.</span></div></div>
          ) : (
            <form onSubmit={submit}>
              <label htmlFor="email">Email address</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              <button className="primary-button full" disabled={state === 'loading'}>
                {state === 'loading' ? <LoaderCircle className="spin" size={18} /> : <>Send my sign-in link <ArrowRight size={18} /></>}
              </button>
              {state === 'error' && <p className="form-error">We couldn’t send the link. Check the project configuration and try again.</p>}
            </form>
          )}
          <button className="text-button" onClick={onDemo}>Explore the interactive demo</button>
          <p className="privacy-note"><ShieldCheck size={15} /> Your personal plate is never visible to your circle unless you choose to share something.</p>
        </div>
      </section>
    </main>
  )
}
