// TODO: TEMPORAIRE — supprimer après diagnostic du 401 sur /api/cron/sync-contacts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (key !== 'debug2026') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const secret = process.env.CRON_SECRET
  const raw = secret ?? ''

  return NextResponse.json({
    CRON_SECRET: {
      exists: !!secret,
      length: raw.length,
      start: raw.slice(0, 10),
      end: raw.slice(-10),
      hasLeadingSpace: raw !== raw.trimStart(),
      hasTrailingSpace: raw !== raw.trimEnd(),
      containsNewline: raw.includes('\n') || raw.includes('\r'),
    },
  })
}
