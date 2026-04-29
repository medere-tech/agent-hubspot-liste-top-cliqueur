/**
 * Diagnostic étendu : trouve quel endpoint HubSpot retourne des données contact-level
 * Usage : npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/test-top-cliqueurs.ts
 */

import { getMarketingEmails } from '@/lib/hubspot'

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
  const preview = body.length > 800 ? body.slice(0, 800) + '\n  ...(tronqué)' : body
  console.log(`  body   : ${preview}`)
}

async function main() {
  // ── 0. Récupérer contexte ─────────────────────────────────────────────────
  console.log('\n[0] getMarketingEmails(90)...')
  const emails = await getMarketingEmails(90)
  console.log(`    → ${emails.length} emails`)

  const topEmail = [...emails].sort((a, b) => b.clicks - a.clicks)[0]
  console.log(`    Email top clics: id=${topEmail.id}  clicks=${topEmail.clicks}  name="${topEmail.name}"`)

  // ── 1. Events API — clics pour la campagne la plus cliquée ───────────────
  const e1 = await hubRaw('/email/public/v1/events', { type: 'CLICK', campaignId: topEmail.id, limit: '5' })
  show(`[1] /email/public/v1/events?type=CLICK&campaignId=${topEmail.id}&limit=5`, e1.status, e1.body)

  // ── 2. Events API sans filtre campaignId ──────────────────────────────────
  const e2 = await hubRaw('/email/public/v1/events', { type: 'CLICK', limit: '5' })
  show('[2] /email/public/v1/events?type=CLICK&limit=5 (sans campaignId)', e2.status, e2.body)

  // ── 3. Events API — OPEN ─────────────────────────────────────────────────
  const e3 = await hubRaw('/email/public/v1/events', { type: 'OPEN', campaignId: topEmail.id, limit: '5' })
  show(`[3] /email/public/v1/events?type=OPEN&campaignId=${topEmail.id}&limit=5`, e3.status, e3.body)

  // ── 4. CRM contacts triés par email clicks ────────────────────────────────
  const e4 = await hubRaw('/crm/v3/objects/contacts', {
    properties: 'email,hs_email_click,hs_email_open,hs_email_delivered',
    sort: '-hs_email_click',
    limit: '5',
  })
  show('[4] /crm/v3/objects/contacts?sort=-hs_email_click&limit=5', e4.status, e4.body)

  // ── 5. Propriétés CRM contact liées aux emails ────────────────────────────
  const e5 = await hubRaw('/crm/v3/properties/contacts', {})
  if (e5.status === 200) {
    try {
      const parsed = JSON.parse(e5.body) as { results: Array<{ name: string; label: string }> }
      const emailProps = parsed.results
        .filter((p) => p.name.includes('email') || p.name.includes('click') || p.name.includes('open'))
        .map((p) => `  ${p.name} — ${p.label}`)
      console.log('\n[5] Propriétés contact liées aux emails :')
      console.log(emailProps.join('\n'))
    } catch {
      show('[5] /crm/v3/properties/contacts', e5.status, e5.body)
    }
  } else {
    show('[5] /crm/v3/properties/contacts', e5.status, e5.body)
  }

  // ── 6. Statistics/list v3 ─────────────────────────────────────────────────
  const e6 = await hubRaw(`/marketing/v3/emails/${topEmail.id}/statistics/list`, { limit: '5' })
  show(`[6] /marketing/v3/emails/${topEmail.id}/statistics/list?limit=5`, e6.status, e6.body)

  // ── 7. Statistics/contacts v3 ─────────────────────────────────────────────
  const e7 = await hubRaw(`/marketing/v3/emails/${topEmail.id}/statistics/contacts`, { limit: '5' })
  show(`[7] /marketing/v3/emails/${topEmail.id}/statistics/contacts?limit=5`, e7.status, e7.body)
}

main().catch(console.error)
