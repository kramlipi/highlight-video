import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

type GrowthStore = {
  visitors: number
  pageviews: number
  waitlist: { contact: string; kind: 'email' | 'phone'; createdAt: string }[]
}

const KEY_COOKIE = 'sf_vid'
const FILE = path.join(process.cwd(), '.data', 'growth.json')
const empty = (): GrowthStore => ({ visitors: 0, pageviews: 0, waitlist: [] })

async function readStore(): Promise<GrowthStore> {
  try {
    return { ...empty(), ...(JSON.parse(await readFile(FILE, 'utf8')) as Partial<GrowthStore>) }
  } catch {
    return empty()
  }
}

async function writeStore(store: GrowthStore) {
  await mkdir(path.dirname(FILE), { recursive: true })
  await writeFile(FILE, JSON.stringify(store, null, 2))
}

function publicStats(store: GrowthStore) {
  return {
    visitors: store.visitors,
    pageviews: store.pageviews,
    waitlist: store.waitlist.length,
  }
}

function parseCookie(header: string | undefined) {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
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

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as { email?: string; phone?: string }
  } catch {
    return {}
  }
}

function send(res: ServerResponse, data: unknown, status = 200, extra: Record<string, string> = {}) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  for (const [key, value] of Object.entries(extra)) res.setHeader(key, value)
  res.end(status === 204 ? '' : JSON.stringify(data))
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (req.method === 'OPTIONS') {
    send(res, {}, 204)
    return
  }

  if (url.pathname === '/api/visits' && req.method === 'GET') {
    send(res, publicStats(await readStore()))
    return
  }

  if (url.pathname === '/api/visits' && req.method === 'POST') {
    const isNew = !parseCookie(req.headers.cookie)[KEY_COOKIE]
    const store = await readStore()
    store.pageviews += 1
    if (isNew) store.visitors += 1
    await writeStore(store)
    send(res, publicStats(store), 200, isNew ? { 'set-cookie': `${KEY_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax` } : {})
    return
  }

  if (url.pathname === '/api/waitlist' && req.method === 'POST') {
    const body = await readBody(req)
    const parsed = parseContact(body.email, body.phone)
    if (!parsed) {
      send(res, { error: 'Add an email or a phone number.' }, 400)
      return
    }
    const store = await readStore()
    if (!store.waitlist.some((row) => row.contact === parsed.contact)) {
      store.waitlist.push({ ...parsed, createdAt: new Date().toISOString() })
      await writeStore(store)
    }
    send(res, { saved: true, ...publicStats(store) })
    return
  }

  send(res, { error: 'Not found' }, 404)
}

export function growthApi(): Plugin {
  return {
    name: 'shotflow-growth-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          next()
          return
        }
        void handle(req, res).catch(next)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          next()
          return
        }
        void handle(req, res).catch(next)
      })
    },
  }
}
