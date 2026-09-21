export const INVITE_KEY = 'shotflow-invite-v1'

export type VisitStats = {
  visitors: number
  pageviews: number
  waitlist: number
}

export function hasInvite() {
  try {
    return Boolean(localStorage.getItem(INVITE_KEY))
  } catch {
    return false
  }
}

export function saveInvite(contact: string, kind: 'email' | 'phone') {
  localStorage.setItem(INVITE_KEY, JSON.stringify({ contact, kind, at: new Date().toISOString() }))
}

export async function fetchStats(): Promise<VisitStats> {
  const res = await fetch('/api/visits', { cache: 'no-store' })
  if (!res.ok) return { visitors: 0, pageviews: 0, waitlist: 0 }
  return (await res.json()) as VisitStats
}

export async function recordVisit(): Promise<VisitStats> {
  const res = await fetch('/api/visits', { method: 'POST', credentials: 'same-origin' })
  if (!res.ok) return fetchStats()
  return (await res.json()) as VisitStats
}

export async function joinWaitlist(email: string, phone: string) {
  const res = await fetch('/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ email, phone }),
  })
  const data = (await res.json()) as VisitStats & { error?: string; saved?: boolean }
  if (!res.ok) throw new Error(data.error ?? 'Could not join the waitlist.')
  return data
}

export function formatCount(value: number) {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value)
}
