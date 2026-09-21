import { useEffect, useState, type FormEvent } from 'react'
import { useProject } from '../context/ProjectContext'
import { formatCount, joinWaitlist, saveInvite } from '../lib/invite'

export function WaitlistPopup() {
  const { waitlistOpen, closeWaitlist, unlock, stats, setStats } = useProject()
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!waitlistOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeWaitlist()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [waitlistOpen, closeWaitlist])

  if (!waitlistOpen) return null

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError('')
    if (!email.trim() && !phone.trim()) {
      setPending(false)
      setError('Add an email or a phone number.')
      return
    }
    try {
      const next = await joinWaitlist(email, phone)
      saveInvite(email.trim() || phone.trim(), email.trim() ? 'email' : 'phone')
      setStats(next)
      unlock()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the waitlist.')
    } finally {
      setPending(false)
    }
  }

  const visitors = stats?.visitors ?? 0

  return (
    <div className="waitlist-overlay" role="presentation" onClick={closeWaitlist}>
      <div
        className="waitlist-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="waitlist-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="landing-kicker">invite only</p>
        <h2 id="waitlist-title">Get Shotflow with an email or phone.</h2>
        <p>
          Tools stay locked until you join the waitlist. {visitors > 0
            ? `${formatCount(visitors)} ${visitors === 1 ? 'person has' : 'people have'} visited.`
            : 'We count every visit on Cloudflare.'}
        </p>
        <form className="waitlist-form" onSubmit={(event) => void onSubmit(event)}>
          <label className="field">
            Email
            <input
              type="email"
              autoComplete="email"
              placeholder="you@studio.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <p className="waitlist-or">or</p>
          <label className="field">
            Phone
            <input
              type="tel"
              autoComplete="tel"
              placeholder="+1 555 0100"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          {error ? <p className="waitlist-error">{error}</p> : null}
          <button type="submit" className="export-btn" disabled={pending}>
            {pending ? 'Saving…' : 'Join waitlist'}
          </button>
        </form>
        <button type="button" className="waitlist-skip" onClick={closeWaitlist}>
          Not now — browse the landing
        </button>
      </div>
    </div>
  )
}
