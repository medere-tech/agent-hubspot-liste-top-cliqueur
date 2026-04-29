import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const token = process.env.HUBSPOT_ACCESS_TOKEN
if (!token) {
  console.error('HUBSPOT_ACCESS_TOKEN manquant')
  process.exit(1)
}

async function testEndpoint(label: string, url: string) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`[${label}] ${url}`)
  console.log('='.repeat(60))

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })

  console.log('Status :', res.status)
  const body = await res.text()
  try {
    const json = JSON.parse(body)
    console.log('Body (JSON) :')
    console.log(JSON.stringify(json, null, 2))
  } catch {
    console.log('Body (raw) :')
    console.log(body)
  }
}

async function main() {
  await testEndpoint('marketing/v3/emails', 'https://api.hubapi.com/marketing/v3/emails?limit=5')
  await testEndpoint('cms/v3/emails', 'https://api.hubapi.com/cms/v3/emails?limit=5')
}

main()
