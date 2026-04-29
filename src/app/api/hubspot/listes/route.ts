import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

const HUBSPOT_BASE_URL = 'https://api.hubapi.com'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateListBody {
  name: string
  contactEmails: string[]
  source: 'inscrits' | 'non_inscrits' | 'thematique'
  theme?: string
}

interface HubSpotListV3 {
  listId: string
  name: string
  objectTypeId: string
  processingType?: string
  createdAt?: string
  updatedAt?: string
  additionalProperties?: {
    hs_list_size?: string
    hs_last_record_added_at?: string
  }
}

interface HubSpotListsSearchResponse {
  lists: HubSpotListV3[]
  hasMore: boolean
  offset: number
}

interface HubSpotListDetail {
  listId: string
  name: string
  listType?: string
  objectTypeId: string
  processingType?: string
  createdAt?: string
}

interface HubSpotCreateListResponse {
  list: HubSpotListDetail
}

interface CrmContactSearchResult {
  id: string
  properties: { email: string | null }
}

interface CrmContactSearchResponse {
  total: number
  results: CrmContactSearchResult[]
  paging?: { next?: { after: string } }
}

interface AccountInfoResponse {
  portalId: number
  timeZone?: string
  companyCurrency?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken(): string {
  const token = process.env.HUBSPOT_ACCESS_TOKEN
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN is not set')
  return token
}

/**
 * Look up HubSpot contact IDs from a list of email addresses.
 * Uses EQ filterGroups (5 per request) to avoid unsupported operator issues.
 * Runs batches of 5 in parallel for performance.
 */
async function searchContactIdsByEmails(emails: string[], token: string): Promise<number[]> {
  if (emails.length === 0) return []

  const normalized = [...new Set(emails.map((e) => e.toLowerCase().trim()).filter(Boolean))]
  const contactIds: number[] = []
  const EQ_BATCH = 5 // HubSpot max filterGroups per search request

  // Build batches
  const batches: string[][] = []
  for (let i = 0; i < normalized.length; i += EQ_BATCH) {
    batches.push(normalized.slice(i, i + EQ_BATCH))
  }

  // Run 10 batches in parallel at a time
  const PARALLEL = 10
  for (let i = 0; i < batches.length; i += PARALLEL) {
    const chunk = batches.slice(i, i + PARALLEL)
    const results = await Promise.all(
      chunk.map(async (batchEmails) => {
        const payload = {
          filterGroups: batchEmails.map((email) => ({
            filters: [{ propertyName: 'email', operator: 'EQ', value: email }],
          })),
          properties: ['email'],
          limit: EQ_BATCH,
        }
        const res = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/search`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          cache: 'no-store',
        })
        if (!res.ok) return []
        const data = (await res.json()) as CrmContactSearchResponse
        return (data.results ?? []).map((c) => parseInt(c.id, 10)).filter((id) => !isNaN(id))
      })
    )
    for (const ids of results) contactIds.push(...ids)
  }

  return contactIds
}

/**
 * Create a static HubSpot contacts list.
 */
async function createHubSpotList(name: string, token: string): Promise<HubSpotCreateListResponse> {
  const res = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/lists`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      objectTypeId: '0-1',
      listType: 'STATIC',
      processingType: 'MANUAL',
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`HubSpot create list error ${res.status}: ${body}`)
  }

  return res.json() as Promise<HubSpotCreateListResponse>
}

/**
 * Add contact IDs to a static HubSpot list.
 * HubSpot accepts up to 100 IDs per request.
 */
async function addContactsToList(listId: string, contactIds: number[], token: string): Promise<void> {
  if (contactIds.length === 0) return

  const CHUNK = 100
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const chunk = contactIds.slice(i, i + CHUNK)
    const res = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/lists/${listId}/memberships/add`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk),
      cache: 'no-store',
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`HubSpot add members error ${res.status}: ${body}`)
    }
  }
}

/**
 * Fetch HubSpot portal ID for building list deep links.
 */
async function getPortalId(token: string): Promise<number | null> {
  try {
    const res = await fetch(`${HUBSPOT_BASE_URL}/account-info/v3/details`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const data = (await res.json()) as AccountInfoResponse
    return data.portalId ?? null
  } catch {
    return null
  }
}

// ─── POST — Create list ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: CreateListBody
  try {
    body = (await req.json()) as CreateListBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, contactEmails, source } = body

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'Le nom de la liste est requis' }, { status: 400 })
  }
  if (!Array.isArray(contactEmails)) {
    return NextResponse.json({ error: 'contactEmails must be an array' }, { status: 400 })
  }
  if (!['inscrits', 'non_inscrits', 'thematique'].includes(source)) {
    return NextResponse.json({ error: 'source invalide' }, { status: 400 })
  }

  const token = getToken()

  try {
    // 1. Resolve contact IDs
    const contactIds = await searchContactIdsByEmails(contactEmails, token)

    // 2. Create the list — prefix "[Agent] " added automatically
    const prefixedName = `[Agent] ${name.trim()}`
    const created = await createHubSpotList(prefixedName, token)
    const { list } = created

    // 3. Add contacts
    await addContactsToList(list.listId, contactIds, token)

    return NextResponse.json({
      success: true,
      listId: list.listId,
      listName: list.name,
      count: contactIds.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/hubspot/listes POST]', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

// ─── GET — List existing static lists ────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = getToken()

  try {
    const [listsRes, portalId] = await Promise.all([
      fetch(`${HUBSPOT_BASE_URL}/crm/v3/lists/search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listType: 'STATIC',
          processingTypes: ['MANUAL'],
          count: 50,
        }),
        cache: 'no-store',
      }),
      getPortalId(token),
    ])

    if (!listsRes.ok) {
      const body = await listsRes.text()
      throw new Error(`HubSpot lists error ${listsRes.status}: ${body}`)
    }

    const data = (await listsRes.json()) as HubSpotListsSearchResponse

    const AGENT_PREFIX = '[Agent] '

    // Filter to agent-created lists, sort most recent first, strip prefix for display
    const agentLists = [...(data.lists ?? [])]
      .filter((l) => l.name.startsWith(AGENT_PREFIX))
      .sort((a, b) => parseInt(b.listId, 10) - parseInt(a.listId, 10))
      .slice(0, 50)
      .map((l) => ({ ...l, name: l.name.slice(AGENT_PREFIX.length) }))

    return NextResponse.json({
      lists: agentLists,
      portalId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/hubspot/listes GET]', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
