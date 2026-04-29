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
  is_inscrit: boolean
  themes: ThemeEntry[] | null
}

export interface ThemeAggregate {
  themeName: string
  totalContacts: number
  nonInscrits: number
  nonInscritsHot: number
  inscrits: number
  conversionRate: number
  totalClicks: number
  avgClicksPerContact: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

const getCachedThemes = unstable_cache(
  async (): Promise<ThemeAggregate[]> => {
    const supabase = createSupabaseAdmin()

    // Pagination Supabase — table cap à 10 000 contacts (CLAUDE.md)
    const PAGE = 1000
    const allRows: ContactRow[] = []
    let from = 0

    while (true) {
      const { data, error } = await supabase
        .from('contact_click_themes')
        .select('email, is_inscrit, themes')
        .range(from, from + PAGE - 1)

      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break
      allRows.push(...(data as ContactRow[]))
      if (data.length < PAGE) break
      from += PAGE
    }

    // Agrégation par thème — Sets sur l'email pour des comptes uniques
    const map = new Map<string, {
      contacts: Set<string>
      inscrits: Set<string>
      nonInscrits: Set<string>
      nonInscritsHot: Set<string>
      totalClicks: number
    }>()

    for (const row of allRows) {
      const themes = Array.isArray(row.themes) ? row.themes : []
      for (const t of themes) {
        if (!t || typeof t.theme !== 'string') continue
        const clicks = typeof t.clicks === 'number' ? t.clicks : 0

        let bucket = map.get(t.theme)
        if (!bucket) {
          bucket = {
            contacts: new Set(),
            inscrits: new Set(),
            nonInscrits: new Set(),
            nonInscritsHot: new Set(),
            totalClicks: 0,
          }
          map.set(t.theme, bucket)
        }

        bucket.contacts.add(row.email)
        bucket.totalClicks += clicks

        if (row.is_inscrit) {
          bucket.inscrits.add(row.email)
        } else {
          bucket.nonInscrits.add(row.email)
          if (clicks >= 3) bucket.nonInscritsHot.add(row.email)
        }
      }
    }

    const aggregates: ThemeAggregate[] = [...map.entries()].map(([themeName, b]) => {
      const totalContacts = b.contacts.size
      return {
        themeName,
        totalContacts,
        nonInscrits:         b.nonInscrits.size,
        nonInscritsHot:      b.nonInscritsHot.size,
        inscrits:            b.inscrits.size,
        conversionRate:      totalContacts > 0 ? round1((b.inscrits.size / totalContacts) * 100) : 0,
        totalClicks:         b.totalClicks,
        avgClicksPerContact: totalContacts > 0 ? round1(b.totalClicks / totalContacts) : 0,
      }
    })

    // Tri par défaut : prospects chauds décroissant
    aggregates.sort((a, b) => b.nonInscritsHot - a.nonInscritsHot)

    return aggregates
  },
  ['hubspot-thematiques'],
  { revalidate: 300, tags: ['hubspot'] }
)

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const themes = await getCachedThemes()
    return NextResponse.json({ count: themes.length, themes })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/hubspot/thematiques]', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
