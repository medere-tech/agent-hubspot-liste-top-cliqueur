/**
 * Test direct de getInscriptions() sans passer par Next.js ni l'auth.
 * Usage : npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/test-airtable.ts
 */

import { getInscriptions } from '@/lib/airtable'

async function main() {
  console.log('\nAppel getInscriptions()...')
  const inscriptions = await getInscriptions()

  console.log(`\nTotal inscriptions actives : ${inscriptions.length}`)
  console.log('\n── 3 premiers records ──────────────────────────────────────────')

  for (const ins of inscriptions.slice(0, 3)) {
    console.log(`
id           : ${ins.id}
email        : ${ins.email}
nomFormation : ${ins.nomFormation}
apprenant    : ${ins.apprenant}
specialite   : ${ins.specialite ?? '(vide)'}
dateCreation : ${ins.dateCreation ?? '(vide)'}`)
  }
}

main().catch(console.error)
