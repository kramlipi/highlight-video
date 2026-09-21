type GrowthStore = {
  visitors: number
  pageviews: number
  waitlist: { contact: string; kind: 'email' | 'phone'; createdAt: string }[]
}

type Kv = {
  get: (key: string) => Promise<string | null>
  put: (key: string, value: string) => Promise<void>
}

type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  SHOTFLOW?: Kv
}

const KEY = 'shotflow-growth-v1'
const COOKIE = 'sf_vid'
const empty = (): GrowthStore => ({ visitors: 0, pageviews: 0, waitlist: [] })

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env)
    }
    return env.ASSETS.fetch(request)
  },
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'OPTIONS') return json({}, 204)

  if (url.pathname === '/api/visits' && request.method === 'GET') {
    return json(publicStats(await readStore(env)))
  }

  if (url.pathname === '/api/visits' && request.method === 'POST') {
    const isNew = !parseCookie(request)[COOKIE]
    const stats = await mutate(env, (store) => {
      store.pageviews += 1
      if (isNew) store.visitors += 1
    })
    const response = json(stats)
    if (isNew) {
      response.headers.append(
        'Set-Cookie',
        `${COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax`,
      )
    }
    return response
  }

  if (url.pathname === '/api/waitlist' && request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as { email?: string; phone?: string }
    const parsed = parseContact(body.email, body.phone)
    if (!parsed) {
      return json({ error: 'Add an email or a phone number.' }, 400)
    }
    const stats = await mutate(env, (store) => {
      if (!store.waitlist.some((row) => row.contact === parsed.contact)) {
        store.waitlist.push({ ...parsed, createdAt: new Date().toISOString() })
      }
    })
    return json({ saved: true, ...stats })
  }

  return json({ error: 'Not found' }, 404)
}

function publicStats(store: GrowthStore) {
  return {
    visitors: store.visitors,
    pageviews: store.pageviews,
    waitlist: store.waitlist.length,
  }
}

async function readStore(env: Env): Promise<GrowthStore> {
  const raw = await env.SHOTFLOW?.get(KEY)
  if (!raw) return empty()
  try {
    return { ...empty(), ...(JSON.parse(raw) as Partial<GrowthStore>) }
  } catch {
    return empty()
  }
}

async function mutate(env: Env, patch: (store: GrowthStore) => void) {
  const store = await readStore(env)
  patch(store)
  await env.SHOTFLOW?.put(KEY, JSON.stringify(store))
  return publicStats(store)
}

function parseCookie(request: Request) {
  const raw = request.headers.get('Cookie') ?? ''
  const out: Record<string, string> = {}
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name) out[name] = rest.join('=')
  }
  return out
}

function parseContact(emailRaw?: string, phoneRaw?: string) {
  const email = emailRaw?.trim().toLowerCase() ?? ''
  const phone = (phoneRaw ?? '').replace(/[^\d+]/g, '')
  const digits = phone.replace(/\D/g, '')
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { contact: email, kind: 'email' as const }
  }
  if (digits.length >= 8 && digits.length <= 15) {
    return { contact: phone.startsWith('+') ? phone : digits, kind: 'phone' as const }
  }
  return null
}

function json(data: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
