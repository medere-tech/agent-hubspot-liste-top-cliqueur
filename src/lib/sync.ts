import { getTopClickers, getTotalClickersCount, parseEmailName } from '@/lib/hubspot'
import { getInscriptionsByEmail } from '@/lib/airtable'
import { createSupabaseAdmin } from '@/lib/supabase'

const HUBSPOT_BASE_URL = 'https://api.hubapi.com'
const DAYS_360_MS = 360 * 24 * 60 * 60 * 1000

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ThemeCount {
  theme: string
  clicks: number
  lastClick: string // ISO date
}

export interface ContactClickThemes {
  email: string
  contactId: string
  totalClicks: number
  themes: ThemeCount[]
}

export interface SyncResult {
  synced: number
  errors: number
  duration: number // ms
  startOffset: number
  endOffset: number
  totalContacts: number
  fullCycleCompleted: boolean
  skipped: boolean
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface ClickEvent {
  type: string
  emailCampaignId?: number
  created: number
}

interface EventsPage {
  hasMore: boolean
  offset?: string
  events: ClickEvent[]
}

interface CampaignDetail {
  name?: string
}

// ─── Campaign name cache (lives for the duration of one sync run) ─────────────

const campaignNameCache = new Map<number, string | null>()

async function fetchCampaignName(campaignId: number, token: string): Promise<string | null> {
  if (campaignNameCache.has(campaignId)) return campaignNameCache.get(campaignId)!

  try {
    const res = await fetch(`${HUBSPOT_BASE_URL}/email/public/v1/campaigns/${campaignId}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) { campaignNameCache.set(campaignId, null); return null }
    const data = (await res.json()) as CampaignDetail
    const name = data.name ?? null
    campaignNameCache.set(campaignId, name)
    return name
  } catch {
    campaignNameCache.set(campaignId, null)
    return null
  }
}

// ─── getContactClickThemes ────────────────────────────────────────────────────

/**
 * Fetch all CLICK events for a contact (360 days) and aggregate by theme.
 * Uses /email/public/v1/events?type=CLICK&recipient={email}.
 * Returns only themes with >= 3 clicks, sorted by clicks desc.
 */
export async function getContactClickThemes(email: string): Promise<ContactClickThemes> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN is not set')

  const sinceMs = Date.now() - DAYS_360_MS
  const campaignClickMap = new Map<number, { count: number; lastClick: number }>()

  let offset: string | undefined

  do {
    const url = new URL(`${HUBSPOT_BASE_URL}/email/public/v1/events`)
    url.searchParams.set('type', 'CLICK')
    url.searchParams.set('recipient', email)
    url.searchParams.set('limit', '100')
    if (offset) url.searchParams.set('offset', offset)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) break

    const data = (await res.json()) as EventsPage
    let hitOldEvent = false

    for (const event of data.events ?? []) {
      if (event.created < sinceMs) { hitOldEvent = true; break }
      if (event.type !== 'CLICK' || !event.emailCampaignId) continue

      const existing = campaignClickMap.get(event.emailCampaignId)
      if (existing) {
        existing.count++
        if (event.created > existing.lastClick) existing.lastClick = event.created
      } else {
        campaignClickMap.set(event.emailCampaignId, { count: 1, lastClick: event.created })
      }
    }

    if (hitOldEvent) break
    offset = data.hasMore ? data.offset : undefined
  } while (offset)

  // Resolve campaign IDs → names → themes
  const themeMap = new Map<string, { clicks: number; lastClick: number }>()

  for (const [campaignId, { count, lastClick }] of campaignClickMap) {
    const name = await fetchCampaignName(campaignId, token)
    if (!name) continue

    const { theme } = parseEmailName(name)
    if (!theme || theme === 'Sans thème' || theme === 'Newsletter') continue

    const existing = themeMap.get(theme)
    if (existing) {
      existing.clicks += count
      if (lastClick > existing.lastClick) existing.lastClick = lastClick
    } else {
      themeMap.set(theme, { clicks: count, lastClick })
    }
  }

  const themes: ThemeCount[] = [...themeMap.entries()]
    .filter(([, { clicks }]) => clicks >= 3)
    .map(([theme, { clicks, lastClick }]) => ({
      theme,
      clicks,
      lastClick: new Date(lastClick).toISOString(),
    }))
    .sort((a, b) => b.clicks - a.clicks)

  return { email: email.toLowerCase(), contactId: '', totalClicks: 0, themes }
}

// ─── syncAllTopClickers ───────────────────────────────────────────────────────

const HUBSPOT_SEARCH_CAP = 10_000 // HubSpot CRM v3 search hard limit
const DEFAULT_BATCH_SIZE = 150
const LOCK_TTL_MS = 5 * 60_000 // 5 minutes — safety net for crashed runs

interface SyncCursorRow {
  id: string
  current_offset: number
  total_contacts: number
  last_run_at: string
  full_cycle_completed_at: string | null
  locked_until: string | null
}

/**
 * Paginated sync with cursor + double-run protection.
 *
 * Flow:
 *  1. Atomic UPDATE on sync_cursor to acquire a 5-min lock AND read the row.
 *  2. On Supabase error → log warning, proceed with offset=0 and no lock
 *     (cron must run even if cursor is temporarily unreadable).
 *  3. On 0 rows affected → another run holds the lock → return early.
 *  4. Fetch next window from HubSpot, sync contacts.
 *  5. Final upsert advances offset + releases lock (locked_until = NULL).
 *  6. finally: safety net release if the run crashed before step 5.
 *
 * @param onProgress    Optional callback for real-time log messages.
 * @param batchOverride Optional batch size override (for testing).
 */
export async function syncAllTopClickers(
  onProgress?: (msg: string) => void,
  batchOverride?: number
): Promise<SyncResult> {
  const start = Date.now()

  const token = process.env.HUBSPOT_ACCESS_TOKEN
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN is not set')

  const supabase = createSupabaseAdmin()
  campaignNameCache.clear()

  // ── 1. Acquire lock + read cursor (combined atomic UPDATE ... RETURNING) ──
  const nowIso = new Date().toISOString()
  const lockUntilIso = new Date(Date.now() + LOCK_TTL_MS).toISOString()

  const { data: lockRows, error: lockErr } = await supabase
    .from('sync_cursor')
    .update({ locked_until: lockUntilIso })
    .eq('id', 'main')
    .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
    .select()

  let startOffset = 0
  let previousFullCycleAt: string | null = null
  let lockAcquired = false

  if (lockErr) {
    onProgress?.(`[sync] ⚠ Curseur illisible, fallback offset=0 (err: ${lockErr.message})`)
  } else if (!lockRows || lockRows.length === 0) {
    onProgress?.('[sync] Run déjà en cours, skip')
    return {
      synced: 0,
      errors: 0,
      duration: Date.now() - start,
      startOffset: 0,
      endOffset: 0,
      totalContacts: 0,
      fullCycleCompleted: false,
      skipped: true,
    }
  } else {
    const row = lockRows[0] as SyncCursorRow
    startOffset = row.current_offset ?? 0
    previousFullCycleAt = row.full_cycle_completed_at
    lockAcquired = true
  }

  try {
    // ── 2. Refresh total from HubSpot ─────────────────────────────────────
    onProgress?.('[sync] Récupération du total HubSpot...')
    const total = await getTotalClickersCount()
    const effectiveTotal = Math.min(total, HUBSPOT_SEARCH_CAP)

    // ── 3. Compute batch window ───────────────────────────────────────────
    const batchSize = batchOverride ?? DEFAULT_BATCH_SIZE
    const remaining = Math.max(0, effectiveTotal - startOffset)
    const limit = Math.min(batchSize, remaining)

    // Reset path — cursor has reached (or passed) the cap
    if (limit === 0) {
      onProgress?.(
        `[sync] Fin de cycle (offset=${startOffset}, cap=${effectiveTotal}) — reset à 0`
      )
      const resetIso = new Date().toISOString()
      await supabase.from('sync_cursor').upsert({
        id: 'main',
        current_offset: 0,
        total_contacts: total,
        last_run_at: resetIso,
        full_cycle_completed_at: resetIso,
        locked_until: null,
      })
      lockAcquired = false // released via upsert above
      return {
        synced: 0,
        errors: 0,
        duration: Date.now() - start,
        startOffset,
        endOffset: 0,
        totalContacts: total,
        fullCycleCompleted: true,
        skipped: false,
      }
    }

    // ── 4. Fetch contact window ───────────────────────────────────────────
    const runNumber = Math.floor(startOffset / DEFAULT_BATCH_SIZE) + 1
    onProgress?.(
      `[sync] Run ${runNumber} — contacts ${startOffset + 1}-${startOffset + limit} / ${total}`
    )

    const clickers = await getTopClickers(360, limit, startOffset)
    onProgress?.(`[sync] ${clickers.length} contacts récupérés`)

    onProgress?.('[sync] Récupération des inscriptions Airtable...')
    const emails = clickers.map((c) => c.emailAddress)
    const inscriptionsMap = await getInscriptionsByEmail(emails)
    onProgress?.('[sync] Inscriptions chargées — démarrage de la sync contact par contact')

    // ── 5. Process contact ───────────────────────────────────────────────
    let synced = 0
    let errors = 0

    for (let i = 0; i < clickers.length; i++) {
      const contact = clickers[i]
      onProgress?.(`Contact ${i + 1}/${clickers.length} — ${contact.emailAddress}`)

      try {
        const clickThemes = await getContactClickThemes(contact.emailAddress)
        const inscriptions = inscriptionsMap.get(contact.emailAddress.toLowerCase()) ?? []
        const isInscrit = inscriptions.length > 0

        const row = {
          email:          contact.emailAddress.toLowerCase(),
          contact_id:     String(contact.contactId),
          total_clicks:   contact.totalClicks,
          themes:         clickThemes.themes,
          is_inscrit:     isInscrit,
          inscriptions:   inscriptions.map((ins) => ({
            nomFormation: ins.nomFormation,
            specialite:   ins.specialite,
            dateCreation: ins.dateCreation,
          })),
          last_synced_at: new Date().toISOString(),
        }

        const { error } = await supabase
          .from('contact_click_themes')
          .upsert(row, { onConflict: 'email' })

        if (error) throw new Error(error.message)

        synced++
        onProgress?.(`  → OK — ${clickThemes.themes.length} thème(s) — inscrit=${isInscrit}`)
      } catch (err) {
        errors++
        onProgress?.(`  → ERREUR — ${err instanceof Error ? err.message : String(err)}`)
      }

      // 150ms between contacts to stay under HubSpot v1 rate limit (100 req/10s)
      if (i < clickers.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
    }

    // ── 6. Advance cursor + release lock (single atomic upsert) ───────────
    const newOffset = startOffset + clickers.length
    const fullCycle = newOffset >= effectiveTotal
    const endIso = new Date().toISOString()

    const cursorUpdate = {
      id: 'main',
      current_offset: fullCycle ? 0 : newOffset,
      total_contacts: total,
      last_run_at: endIso,
      full_cycle_completed_at: fullCycle ? endIso : previousFullCycleAt,
      locked_until: null,
    }

    const { error: updateErr } = await supabase.from('sync_cursor').upsert(cursorUpdate)
    if (updateErr) {
      onProgress?.(`[sync] ⚠ Mise à jour curseur échouée — ${updateErr.message}`)
    } else {
      lockAcquired = false // released successfully
    }

    const duration = Date.now() - start
    if (fullCycle) onProgress?.(`[sync] Cycle complet terminé — reset cursor à 0`)
    onProgress?.(
      `[sync] Terminé — ${synced} synced, ${errors} errors, ${(duration / 1000).toFixed(1)}s`
    )

    return {
      synced,
      errors,
      duration,
      startOffset,
      endOffset: cursorUpdate.current_offset,
      totalContacts: total,
      fullCycleCompleted: fullCycle,
      skipped: false,
    }
  } finally {
    // Safety net: release lock if sync crashed before final upsert
    if (lockAcquired) {
      await supabase
        .from('sync_cursor')
        .update({ locked_until: null })
        .eq('id', 'main')
        .then(
          () => {},
          () => {} // swallow — release is best-effort
        )
    }
  }
}
