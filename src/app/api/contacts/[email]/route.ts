import { unstable_cache } from 'next/cache'
import { auth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const HUBSPOT_BASE_URL = 'https://api.hubapi.com'

interface ThemeEntry {
  theme: string
  clicks: number
  lastClick: string
}

interface Inscription {
  nomFormation: string
  specialite: string | null
  dateCreation: string | null
}

interface SupabaseContactRow {
  email: string
  contact_id: string
  total_clicks: number
  themes: ThemeEntry[] | null
  is_inscrit: boolean
  inscriptions: Inscription[] | null
  last_synced_at: string
}

interface HubSpotContactSearchResult {
  id: string
  properties: {
    firstname?: string | null
    lastname?: string | null
    email?: string | null
    hs_email_click?: string | null
    hs_email_open?: string | null
    hs_email_delivered?: string | null
  }
}

interface HubSpotContactSearchResponse {
  total: number
  results: HubSpotContactSearchResult[]
}

export interface ContactDetails {
  email: string
  contactId: string
  firstname: string | null
  lastname: string | null
  totalClicks: number
  totalOpens: number
  totalDelivered: number
  openRate: number | null
  clickRate: number | null
  isInscrit: boolean
  inscriptions: Inscription[]
  themes: ThemeEntry[]
  lastSyncedAt: string
}

const round1 = (n: number) => Math.round(n * 10) / 10

const getCachedContactDetails = unstable_cache(
  async (email: string): Promise<ContactDetails | null> => {
    const normalizedEmail = email.toLowerCase().trim()
    const supabase = createSupabaseAdmin()

    const { data: row, error: supaErr } = await supabase
      .from('contact_click_themes')
      .select('email, contact_id, total_clicks, themes, is_inscrit, inscriptions, last_synced_at')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (supaErr) throw new Error(supaErr.message)
    if (!row) return null

    const supaRow = row as SupabaseContactRow

    // HubSpot enrichment — best-effort. On ne lève pas si HubSpot est down :
    // on garde les données Supabase et on signale les manques par null/0.
    let firstname: string | null = null
    let lastname: string | null = null
    let hsClicks = supaRow.total_clicks
    let hsOpens = 0
    let hsDelivered = 0

    const token = process.env.HUBSPOT_ACCESS_TOKEN
    if (token) {
      try {
        const res = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/search`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filterGroups: [
              { filters: [{ propertyName: 'email', operator: 'EQ', value: normalizedEmail }] },
            ],
            properties: [
              'firstname',
              'lastname',
              'email',
              'hs_email_click',
              'hs_email_open',
              'hs_email_delivered',
            ],
            limit: 1,
          }),
          cache: 'no-store',
        })
        if (res.ok) {
          const data = (await res.json()) as HubSpotContactSearchResponse
          const c = data.results?.[0]
          if (c) {
            firstname = c.properties.firstname?.trim() || null
            lastname = c.properties.lastname?.trim() || null
            hsClicks = parseInt(c.properties.hs_email_click ?? '0', 10) || hsClicks
            hsOpens = parseInt(c.properties.hs_email_open ?? '0', 10) || 0
            hsDelivered = parseInt(c.properties.hs_email_delivered ?? '0', 10) || 0
          }
        } else {
          console.warn('[contact details] HubSpot search status:', res.status)
        }
      } catch (err) {
        console.warn('[contact details] HubSpot fetch error:', err)
      }
    }

    const themes = Array.isArray(supaRow.themes)
      ? [...supaRow.themes].sort((a, b) => b.clicks - a.clicks)
      : []
    const inscriptions = Array.isArray(supaRow.inscriptions) ? supaRow.inscriptions : []

    return {
      email:           supaRow.email,
      contactId:       supaRow.contact_id,
      firstname,
      lastname,
      totalClicks:     hsClicks,
      totalOpens:      hsOpens,
      totalDelivered:  hsDelivered,
      openRate:        hsDelivered > 0 ? round1((hsOpens / hsDelivered) * 100) : null,
      clickRate:       hsDelivered > 0 ? round1((hsClicks / hsDelivered) * 100) : null,
      isInscrit:       supaRow.is_inscrit,
      inscriptions,
      themes,
      lastSyncedAt:    supaRow.last_synced_at,
    }
  },
  ['contact-details'],
  { revalidate: 60, tags: ['hubspot'] }
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { email: emailParam } = await params
  const email = emailParam?.trim()
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  try {
    const details = await getCachedContactDetails(email)
    if (!details) {
      return NextResponse.json({ error: 'Contact non trouvé' }, { status: 404 })
    }
    return NextResponse.json(details)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/contacts/[email]]', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
