import { unstable_cache } from 'next/cache'
import { auth } from '@/lib/auth'
import { getCampaigns, getMarketingEmails } from '@/lib/hubspot'
import type { MarketingEmail } from '@/lib/hubspot'
import { NextRequest, NextResponse } from 'next/server'

const VALID_DAYS = [7, 28, 90, 360] as const
type ValidDays = (typeof VALID_DAYS)[number]

/**
 * Cache the full aggregated result (campaigns + emails) for 5 min.
 * Auth check still runs on every request; only the HubSpot data is cached.
 * On Vercel, the first visitor pays the cost — all subsequent visitors
 * within the 5-min window get an instant response.
 */
const getCachedData = unstable_cache(
  async (days: ValidDays) => {
    const [campaigns, emails] = await Promise.all([
      getCampaigns(days),
      getMarketingEmails(days).catch((err: unknown): MarketingEmail[] => {
        console.warn(
          '[api/hubspot/campaigns] getMarketingEmails unavailable:',
          err instanceof Error ? err.message : err
        )
        return []
      }),
    ])
    return { campaigns, emails }
  },
  ['hubspot-data'],
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
    const { campaigns, emails } = await getCachedData(days)
    return NextResponse.json({
      days,
      campaigns: { count: campaigns.length, data: campaigns },
      emails: { count: emails.length, data: emails },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/hubspot/campaigns]', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
