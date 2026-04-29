/**
 * Diagnostic brut Airtable — vérifie base ID extrait + table IDs
 * Usage : npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/test-airtable-raw.ts
 */
export {}

function extractBaseId(raw: string): string {
  if (raw.startsWith('https://')) {
    const match = raw.match(/(app[A-Za-z0-9]+)/)
    return match?.[1] ?? raw
  }
  return raw
}

async function main() {
  const token  = process.env.AIRTABLE_ACCESS_TOKEN!
  const rawBase = process.env.AIRTABLE_BASE_ID ?? ''
  const baseId  = extractBaseId(rawBase)

  console.log('\n[ENV]')
  console.log('  Raw AIRTABLE_BASE_ID :', rawBase)
  console.log('  Base ID extrait      :', baseId)

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  // ── 1. Tables de la base ──────────────────────────────────────────────────
  console.log('\n[1] Tables de la base...')
  const r1 = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, { headers, cache: 'no-store' })
  const b1 = await r1.text()
  if (r1.ok) {
    const data = JSON.parse(b1) as { tables: Array<{ id: string; name: string }> }
    console.log('  Tables trouvées :')
    for (const t of data.tables) console.log(`    - ${t.id}  "${t.name}"`)
  } else {
    console.log('  status :', r1.status, b1.slice(0, 200))
  }

  // ── 2. Table fournie par l'utilisateur ────────────────────────────────────
  const TABLE_USER = 'tblTOJHEwCQhibcMM'
  console.log(`\n[2] Table fournie (${TABLE_USER}) — maxRecords=2`)
  const r2 = await fetch(
    `https://api.airtable.com/v0/${baseId}/${TABLE_USER}?maxRecords=2&returnFieldsByFieldId=true`,
    { headers, cache: 'no-store' }
  )
  const b2 = await r2.text()
  console.log('  status :', r2.status)
  console.log('  body   :', b2.slice(0, 600))

  // ── 3. Table dans l'URL Airtable ─────────────────────────────────────────
  const urlMatch = rawBase.match(/(tbl[A-Za-z0-9]+)/)
  const TABLE_URL = urlMatch?.[1]
  if (TABLE_URL && TABLE_URL !== TABLE_USER) {
    console.log(`\n[3] Table depuis URL (${TABLE_URL}) — maxRecords=2`)
    const r3 = await fetch(
      `https://api.airtable.com/v0/${baseId}/${TABLE_URL}?maxRecords=2&returnFieldsByFieldId=true`,
      { headers, cache: 'no-store' }
    )
    const b3 = await r3.text()
    console.log('  status :', r3.status)
    console.log('  body   :', b3.slice(0, 600))
  }
}

main().catch(console.error)
