/**
 * Vérifie que getMarketingEmails() retourne des vraies stats via
 * /email/public/v1/campaigns.
 *
 * Usage : npx tsx --env-file=.env.local scripts/test-hubspot-stats.ts
 */

export {}

const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN
if (!TOKEN) {
  console.error('HUBSPOT_ACCESS_TOKEN manquant')
  process.exit(1)
}

const BASE = 'https://api.hubapi.com'
const HEADERS = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), { headers: HEADERS })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 200)}`)
  return JSON.parse(text) as T
}

interface V1ListItem   { id: number; lastUpdatedTime: number; appName: string }
interface V1ListPage   { campaigns: V1ListItem[]; hasMore: boolean; offset?: string }
interface V1Detail     {
  id: number; name?: string; subject?: string; scheduledAt?: number
  appName?: string; subType?: string; processingState?: string; type?: string
  counters?: { sent?: number; delivered?: number; click?: number; open?: number }
}

const DAYS = 90
const LIMIT = 5

async function main() {
  const sinceMs = Date.now() - DAYS * 24 * 60 * 60 * 1000

  // ── 1. Collecte les IDs (arrêt dès que lastUpdatedTime < sinceMs) ──────────
  const ids: number[] = []
  let offset: string | undefined
  let keepPaging = true

  while (keepPaging && ids.length < 200) {
    const params: Record<string, string> = { limit: '100' }
    if (offset) params.offset = offset
    const page = await get<V1ListPage>('/email/public/v1/campaigns', params)
    for (const c of page.campaigns) {
      if (c.lastUpdatedTime < sinceMs) { keepPaging = false; break }
      ids.push(c.id)
    }
    if (!page.hasMore) keepPaging = false
    offset = page.offset
  }

  console.log(`\n${ids.length} campagne(s) trouvée(s) sur les ${DAYS} derniers jours`)
  console.log(`→ Affichage des ${LIMIT} premières\n`)

  // ── 2. Fetch détails des N premiers ───────────────────────────────────────
  const topIds = ids.slice(0, LIMIT)
  const details = await Promise.all(
    topIds.map((id) => get<V1Detail>(`/email/public/v1/campaigns/${id}`).catch(() => null))
  )

  let allHaveClicks = true
  let allHaveOpens = true

  console.log('='.repeat(72))
  for (const d of details) {
    if (!d) { console.log('(erreur fetch)'); continue }

    const clicks = d.counters?.click ?? 0
    const opens  = d.counters?.open  ?? 0
    const del    = d.counters?.delivered ?? 0
    const sent   = d.counters?.sent ?? 0
    const openPct  = del > 0 ? ((opens  / del) * 100).toFixed(1) + '%' : 'n/a'
    const clickPct = del > 0 ? ((clicks / del) * 100).toFixed(1) + '%' : 'n/a'
    const scheduledAt = d.scheduledAt ? new Date(d.scheduledAt).toLocaleDateString('fr-FR') : '?'
    const isAB = d.appName === 'AbBatch' ? ' [A/B]' : ''

    console.log(`\nID          : ${d.id}${isAB}`)
    console.log(`Nom         : ${d.name ?? '(sans nom)'}`)
    console.log(`Envoyé le   : ${scheduledAt}`)
    console.log(`Sent        : ${sent.toLocaleString('fr-FR')}`)
    console.log(`Delivered   : ${del.toLocaleString('fr-FR')}`)
    console.log(`Opens       : ${opens.toLocaleString('fr-FR')}  (${openPct})`)
    console.log(`Clicks      : ${clicks.toLocaleString('fr-FR')}  (${clickPct})`)
    console.log(`State       : ${d.processingState ?? d.type ?? '?'}`)

    if (clicks === 0) allHaveClicks = false
    if (opens  === 0) allHaveOpens  = false
  }

  console.log('\n' + '='.repeat(72))
  console.log('\nBILAN')
  console.log(`clicks > 0 sur les ${LIMIT} premiers : ${allHaveClicks ? 'OUI' : 'NON (certains à 0)'}`)
  console.log(`opens  > 0 sur les ${LIMIT} premiers : ${allHaveOpens  ? 'OUI' : 'NON (certains à 0)'}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
