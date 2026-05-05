import { getInscriptionsByEmail } from '@/lib/airtable'
import type { Inscription } from '@/lib/airtable'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailType = 'CV' | 'PRES' | 'EL' | 'WEBINAIRE' | 'NEWSLETTER' | 'AUTRE'
export type Qualifier = 'prospect' | 'client' | null
export type SubType = 'confirmation' | 'jour-j' | 'j-2' | 'replay' | null

export const EMAIL_TYPE_LABELS: Record<EmailType, string> = {
  CV: 'Classe virtuelle',
  PRES: 'Présentiel',
  EL: 'E-learning',
  WEBINAIRE: 'Webinaire',
  NEWSLETTER: 'Newsletter',
  AUTRE: 'Autre',
}

export interface ParsedCampaignName {
  type: EmailType
  audiences: string[]
  qualifier: Qualifier
  edition: string | null
  theme: string
  isABTest: boolean
  envoi: number | null
  periode: string | null
  subType: SubType
  kind: 'dpc' | 'webinaire' | 'newsletter' | 'commercial' | 'unknown'
}

export interface HubSpotCampaignRaw {
  id: string
  properties: {
    hs_name?: string | null
    hs_start_date?: string | null
    hs_end_date?: string | null
  }
  createdAt: string
  updatedAt: string
}

export interface Campaign extends ParsedCampaignName {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  createdAt: string
  updatedAt: string
}

export interface MarketingEmail extends ParsedCampaignName {
  id: string
  name: string
  subject: string | null
  /** ISO date de l'envoi (scheduledAt v1) */
  sentAt: string | null
  status: string | null
  clicks: number
  opens: number
  delivered: number
  sent: number
  /** Taux d'ouvertures en % (opens / delivered * 100), null si delivered = 0 */
  openRate: number | null
  /** Taux de clic en % (clicks / delivered * 100), null si delivered = 0 */
  clickRate: number | null
}

interface HubSpotListResponse<T> {
  total?: number
  results: T[]
  paging?: {
    next?: {
      after: string
    }
  }
}

// v1 email campaigns API types
interface HubSpotV1CampaignListItem {
  id: number
  lastUpdatedTime: number
  appId: number
  appName: string
}

interface HubSpotV1CampaignListResponse {
  campaigns: HubSpotV1CampaignListItem[]
  hasMore: boolean
  offset?: string
}

interface HubSpotV1CampaignDetail {
  id: number
  groupId?: number
  contentId?: number
  appId?: number
  appName?: string
  name?: string
  subject?: string
  /** Unix timestamp ms — date d'envoi planifiée */
  scheduledAt?: number
  type?: string
  subType?: string
  processingState?: string
  counters?: {
    sent?: number
    delivered?: number
    click?: number
    open?: number
    bounce?: number
    unsubscribed?: number
    dropped?: number
    spamreport?: number
    deferred?: number
  }
}

// ─── HubSpot client ───────────────────────────────────────────────────────────

const HUBSPOT_BASE_URL = 'https://api.hubapi.com'

interface FetchOptions {
  /** Next.js ISR revalidation in seconds. Omit for no-store. */
  revalidate?: number
}

async function hubspotFetch<T>(
  path: string,
  params: Record<string, string> = {},
  options: FetchOptions = {}
): Promise<T> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN is not set')

  const url = new URL(`${HUBSPOT_BASE_URL}${path}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const nextOptions =
    options.revalidate !== undefined
      ? { next: { revalidate: options.revalidate } }
      : { cache: 'no-store' as const }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...nextOptions,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`HubSpot API error ${res.status}: ${body}`)
  }

  return res.json() as Promise<T>
}

// ─── Audience detection ───────────────────────────────────────────────────────

const KNOWN_AUDIENCES = ['MG', 'CD', 'MK', 'SF', 'PSY', 'PED', 'GYN', 'PLURIPRO']

/**
 * Scan a raw email name for known audience codes using word boundaries.
 * Returns ['AUTRE'] if none detected.
 */
function detectAudiencesFromName(name: string): string[] {
  const upper = name.toUpperCase()
  const found = KNOWN_AUDIENCES.filter((a) => new RegExp(`\\b${a}\\b`).test(upper))
  return found.length > 0 ? found : ['AUTRE']
}

// ─── Theme normalization ──────────────────────────────────────────────────────

const COMMERCIAL_PATTERNS: RegExp[] = [
  /black\s*friday/i,
  /flash\s*sales?/i,
  /saint.?valentin/i,
  /\boffre\b/i,
  /fin\s+d.ann[eé]e/i,
  /budget/i,
  /confirmation/i,
  /ouverture\s+budget/i,
  // Lead magnets / engagement commercial / offres groupées
  /livre\s*blanc/i,
  /^quizz?\s/i,
  /^\d+\s+formations?/i,
  /^\(\d+\s+formations?\)/i,
  /^dangers$/i,
  // Rappels marketing (J-2, J-8, J-23…) — pas des formations
  /^Rappel\s+J[+-]?\d+/i,
]

function isCommercial(rawName: string): boolean {
  return COMMERCIAL_PATTERNS.some((re) => re.test(rawName))
}

/**
 * Mapping de dédoublonnage des variantes HubSpot vers un nom canonique.
 * Clés en lowercase. Lookup : THEME_ALIASES[result.toLowerCase()] ?? result.
 * Le fallback (?? result) garde le thème tel quel si non mappé — pas de perte.
 */
const THEME_ALIASES: Record<string, string> = {
  // Endocrinien
  'perturbateur endo':              'Perturbateurs endocriniens',
  'perturbateur endocr':            'Perturbateurs endocriniens',
  'perturbateur endocr.':           'Perturbateurs endocriniens',
  'perturbateurs endo':             'Perturbateurs endocriniens',
  'perturbateurs endocriniens':     'Perturbateurs endocriniens',

  // Sommeil
  'sommeil':                        'Troubles du sommeil',
  'troubles du sommeil':            'Troubles du sommeil',
  'sommeil de l\'enfant':           'Troubles du sommeil de l\'enfant',
  'troubles du sommeil de l\'enfant': 'Troubles du sommeil de l\'enfant',

  // Neuro / TDAH
  'tdah':                           'TDAH',
  'neurodéveloppement':             'TDAH',
  'trouble du neurodéveloppement':  'TDAH',

  // Cardio
  'hta':                            'Hypertension artérielle',
  'hypertension artérielle':        'Hypertension artérielle',
  'ecg':                            'Électrocardiogramme',
  'électrocardiogramme':            'Électrocardiogramme',
  'electrocardiogramme':            'Électrocardiogramme',

  // Diabète (variantes type 2 explicite uniquement — pas de mapping racine)
  'diabète de type 2':              'Diabète de type 2',
  'diabète de type ii':             'Diabète de type 2',

  // Dermato
  'dermatoscopie':                  'Dermoscopie',
  'dermoscopie':                    'Dermoscopie',
  'cancers cutanés':                'Cancers cutanés',
  'red flags en dermatologie':      'Red flags dermatologie',

  // Endométriose
  'endométriose':                   'Endométriose',

  // IST
  'ist':                            'IST',
  'infections sexuellement transmissibles': 'IST',

  // Pédiatrie / Sage-femme
  'pathologies de l\'épaule':       'Pathologies de l\'épaule',

  // Addictions (pas de mapping racine — 'Addictions' reste distinct)
  'cannabis':                       'Cannabis',
  'addictions et santé mentale':    'Addictions et santé mentale',
  'chemsex':                        'Addiction/chemsex',
  'addiction/chemsex':              'Addiction/chemsex',

  // Psychiatrie
  'bipolaires':                     'Troubles bipolaires',
  'troubles bipolaires':            'Troubles bipolaires',
  'burn out':                       'Burn out',
  'burnout':                        'Burn out',
  'épuisement professionnel':       'Burn out',

  // Mode de vie
  'méditation':                     'Méditation pleine conscience',
  'méditation de pleine conscience': 'Méditation pleine conscience',
  'covid long':                     'COVID long',

  // Vaccination
  'vaccination':                    'Vaccination',

  // Parkinson
  'parkinson':                      'Maladie de Parkinson',
  'maladie de parkinson':           'Maladie de Parkinson',

  // Dentaire
  'cone beam ct':                   'Cone Beam CT',
  'cbct':                           'Cone Beam CT',
  'implantologie':                  'Implantologie',
  'inlays':                         'Inlays / Onlays',
  'onlays':                         'Inlays / Onlays',
  'inlays / onlays':                'Inlays / Onlays',
  'inlays / onlays / overlays':     'Inlays / Onlays',
  'bruxisme':                       'Bruxismes',
  'bruxismes':                      'Bruxismes',
  'maladies parodontales':          'Maladies parodontales',
  'prothèses amovibles complètes':  'Prothèses Amovibles Complètes',
  'dermatologie buccale':           'Dermatologie buccale',
  'retraitement endodontique':      'Endodontie',
  'endodontie':                     'Endodontie',

  // Métier
  'téléconsultation':               'Téléconsultation',

  // Cotation (formation interne, pas dans Airtable)
  'cotation mg 2026':               'Cotation MG 2026',

  // Plaies / soins infirmiers
  'bilan de plaie':                 'Bilan de plaies',
  'bilan de plaies':                'Bilan de plaies',
  'bilan de soins infirmiers':      'Bilan de soins infirmiers',
}

/**
 * Nettoyage agressif du nom de thème : strip préfixes (dates, RM, Suivi, DPC),
 * strip suffixes (envoi, Cloner, Variation, Relance), normalise whitespace,
 * puis lookup dans THEME_ALIASES pour dédoublonner les variantes connues.
 * À appliquer en sortie de chaque branche de parseEmailName.
 */
export function normalizeTheme(raw: string): string {
  let s = raw

  // ── Strip préfixes ──────────────────────────────────────────────────────
  s = s.replace(/^\d{4,8}[\s_]+/, '')
  s = s.replace(/^Suivi[\s-]+/i, '')
  s = s.replace(/^(?:EL|CV|PRES)[/\s-]+(?:MG|CD|MK|SF|PSY|PED|GYN|PLURIPRO)?[\s-]*/i, '')
  // Rappel d'édition (RM6 RAPPEL J-2…) — pas un thème, vide → "Sans thème"
  if (/^RM\s*\d+\s+RAPPEL\b/i.test(s)) return ''
  // Synthèse d'édition (RM6 SYNTHESE Troubles bipolaires) — strip le préfixe
  s = s.replace(/^RM\s*\d+\s+SYNTH[ÈE]SE\s+/i, '')
  s = s.replace(/^RM\s*\d+\s*[-—]\s*/i, '')
  // RM\d+ orphelin sans thème (PRES - CD - RM 6) → vide → "Sans thème"
  s = s.replace(/^RM\s*\d+\s*$/i, '')
  s = s.replace(/^(?:Primo\s+inscrits|Version\s+\w+)\s*[-:]\s*/i, '')

  // ── Strip suffixes ──────────────────────────────────────────────────────
  s = s.replace(/\(\s*\d+\s*[eè](?:me|re|r)?\s+envoi[^)]*\)/gi, '')
  s = s.replace(/\(\s*[Cc]loner?\s*\)/g, '')
  s = s.replace(/\(\s*[Cc]op(?:y|ie)\s*\)/g, '')
  s = s.replace(/\(\s*[Vv]ariation\s*\)/g, '')
  s = s.replace(/\b[Rr]elance\s*$/, '')
  s = s.replace(/\(\s*$/, '')          // parenthèse orpheline en fin
  s = s.replace(/\s*[-—]\s*$/, '')     // tiret orphelin en fin

  // ── Normalisation finale ────────────────────────────────────────────────
  s = s.replace(/\s+/g, ' ').trim()
  if (s.length === 0) return ''
  const capitalized = s.charAt(0).toUpperCase() + s.slice(1)

  // ── Lookup alias (dédoublonnage variantes connues) ──────────────────────
  return THEME_ALIASES[capitalized.toLowerCase()] ?? capitalized
}

// ─── parseEmailName ───────────────────────────────────────────────────────────

/**
 * Parse a HubSpot email name following Médéré naming conventions.
 *
 * Pattern 1 — DPC/Formations:
 *   [(A) ]CV|PRES|EL - AUDIENCE[/AUDIENCE][(qualificateur)] [ - EDITION] - THEME [(Xème envoi MMAAAA)]
 *
 * Pattern 2 — Webinaires:
 *   AAAAMM_Webinaire · THEME [ · SOUS-TYPE]
 *
 * Pattern 3 — Newsletters:
 *   Newsletter #N · AAAAMM · AUDIENCE
 *
 * Pattern 4 — Autres / non reconnus:
 *   AAAAMM_NOM ou format libre
 *
 * Le `kind` retourné permet à sync.ts de filtrer les campagnes hors-DPC.
 */
export function parseEmailName(name: string): ParsedCampaignName {
  const trimmed = name.trim()

  // ── Commercial check (priorité maximale, override les autres patterns) ──
  if (isCommercial(trimmed)) {
    return {
      type: 'AUTRE',
      audiences: detectAudiencesFromName(trimmed),
      qualifier: null,
      edition: null,
      theme: normalizeTheme(trimmed),
      isABTest: false,
      envoi: null,
      periode: null,
      subType: null,
      kind: 'commercial',
    }
  }

  // ── Pattern 2 — Webinaire DPC (avec ·) ──────────────────────────────────
  if (/webinaire/i.test(trimmed) && trimmed.includes('·')) {
    const parts = trimmed.split('·').map((p) => p.trim())
    // parts[0] = "2603_Webinaire" | "Webinaire", parts[1] = theme, parts[2] = sous-type
    const rawTheme = parts[1] ?? ''
    const rawSubType = (parts[2] ?? '').toLowerCase()

    let subType: SubType = null
    if (rawSubType.includes('confirmation')) subType = 'confirmation'
    else if (rawSubType.includes('jour j') || rawSubType === 'jour j') subType = 'jour-j'
    else if (rawSubType.includes('j-2')) subType = 'j-2'
    else if (rawSubType.includes('replay')) subType = 'replay'

    const theme = rawTheme ? normalizeTheme(rawTheme) : 'Webinaire'

    return {
      type: 'WEBINAIRE',
      audiences: detectAudiencesFromName(trimmed),
      qualifier: null,
      edition: null,
      theme,
      isABTest: false,
      envoi: null,
      periode: null,
      subType,
      kind: 'dpc',
    }
  }

  // ── Pattern 3 — Newsletter ──────────────────────────────────────────────
  if (/^newsletter/i.test(trimmed)) {
    // "Newsletter #21 · 260308 · CD" — audience is the last ·-segment
    const parts = trimmed.split('·').map((p) => p.trim())
    const lastPart = parts[parts.length - 1] ?? ''
    const audiences =
      lastPart && !/^\d+$/.test(lastPart)
        ? [lastPart.toUpperCase()]
        : detectAudiencesFromName(trimmed)

    return {
      type: 'NEWSLETTER',
      audiences,
      qualifier: null,
      edition: null,
      theme: 'Newsletter',
      isABTest: false,
      envoi: null,
      periode: null,
      subType: null,
      kind: 'newsletter',
    }
  }

  // ── Pattern 1 — DPC/Formations (CV | PRES | EL) ─────────────────────────
  const isDPC = /^(?:\(A\)\s*)?(?:CV|PRES|EL)\s*-/i.test(trimmed)

  if (isDPC) {
    let working = trimmed

    // 1. A/B test prefix
    const isABTest = /^\(A\)\s*/i.test(working)
    if (isABTest) working = working.replace(/^\(A\)\s*/i, '').trim()

    // 2. Extract envoi + periode from end — handles "3ème envoi 032026" and "3ème envoi - 032026"
    let envoi: number | null = null
    let periode: string | null = null
    const envoiMatch = working.match(
      /\((\d+)\s*[eè](?:me|re|r)?\s+envoi\s*(?:-\s*)?(\d{6})\)\s*$/i
    )
    if (envoiMatch) {
      envoi = parseInt(envoiMatch[1], 10)
      periode = envoiMatch[2]
      working = working.slice(0, envoiMatch.index).trim()
    }

    // 3. Split by " - "
    const parts = working
      .split(/\s+-\s+/)
      .map((p) => p.trim())
      .filter(Boolean)

    // 4. Type (first segment)
    const rawType = parts[0]?.toUpperCase() ?? ''
    const type: EmailType =
      rawType === 'CV' ? 'CV' : rawType === 'PRES' ? 'PRES' : rawType === 'EL' ? 'EL' : 'AUTRE'

    // 5. Audience segment: "MG/PSY/PED" | "CD (Clients)" | "GYN/SF"
    const audienceSegment = parts[1] ?? ''

    let qualifier: Qualifier = null
    const qualMatch = audienceSegment.match(/\((clients?|prospects?)\)/i)
    if (qualMatch) {
      qualifier = qualMatch[1].toLowerCase().startsWith('client') ? 'client' : 'prospect'
    }

    const cleanedAudience = audienceSegment.replace(/\s*\([^)]+\)/g, '').trim()
    const audiences = cleanedAudience
      .split('/')
      .map((a) => a.trim().toUpperCase())
      .filter(Boolean)

    // 6. Edition + theme from remaining segments
    const remaining = parts.slice(2)
    let edition: string | null = null
    let theme = 'Sans thème'

    if (remaining.length > 0) {
      // Edition can be "RM7" alone or "RM8 (Agressivité)" — theme in parens
      const editionMatch = remaining[0].match(/^(RM\s*\d+)(?:\s+\(([^)]+)\))?$/)
      if (editionMatch) {
        edition = editionMatch[1].replace(/\s+/g, '')
        const themeFromEdition = editionMatch[2] ?? null
        const afterEdition = remaining.slice(1).join(' - ')
        const raw = themeFromEdition ?? afterEdition
        theme = raw ? (normalizeTheme(raw) || 'Sans thème') : 'Sans thème'
      } else {
        const raw = remaining.join(' - ')
        theme = raw ? (normalizeTheme(raw) || 'Sans thème') : 'Sans thème'
      }
    }

    return { type, audiences, qualifier, edition, theme, isABTest, envoi, periode, subType: null, kind: 'dpc' }
  }

  // ── Pattern 4 — Autre (fallback) ────────────────────────────────────────
  const raw = trimmed.replace(/_/g, ' ').trim()
  const theme = raw ? normalizeTheme(raw) : trimmed
  const isWebinaire = /webinaire/i.test(trimmed)

  return {
    type: 'AUTRE',
    audiences: detectAudiencesFromName(trimmed),
    qualifier: null,
    edition: null,
    theme,
    isABTest: false,
    envoi: null,
    periode: null,
    subType: null,
    kind: isWebinaire ? 'webinaire' : 'unknown',
  }
}

// ─── getCampaigns ─────────────────────────────────────────────────────────────

/**
 * Fetch all marketing campaign groups from HubSpot.
 * Requires scope: marketing.campaigns.read
 */
export async function getCampaigns(days: 7 | 28 | 90 | 360): Promise<Campaign[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const sinceIso = since.toISOString()

  const allRaw: HubSpotCampaignRaw[] = []
  let after: string | undefined

  do {
    const params: Record<string, string> = {
      limit: '100',
      properties: 'hs_name,hs_start_date,hs_end_date',
      ...(after ? { after } : {}),
    }

    const page = await hubspotFetch<HubSpotListResponse<HubSpotCampaignRaw>>(
      '/marketing/v3/campaigns',
      params,
      { revalidate: 300 }
    )

    allRaw.push(...page.results)
    after = page.paging?.next?.after
  } while (after)

  const filtered = allRaw.filter((c) => c.updatedAt >= sinceIso)

  return filtered.map((c) => {
    const name = c.properties.hs_name?.trim() || 'Sans nom'
    return {
      id: c.id,
      name,
      startDate: c.properties.hs_start_date ?? null,
      endDate: c.properties.hs_end_date ?? null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      ...parseEmailName(name),
    }
  })
}

// ─── getMarketingEmails ───────────────────────────────────────────────────────

/**
 * NOTE — architecture des appels HubSpot :
 *  - GET /email/public/v1/campaigns?limit=100 (liste) retourne uniquement
 *    id, lastUpdatedTime, appId, appName — sans name ni counters.
 *  - GET /email/public/v1/campaigns/{id} (detail) est obligatoire pour
 *    obtenir name + counters.click + counters.open + counters.delivered.
 *
 * On minimise le nombre de batches séquentiels en passant de 10 à 50
 * appels parallèles par batch (~5 batches au lieu de ~24 pour 250 emails).
 * Le { revalidate: 300 } sur chaque appel assure que les appels suivants
 * dans la même fenêtre de 5 min sont servis depuis le cache Next.js.
 */
const DETAIL_BATCH_SIZE = 50

/**
 * Fetch sent email campaigns from HubSpot v1 API with real click/open stats.
 *
 * Strategy:
 *  1. List /email/public/v1/campaigns (sorted by lastUpdatedTime DESC) until
 *     lastUpdatedTime drops below the since threshold — early termination.
 *  2. Batch-fetch campaign details (50 at a time) to get name + counters.
 *  3. Re-filter by scheduledAt >= since for accurate date scoping.
 */
export async function getMarketingEmails(
  days: 7 | 28 | 90 | 360
): Promise<MarketingEmail[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const sinceMs = since.getTime()

  // ── Step 1 : collect campaign IDs from list endpoint ──────────────────────
  const ids: number[] = []
  let offset: string | undefined
  let keepPaging = true

  while (keepPaging) {
    const params: Record<string, string> = { limit: '100' }
    if (offset) params.offset = offset

    const page = await hubspotFetch<HubSpotV1CampaignListResponse>(
      '/email/public/v1/campaigns',
      params,
      { revalidate: 300 }
    )

    for (const c of page.campaigns) {
      if (c.lastUpdatedTime < sinceMs) {
        // List is sorted DESC — everything after this point is older
        keepPaging = false
        break
      }
      ids.push(c.id)
    }

    if (!page.hasMore) keepPaging = false
    offset = page.offset
  }

  // ── Step 2 : batch-fetch details ──────────────────────────────────────────
  const details: HubSpotV1CampaignDetail[] = []
  for (let i = 0; i < ids.length; i += DETAIL_BATCH_SIZE) {
    const batch = ids.slice(i, i + DETAIL_BATCH_SIZE)
    const batchDetails = await Promise.all(
      batch.map((id) =>
        hubspotFetch<HubSpotV1CampaignDetail>(
          `/email/public/v1/campaigns/${id}`,
          {},
          { revalidate: 300 }
        ).catch(() => null)
      )
    )
    for (const d of batchDetails) {
      if (d !== null) details.push(d)
    }
  }

  // ── Step 3 : map to MarketingEmail ────────────────────────────────────────
  const emails: MarketingEmail[] = []

  for (const detail of details) {
    // Re-filter by scheduledAt when available (more accurate than lastUpdatedTime)
    if (detail.scheduledAt && detail.scheduledAt > 0 && detail.scheduledAt < sinceMs) continue

    const name = (detail.name ?? '').trim() || 'Sans nom'
    const parsed = parseEmailName(name)

    const clicks = detail.counters?.click ?? 0
    const opens = detail.counters?.open ?? 0
    const delivered = detail.counters?.delivered ?? 0
    const sent = detail.counters?.sent ?? 0

    const openRate = delivered > 0 ? (opens / delivered) * 100 : null
    const clickRate = delivered > 0 ? (clicks / delivered) * 100 : null

    // A/B test: detected by appName OR by (A) prefix in name
    const isABTest = detail.appName === 'AbBatch' || parsed.isABTest

    emails.push({
      id: String(detail.id),
      name,
      subject: detail.subject ?? null,
      sentAt: detail.scheduledAt ? new Date(detail.scheduledAt).toISOString() : null,
      status: detail.processingState ?? detail.type ?? null,
      clicks,
      opens,
      delivered,
      sent,
      openRate,
      clickRate,
      ...parsed,
      isABTest,
    })
  }

  return emails
}

// ─── getTotalClickersCount ────────────────────────────────────────────────────

/**
 * Returns total count of HubSpot contacts with hs_email_click > 0.
 * Uses a single search request with limit=1 to read `data.total`.
 */
export async function getTotalClickersCount(): Promise<number> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN is not set')

  const res = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filterGroups: [
        { filters: [{ propertyName: 'hs_email_click', operator: 'GT', value: '0' }] },
      ],
      limit: 1,
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HubSpot CRM count error ${res.status}: ${text}`)
  }

  const data = (await res.json()) as { total: number }
  return data.total
}

// ─── getTopClickers ───────────────────────────────────────────────────────────

export interface TopClicker {
  contactId: number
  emailAddress: string
  /** Lifetime total — hs_email_click (non filtrable par période via CRM API) */
  totalClicks: number
  totalOpens: number
  totalDelivered: number
  openRate: number | null
}

interface CrmContactSearchResult {
  id: string
  properties: {
    email: string | null
    hs_email_click: string | null
    hs_email_open: string | null
    hs_email_delivered: string | null
  }
}

interface CrmContactSearchResponse {
  total: number
  results: CrmContactSearchResult[]
  paging?: { next?: { after: string } }
}

/**
 * Fetch a window of contacts ranked by lifetime email clicks.
 *
 * Pagination:
 *  - `limit`  = total number of contacts to return (default 150).
 *  - `offset` = starting position, passed as the initial `after` cursor.
 *    HubSpot CRM search treats `after` as a numeric offset in practice,
 *    though the docs call it an opaque cursor. Each returned `after` is
 *    validated as numeric — any non-numeric value indicates an API change
 *    and aborts pagination with a warning.
 *
 * IMPORTANT: HubSpot CRM v3 search caps pagination at offset 10 000.
 * The caller is responsible for keeping offset + limit <= 10 000.
 */
export async function getTopClickers(
  _days: 7 | 28 | 90 | 360,
  limit: number = 150,
  offset: number = 0
): Promise<TopClicker[]> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN is not set')

  const results: TopClicker[] = []
  const PAGE_SIZE = 100 // HubSpot CRM search hard max per request
  let after: string | undefined = offset > 0 ? String(offset) : undefined

  while (results.length < limit) {
    const remaining = limit - results.length
    const pageLimit = Math.min(PAGE_SIZE, remaining)

    const payload = {
      filterGroups: [
        { filters: [{ propertyName: 'hs_email_click', operator: 'GT', value: '0' }] },
      ],
      sorts: [{ propertyName: 'hs_email_click', direction: 'DESCENDING' }],
      properties: ['email', 'hs_email_click', 'hs_email_open', 'hs_email_delivered'],
      limit: pageLimit,
      ...(after ? { after } : {}),
    }

    const res = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      next: { revalidate: 300 },
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`HubSpot CRM search error ${res.status}: ${text}`)
    }

    const data = (await res.json()) as CrmContactSearchResponse

    for (const c of data.results) {
      const email = c.properties.email
      if (!email) continue
      const clicks    = parseInt(c.properties.hs_email_click    ?? '0', 10)
      const opens     = parseInt(c.properties.hs_email_open     ?? '0', 10)
      const delivered = parseInt(c.properties.hs_email_delivered ?? '0', 10)
      results.push({
        contactId:      parseInt(c.id, 10),
        emailAddress:   email,
        totalClicks:    clicks,
        totalOpens:     opens,
        totalDelivered: delivered,
        openRate: delivered > 0 ? (opens / delivered) * 100 : null,
      })
    }

    const nextAfter = data.paging?.next?.after
    if (!nextAfter) break

    // Safety: detect HubSpot API change — after must be a numeric offset
    if (!/^\d+$/.test(nextAfter)) {
      console.warn(`[hubspot] ⚠ after cursor non numérique: ${nextAfter}`)
      break
    }

    after = nextAfter
  }

  return results.slice(0, limit)
}

// ─── getTopClickersEnriched ───────────────────────────────────────────────────

export interface EnrichedTopClicker extends TopClicker {
  inscriptions: Inscription[]
  isInscrit: boolean
  nbInscriptions: number
}

/**
 * Enrich top 100 HubSpot clickers with Airtable inscription data.
 *
 * Uses targeted Airtable queries (10 emails per batch) instead of fetching
 * all 22k+ records — total Airtable calls ≤ 10 for 100 contacts.
 */
export async function getTopClickersEnriched(
  days: 7 | 28 | 90 | 360
): Promise<EnrichedTopClicker[]> {
  const topClickers = await getTopClickers(days, 100, 0)
  const emails = topClickers.map((c) => c.emailAddress)
  const inscriptionsMap = await getInscriptionsByEmail(emails)

  return topClickers.map((contact) => {
    const inscriptions = inscriptionsMap.get(contact.emailAddress.toLowerCase()) ?? []
    return {
      ...contact,
      inscriptions,
      isInscrit:       inscriptions.length > 0,
      nbInscriptions:  inscriptions.length,
    }
  })
}
