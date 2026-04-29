/**
 * Simule la chaîne complète route → dashboard sans serveur ni auth.
 * Appelle getMarketingEmails(), sérialise en JSON (comme la route),
 * désérialise (comme le browser), puis applique computeThemeRows.
 *
 * Usage : npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/test-route-pipeline.ts
 */

import { getMarketingEmails } from '@/lib/hubspot'
import type { MarketingEmail, EmailType } from '@/lib/hubspot'

// ── Reproduit exactement computeThemeRows du dashboard ──────────────────────

interface ThemeRow {
  theme: string; type: string; audiences: string[]
  emailCount: number; totalClicks: number; totalOpens: number; totalDelivered: number
  isABTest: boolean
}

function computeThemeRows(emails: MarketingEmail[]): ThemeRow[] {
  const map = new Map<string, ThemeRow>()
  for (const e of emails) {
    const key = `${e.theme}__${e.type}`
    const existing = map.get(key)
    if (existing) {
      existing.emailCount++
      for (const a of e.audiences) if (!existing.audiences.includes(a)) existing.audiences.push(a)
      if (e.isABTest) existing.isABTest = true
      existing.totalClicks   += e.clicks
      existing.totalOpens    += e.opens
      existing.totalDelivered+= e.delivered
    } else {
      map.set(key, {
        theme: e.theme, type: e.type, audiences: [...e.audiences],
        emailCount: 1, totalClicks: e.clicks, totalOpens: e.opens,
        totalDelivered: e.delivered, isABTest: e.isABTest,
      })
    }
  }
  return [...map.values()].sort((a, b) => b.totalClicks - a.totalClicks || b.emailCount - a.emailCount)
}

async function main() {
  console.log('\n[1] Appel getMarketingEmails(90)...')
  const emailsDirect = await getMarketingEmails(90)
  console.log(`    → ${emailsDirect.length} emails, premier: clicks=${emailsDirect[0]?.clicks}, opens=${emailsDirect[0]?.opens}`)

  // ── Simule la sérialisation JSON de la route ───────────────────────────────
  console.log('\n[2] Sérialisation JSON (route → browser)...')
  const routeJson = JSON.stringify({
    days: 90,
    emails: { count: emailsDirect.length, data: emailsDirect },
  })
  const parsed = JSON.parse(routeJson) as {
    days: number
    emails: { count: number; data: MarketingEmail[] }
  }
  const emailsAfterJson = parsed.emails.data
  const first = emailsAfterJson[0]
  console.log(`    → Après JSON.parse: clicks=${first?.clicks}, opens=${first?.opens}, delivered=${first?.delivered}`)
  console.log(`    → Type de clicks: ${typeof first?.clicks}`)

  // ── Simule computeThemeRows ────────────────────────────────────────────────
  console.log('\n[3] computeThemeRows...')
  const rows = computeThemeRows(emailsAfterJson)
  console.log(`    → ${rows.length} thèmes, top 5 :`)
  for (const r of rows.slice(0, 5)) {
    console.log(`    - ${r.theme.padEnd(35)} clicks=${r.totalClicks.toString().padStart(6)}  opens=${r.totalOpens.toString().padStart(6)}  delivered=${r.totalDelivered}`)
  }

  // ── Vérification des zeros ─────────────────────────────────────────────────
  const zeroClicks = rows.filter(r => r.totalClicks === 0).length
  const zeroOpens  = rows.filter(r => r.totalOpens  === 0).length
  console.log(`\n[4] Bilan`)
  console.log(`    Thèmes avec clicks=0  : ${zeroClicks} / ${rows.length}`)
  console.log(`    Thèmes avec opens=0   : ${zeroOpens}  / ${rows.length}`)
  console.log(`    Total clicks agrégés  : ${rows.reduce((s, r) => s + r.totalClicks, 0)}`)
  console.log(`    Total opens agrégés   : ${rows.reduce((s, r) => s + r.totalOpens,  0)}`)
}

main().catch(console.error)
