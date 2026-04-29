/**
 * Test du croisement HubSpot × Airtable via getTopClickersEnriched()
 * Usage : npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/test-croisement.ts
 */

import { getTopClickersEnriched } from '@/lib/hubspot'

async function main() {
  console.log('\n[1] getTopClickersEnriched(90)...')
  const contacts = await getTopClickersEnriched(90)

  const inscrits           = contacts.filter((c) => c.isInscrit)
  const nonInscritsEngages = contacts.filter((c) => !c.isInscrit && c.totalClicks >= 3)

  console.log(`\nTotal contacts          : ${contacts.length}`)
  console.log(`Inscrits Airtable       : ${inscrits.length}`)
  console.log(`Non inscrits (3+ clics) : ${nonInscritsEngages.length}`)

  // ── 3 exemples d'inscrits ─────────────────────────────────────────────────
  console.log('\n── 3 premiers inscrits ───────────────────────────────────────')
  for (const c of inscrits.slice(0, 3)) {
    console.log(`
email          : ${c.emailAddress}
totalClicks    : ${c.totalClicks}
nbInscriptions : ${c.nbInscriptions}
formations     :`)
    for (const ins of c.inscriptions) {
      console.log(`  - ${ins.nomFormation}`)
    }
  }

  // ── 3 exemples non inscrits engagés ──────────────────────────────────────
  console.log('\n── 3 premiers non inscrits engagés (3+ clics) ────────────────')
  for (const c of nonInscritsEngages.slice(0, 3)) {
    console.log(`
email       : ${c.emailAddress}
totalClicks : ${c.totalClicks}
totalOpens  : ${c.totalOpens}`)
  }
}

main().catch(console.error)
