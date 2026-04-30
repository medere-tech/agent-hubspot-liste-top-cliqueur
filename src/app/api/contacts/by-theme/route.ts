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
  /** Si filtre theme : clics sur ce thème. Sinon : totalClicks. */
  clicksOnTheme: number
  /** Si filtre theme : lastClick de ce thème. Sinon : lastClick le plus récent du contact. */
  lastClickOnTheme: string
  themes: ThemeEntry[]
}

interface CachedResult {
  prospects: HotProspect[]
  uniqueThemes: string[]
}

const getCachedHotProspects = unstable_cache(
  async (theme: string, minClicks: number): Promise<CachedResult> => {
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

    const themeLower = theme.toLowerCase()
    const isThemeFilter = theme.length > 0

    const prospects: HotProspect[] = []
    const uniqueThemesSet = new Set<string>()

    for (const row of allRows) {
      const themes = Array.isArray(row.themes) ? row.themes : []
      if (themes.length === 0) continue

      // On collecte les thèmes distincts sur l'univers entier (pour le dropdown stable).
      for (const t of themes) {
        if (t && typeof t.theme === 'string') uniqueThemesSet.add(t.theme)
      }

      if (isThemeFilter) {
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
      } else {
        // Sans filtre : tous les non-inscrits avec au moins un thème en base.
        // Tous ces thèmes ont déjà clicks >= 3 (filtre de sync.ts).
        // On utilise totalClicks + lastClick le plus récent comme valeurs d'aperçu.
        const lastClicks = themes
          .map((t) => (t && typeof t.lastClick === 'string' ? t.lastClick : ''))
          .filter((s) => s.length > 0)
        const lastClick = lastClicks.length
          ? lastClicks.reduce((a, b) => (a > b ? a : b))
          : ''
        prospects.push({
          email:            row.email,
          contactId:        row.contact_id,
          totalClicks:      row.total_clicks,
          clicksOnTheme:    row.total_clicks,
          lastClickOnTheme: lastClick,
          themes,
        })
      }
    }

    prospects.sort((a, b) =>
      isThemeFilter ? b.clicksOnTheme - a.clicksOnTheme : b.totalClicks - a.totalClicks
    )

    const uniqueThemes = [...uniqueThemesSet].sort((a, b) => a.localeCompare(b, 'fr'))

    console.log('[by-theme]', {
      theme: theme || '(all)',
      minClicks,
      allRowsCount: allRows.length,
      prospectsCount: prospects.length,
      uniqueThemesCount: uniqueThemes.length,
    })
    return { prospects, uniqueThemes }
  },
  ['contacts-by-theme'],
  { revalidate: 60, tags: ['hubspot'] }
)

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // theme est optionnel. Vide/absent → tous les non-inscrits avec thèmes.
  const themeRaw = req.nextUrl.searchParams.get('theme')
  const theme = themeRaw?.trim() ?? ''

  const minClicksRaw = req.nextUrl.searchParams.get('minClicks')
  const minClicksParsed = minClicksRaw ? parseInt(minClicksRaw, 10) : 3
  const minClicks =
    Number.isFinite(minClicksParsed) && minClicksParsed > 0 ? minClicksParsed : 3

  try {
    const { prospects, uniqueThemes } = await getCachedHotProspects(theme, minClicks)
    return NextResponse.json({
      theme: theme || null,
      minClicks,
      count: prospects.length,
      prospects,
      uniqueThemes,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/contacts/by-theme]', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
