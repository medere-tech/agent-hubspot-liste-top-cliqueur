/**
 * Test direct de getMarketingEmails() sans passer par Next.js ni l'auth.
 * Usage : npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/test-get-emails.ts
 */

import { getMarketingEmails } from '@/lib/hubspot'

async function main() {
  const emails = await getMarketingEmails(90)

  console.log(`\nTotal emails retournés : ${emails.length}`)
  console.log('\n── 5 premiers emails ──────────────────────────────────────────')

  for (const e of emails.slice(0, 5)) {
    console.log(`
id        : ${e.id}
name      : ${e.name}
clicks    : ${e.clicks}
opens     : ${e.opens}
delivered : ${e.delivered}
sent      : ${e.sent}
openRate  : ${e.openRate}
clickRate : ${e.clickRate}
sentAt    : ${e.sentAt}
theme     : ${e.theme}
type      : ${e.type}
audiences : ${e.audiences.join(', ')}
isABTest  : ${e.isABTest}`)
  }
}

main().catch(console.error)
