import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

const token = process.env.HUBSPOT_ACCESS_TOKEN

async function main() {
  const url = 'https://api.hubapi.com/marketing/v3/emails?limit=2'
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const json = await res.json() as { results: Record<string, unknown>[] }
  const r = json.results[0]
  // Print only top-level scalar keys (no nested objects/arrays)
  console.log('=== TOP-LEVEL KEYS (scalars) ===')
  for (const [k, v] of Object.entries(r)) {
    if (typeof v !== 'object' || v === null) {
      console.log(`  ${k}: ${JSON.stringify(v)}`)
    } else {
      console.log(`  ${k}: [${Array.isArray(v) ? 'array' : 'object'}]`)
    }
  }

  // Also check a PUBLISHED email to see if it has stats
  const url2 = 'https://api.hubapi.com/marketing/v3/emails?limit=10&state=PUBLISHED'
  const res2 = await fetch(url2, { headers: { Authorization: `Bearer ${token}` } })
  const json2 = await res2.json() as { results: Record<string, unknown>[]; total: number }
  console.log('\n=== PUBLISHED email count ===', json2.total)
  if (json2.results.length > 0) {
    const r2 = json2.results[0]
    console.log('\n=== PUBLISHED email top-level keys ===')
    for (const [k, v] of Object.entries(r2)) {
      if (typeof v !== 'object' || v === null) {
        console.log(`  ${k}: ${JSON.stringify(v)}`)
      } else {
        console.log(`  ${k}: [${Array.isArray(v) ? 'array' : 'object'}]`)
      }
    }
  }
}

main()
