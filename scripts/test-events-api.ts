/**
 * Test isolé de l'events API — sans appel préalable à getMarketingEmails
 * Usage : npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/test-events-api.ts
 */
export {}

const BASE = 'https://api.hubapi.com'

async function hubRaw(path: string, params: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN manquant')
  const url = new URL(`${BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  })
  const body = await res.text()
  return { status: res.status, body }
}

function show(label: string, status: number, body: string) {
  console.log(`\n${label}`)
  console.log(`  status : ${status}`)
  const preview = body.length > 1200 ? body.slice(0, 1200) + '\n  ...(tronqué)' : body
  console.log(`  body   : ${preview}`)
}

// Fenêtre 90 jours
const since90 = Date.now() - 90 * 24 * 60 * 60 * 1000

async function main() {
  // ── 1. Events CLICK — 90 jours, limit=5 ──────────────────────────────────
  const e1 = await hubRaw('/email/public/v1/events', {
    type: 'CLICK',
    startTimestamp: String(since90),
    limit: '5',
  })
  show('[1] /email/public/v1/events?type=CLICK&startTimestamp=90j&limit=5', e1.status, e1.body)

  // ── 2. Events CLICK — sans filtre date, limit=5 ───────────────────────────
  const e2 = await hubRaw('/email/public/v1/events', { type: 'CLICK', limit: '5' })
  show('[2] /email/public/v1/events?type=CLICK&limit=5', e2.status, e2.body)

  // ── 3. Events OPEN — sans filtre, limit=3 ────────────────────────────────
  const e3 = await hubRaw('/email/public/v1/events', { type: 'OPEN', limit: '3' })
  show('[3] /email/public/v1/events?type=OPEN&limit=3', e3.status, e3.body)

  // ── 4. CRM contacts top email clicks ──────────────────────────────────────
  // Vérification : tri réel ou non ?
  const e4 = await hubRaw('/crm/v3/objects/contacts', {
    properties: 'email,hs_email_click,hs_email_open,hs_email_delivered',
    filterGroups: JSON.stringify([{ filters: [{ propertyName: 'hs_email_click', operator: 'GT', value: '10' }] }]),
    limit: '10',
  })
  show('[4] /crm/v3/objects/contacts (hs_email_click > 10)', e4.status, e4.body)

  // ── 5. CRM Search — contacts triés par hs_email_click ────────────────────
  const e5 = await hubRaw('/crm/v3/objects/contacts/search', {})
  // POST via fetch car body JSON requis
  const token = process.env.HUBSPOT_ACCESS_TOKEN!
  const res5 = await fetch(`${BASE}/crm/v3/objects/contacts/search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'hs_email_click', operator: 'GT', value: '5' }] }],
      sorts: [{ propertyName: 'hs_email_click', direction: 'DESCENDING' }],
      properties: ['email', 'hs_email_click', 'hs_email_open', 'hs_email_delivered'],
      limit: 10,
    }),
  })
  const body5 = await res5.text()
  show('[5] POST /crm/v3/objects/contacts/search (hs_email_click DESC)', res5.status, body5)
}

main().catch(console.error)
