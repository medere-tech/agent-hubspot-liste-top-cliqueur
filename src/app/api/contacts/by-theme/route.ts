import { unstable_cache } from 'next/cache'
import { auth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

interface ThemeEntry {
  theme: string
  clicks: number
  lastClick: string
}

interface ContactRow {
  email: string
  contact_id: string
  total_clicks: number
  is_inscrit: boolean
  themes: ThemeEntry[] | null
}

export interface HotProspect {
  email: string
  contactId: string
  totalClicks: number
  clicksOnTheme: number
  lastClickOnTheme: string
  themes: ThemeEntry[]
}

const getCachedHotProspects = unstable_cache(
  async (theme: string, minClicks: number): Promise<HotProspect[]> => {
    const supabase = createSupabaseAdmin()

    // Pagination Supabase — table cap à 10 000 contacts
    const PAGE = 1000
    const allRows: ContactRow[] = []
    let from = 0

    while (true) {
      const { data, error } = await supabase
        .from('contact_click_themes')
        .select('email, contact_id, total_clicks, is_inscrit, themes')
        .eq('is_inscrit', false)
        .range(from, from + PAGE - 1)

      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break
      allRows.push(...(data as ContactRow[]))
      if (data.length < PAGE) break
      from += PAGE
    }

    // Filtre JSONB : au moins un theme matche (case-insensitive) ET clicks >= minClicks
    const themeLower = theme.toLowerCase()
    const prospects: HotProspect[] = []

    for (const row of allRows) {
      const themes = Array.isArray(row.themes) ? row.themes : []
      const matching = themes.find(
        (t) =>
          t &&
          typeof t.theme === 'string' &&
          t.theme.toLowerCase() === themeLower &&
          typeof t.clicks === 'number' &&
          t.clicks >= minClicks
      )
      if (!matching) continue

      prospects.push({
        email:            row.email,
        contactId:        row.contact_id,
        totalClicks:      row.total_clicks,
        clicksOnTheme:    matching.clicks,
        lastClickOnTheme: matching.lastClick,
        themes,
      })
    }

    prospects.sort((a, b) => b.clicksOnTheme - a.clicksOnTheme)
    console.log('[by-theme]', {
      theme,
      minClicks,
      allRowsCount: allRows.length,
      prospectsCount: prospects.length,
    })
    return prospects
  },
  ['contacts-by-theme'],
  { revalidate: 60, tags: ['hubspot'] }
)

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const theme = req.nextUrl.searchParams.get('theme')?.trim()
  if (!theme) {
    return NextResponse.json({ error: 'theme is required' }, { status: 400 })
  }

  const minClicksRaw = req.nextUrl.searchParams.get('minClicks')
  const minClicksParsed = minClicksRaw ? parseInt(minClicksRaw, 10) : 3
  const minClicks =
    Number.isFinite(minClicksParsed) && minClicksParsed > 0 ? minClicksParsed : 3

  try {
    const prospects = await getCachedHotProspects(theme, minClicks)
    return NextResponse.json({
      theme,
      minClicks,
      count: prospects.length,
      prospects,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/contacts/by-theme]', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
