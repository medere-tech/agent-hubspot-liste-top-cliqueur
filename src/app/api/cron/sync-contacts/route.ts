import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { syncAllTopClickers } from '@/lib/sync'

export const maxDuration = 300 // 5 min Vercel max for Pro plan

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logs: string[] = []

  try {
    const result = await syncAllTopClickers((msg) => {
      logs.push(msg)
      console.log(msg)
    })

    // Invalidate all hubspot-tagged caches so the dashboard sees fresh data.
    // Next 16 requires a profile arg; { expire: 0 } forces an immediate purge.
    revalidateTag('hubspot', { expire: 0 })

    return NextResponse.json({ ok: true, ...result, logs })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/sync-contacts]', message)
    return NextResponse.json({ ok: false, error: message, logs }, { status: 500 })
  }
}
