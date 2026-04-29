import { unstable_cache } from 'next/cache'
import { auth } from '@/lib/auth'
import { getTopClickersEnriched } from '@/lib/hubspot'
import { NextRequest, NextResponse } from 'next/server'

const VALID_DAYS = [7, 28, 90, 360] as const
type ValidDays = (typeof VALID_DAYS)[number]

const getCachedData = unstable_cache(
  async (days: ValidDays) => {
    const contacts = await getTopClickersEnriched(days)
    return {
      contacts,
      segments: {
        inscrits:             contacts.filter((c) => c.isInscrit),
        non_inscrits_engages: contacts.filter((c) => !c.isInscrit && c.totalClicks >= 3),
      },
    }
  },
  ['hubspot-top-clickers'],
  { revalidate: 300, tags: ['hubspot'] }
)

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const raw = req.nextUrl.searchParams.get('days')
  const parsed = raw ? parseInt(raw, 10) : 90
  const days: ValidDays = (VALID_DAYS as readonly number[]).includes(parsed)
    ? (parsed as ValidDays)
    : 90

  try {
    const { contacts, segments } = await getCachedData(days)
    return NextResponse.json({
      days,
      count: contacts.length,
      contacts,
      segments,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/hubspot/top-cliqueurs]', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
