// ─── Types ────────────────────────────────────────────────────────────────────

export interface Inscription {
  /** Identifiant Airtable du record */
  id: string
  /** Email normalisé (lowercase, trimmed) */
  email: string
  nomFormation: string
  apprenant: string
  specialite: string | null
  /** ISO date string */
  dateCreation: string | null
}

// ─── Field IDs ────────────────────────────────────────────────────────────────

const FIELD = {
  EMAIL:           'fldZmubHrX9S44BUy',
  NOM_FORMATION:   'fldPPQhzeUKKa3hND',
  APPRENANT:       'fldGiubhYwR32RUPs',
  DATE_CREATION:   'fldLNmbnKeu7Sc2eZ',
  SPECIALITE:      'fldCzrRaZNMbizqhi',
  DESINSCRIPTIONS: 'fld6cCF7tZfbcr7Um',
} as const

const TABLE_ID = 'tblTOJHEwCQhibcMM'

// ─── Airtable client ──────────────────────────────────────────────────────────

interface AirtableRecord {
  id: string
  createdTime: string
  fields: Record<string, unknown>
}

interface AirtableListResponse {
  records: AirtableRecord[]
  offset?: string
}

/**
 * Extract the base ID from AIRTABLE_BASE_ID.
 * Accepts either:
 *   - the bare ID:   "app3GnMOzJn7VHMji"
 *   - the full URL:  "https://airtable.com/app3GnMOzJn7VHMji/tbl.../viw..."
 */
function resolveBaseId(): string {
  const raw = process.env.AIRTABLE_BASE_ID ?? ''
  if (!raw) throw new Error('AIRTABLE_BASE_ID is not set')
  if (raw.startsWith('https://')) {
    const match = raw.match(/(app[A-Za-z0-9]+)/)
    if (!match) throw new Error(`Cannot parse base ID from AIRTABLE_BASE_ID: ${raw}`)
    return match[1]
  }
  return raw
}

/**
 * Internal fetch wrapper for Airtable REST API.
 * Always uses returnFieldsByFieldId=true so response keys are stable field IDs.
 * Never called client-side — token stays server-only.
 */
async function airtableFetch(
  tableId: string,
  params: Record<string, string> = {}
): Promise<AirtableListResponse> {
  const token  = process.env.AIRTABLE_ACCESS_TOKEN
  const baseId = resolveBaseId()
  if (!token) throw new Error('AIRTABLE_ACCESS_TOKEN is not set')

  const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`)

  // Stable field IDs in response
  url.searchParams.set('returnFieldsByFieldId', 'true')

  // Requested fields
  const fieldIds = Object.values(FIELD)
  for (const fid of fieldIds) {
    url.searchParams.append('fields[]', fid)
  }

  // Additional params (offset, filterByFormula, etc.)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable API error ${res.status}: ${body}`)
  }

  return res.json() as Promise<AirtableListResponse>
}

// ─── Field value helpers ──────────────────────────────────────────────────────

function str(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return String(value[0] ?? '')
  return String(value)
}

function strOrNull(value: unknown): string | null {
  if (value == null) return null
  const s = str(value)
  return s === '' ? null : s
}

function mapRecord(record: AirtableRecord): Inscription {
  const f = record.fields
  return {
    id:           record.id,
    email:        str(f[FIELD.EMAIL]).toLowerCase().trim(),
    nomFormation: str(f[FIELD.NOM_FORMATION]),
    apprenant:    str(f[FIELD.APPRENANT]),
    specialite:   strOrNull(f[FIELD.SPECIALITE]),
    dateCreation: strOrNull(f[FIELD.DATE_CREATION]),
  }
}

// ─── Public functions ─────────────────────────────────────────────────────────

/**
 * Fetch all active inscriptions (Désinscriptions field is empty).
 * Paginates automatically through the full Airtable table.
 */
export async function getInscriptions(): Promise<Inscription[]> {
  const all: AirtableRecord[] = []
  let offset: string | undefined

  do {
    const params: Record<string, string> = {
      // Exclude records where Désinscriptions has a value
      filterByFormula: `{${FIELD.DESINSCRIPTIONS}} = ""`,
    }
    if (offset) params.offset = offset

    const page = await airtableFetch(TABLE_ID, params)
    all.push(...page.records)
    offset = page.offset
  } while (offset)

  return all
    .map(mapRecord)
    .filter((i) => i.email !== '')
}

/**
 * Build a lookup map from a list of HubSpot clicker emails.
 * Returns Map<emailLowercase, Inscription[]> for O(1) cross-referencing.
 *
 * Uses targeted Airtable filter formulas instead of fetching all 22k+ records.
 * Emails are processed in batches of 10 to stay within URL length limits.
 */
export async function getInscriptionsByEmail(
  emails: string[]
): Promise<Map<string, Inscription[]>> {
  if (emails.length === 0) return new Map()

  const normalizedEmails = [
    ...new Set(emails.map((e) => e.toLowerCase().trim()).filter(Boolean)),
  ]
  const map = new Map<string, Inscription[]>()

  // 10 emails per batch → formula stays within URL limits
  const BATCH = 10

  for (let i = 0; i < normalizedEmails.length; i += BATCH) {
    const batch = normalizedEmails.slice(i, i + BATCH)

    // Case-insensitive match + exclude desinscribed
    const emailConditions = batch
      .map((e) => `LOWER({${FIELD.EMAIL}}) = "${e}"`)
      .join(', ')
    const formula = `AND({${FIELD.DESINSCRIPTIONS}} = "", OR(${emailConditions}))`

    let offset: string | undefined
    do {
      const params: Record<string, string> = { filterByFormula: formula }
      if (offset) params.offset = offset

      const page = await airtableFetch(TABLE_ID, params)
      for (const record of page.records) {
        const ins = mapRecord(record)
        if (!ins.email) continue
        const existing = map.get(ins.email)
        if (existing) existing.push(ins)
        else map.set(ins.email, [ins])
      }
      offset = page.offset
    } while (offset)
  }

  return map
}
