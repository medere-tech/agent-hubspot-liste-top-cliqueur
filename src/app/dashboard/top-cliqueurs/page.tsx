'use client'

import type { EnrichedTopClicker, MarketingEmail } from '@/lib/hubspot'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number]

type Period = 7 | 28 | 90 | 360
type Segment = 'all' | 'inscrits' | 'non_inscrits'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CampaignsApiResponse {
  emails: { data: MarketingEmail[] }
}

interface ApiResponse {
  days: number
  count: number
  contacts: EnrichedTopClicker[]
  segments: {
    inscrits: EnrichedTopClicker[]
    non_inscrits_engages: EnrichedTopClicker[]
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNumber(n: number): string {
  return n.toLocaleString('fr-FR')
}

function fmtRate(rate: number | null): string {
  if (rate === null) return '—'
  return rate.toFixed(1) + '\u202f%'
}

function uniqueSortedThemes(emails: MarketingEmail[]): string[] {
  const themes = new Set<string>()
  for (const e of emails) {
    if (e.theme && e.theme !== 'Sans thème' && e.theme !== 'Newsletter') {
      themes.add(e.theme)
    }
  }
  return [...themes].sort((a, b) => a.localeCompare(b, 'fr'))
}

function downloadCSV(contacts: EnrichedTopClicker[], segment: Segment) {
  let header: string[]
  let rows: string[][]

  if (segment === 'inscrits') {
    header = ['Email', 'Clics totaux', 'Nb inscriptions', 'Formations']
    rows = contacts.map((c) => [
      c.emailAddress,
      String(c.totalClicks),
      String(c.nbInscriptions),
      c.inscriptions.map((i) => i.nomFormation).join(' | '),
    ])
  } else if (segment === 'non_inscrits') {
    header = ['Email', 'Clics totaux', 'Ouvertures', 'Taux d\'ouverture', 'Statut']
    rows = contacts.map((c) => [
      c.emailAddress,
      String(c.totalClicks),
      String(c.totalOpens),
      c.openRate !== null ? c.openRate.toFixed(1) + '%' : '',
      'Non inscrit',
    ])
  } else {
    header = ['Email', 'Clics totaux', 'Ouvertures', 'Taux d\'ouverture', 'Statut', 'Nb inscriptions']
    rows = contacts.map((c) => [
      c.emailAddress,
      String(c.totalClicks),
      String(c.totalOpens),
      c.openRate !== null ? c.openRate.toFixed(1) + '%' : '',
      c.isInscrit ? 'Inscrit' : 'Non inscrit',
      String(c.nbInscriptions),
    ])
  }

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `top-cliqueurs-${segment}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-[#f5f5f5] rounded-[4px] animate-pulse ${className ?? ''}`} />
}

function BadgeInscrit() {
  return (
    <span className="inline-flex items-center text-[10px] font-semibold text-[#0a0a0a] border border-[#0a0a0a] px-1.5 py-0.5 rounded-[2px]">
      Inscrit
    </span>
  )
}

function BadgeNonInscrit() {
  return (
    <span className="inline-flex items-center text-[10px] font-semibold text-[#737373] border border-[#d4d4d4] px-1.5 py-0.5 rounded-[2px]">
      Non inscrit
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TopCliqueurs() {
  const router = useRouter()
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [segment, setSegment] = useState<Segment>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<PageSizeOption>(10)
  const [themes, setThemes] = useState<string[]>([])
  const [themeFilter, setThemeFilter] = useState('')

  // ── Fetch top cliqueurs ────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/hubspot/top-cliqueurs')
      const json: ApiResponse = await res.json()
      if (!res.ok) throw new Error((json as unknown as { error?: string })?.error ?? `Erreur ${res.status}`)
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Fetch themes from campaigns (fire-and-forget) ─────────────────────────
  useEffect(() => {
    fetch('/api/hubspot/campaigns?days=360')
      .then((r) => (r.ok ? r.json() : null))
      .then((json: CampaignsApiResponse | null) => {
        if (json?.emails?.data) setThemes(uniqueSortedThemes(json.emails.data))
      })
      .catch(() => {})
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(0) }, [search, segment, pageSize, themeFilter])

  // ── Source de données selon le segment ────────────────────────────────────
  const allContacts    = data?.contacts ?? []
  const inscrits       = data?.segments.inscrits ?? []
  const nonInscrits    = data?.segments.non_inscrits_engages ?? []

  const sourceContacts: EnrichedTopClicker[] =
    segment === 'inscrits'     ? inscrits    :
    segment === 'non_inscrits' ? nonInscrits :
    allContacts

  // ── Filtre thématique (intersection via inscriptions Airtable) ────────────
  const themeContacts = themeFilter
    ? sourceContacts.filter((c) =>
        c.inscriptions.some((ins) =>
          ins.nomFormation.toLowerCase().includes(themeFilter.toLowerCase())
        )
      )
    : sourceContacts

  const filteredContacts = search.trim()
    ? themeContacts.filter((c) => c.emailAddress.toLowerCase().includes(search.toLowerCase()))
    : themeContacts

  const totalRows  = filteredContacts.length
  const pageRows   = filteredContacts.slice(page * pageSize, (page + 1) * pageSize)
  const hasPrev    = page > 0
  const hasNext    = (page + 1) * pageSize < totalRows
  const rangeStart = totalRows === 0 ? 0 : page * pageSize + 1
  const rangeEnd   = Math.min((page + 1) * pageSize, totalRows)

  // ── Colonnes par segment ───────────────────────────────────────────────────
  const columns: string[] =
    segment === 'inscrits'     ? ['Contact', 'Clics totaux', 'Formations', 'Nb inscriptions'] :
    segment === 'non_inscrits' ? ['Contact', 'Clics totaux', 'Ouvertures', 'Statut'] :
    ['Contact', 'Clics totaux', 'Ouvertures', 'Taux d\'ouverture', 'Statut']

  const SEGMENTS: { value: Segment; label: string; count: number }[] = [
    { value: 'all',          label: 'Tous',                    count: allContacts.length },
    { value: 'inscrits',     label: 'Inscrits',                count: inscrits.length },
    { value: 'non_inscrits', label: 'Non inscrits (3+ clics)', count: nonInscrits.length },
  ]

  // Source pour "Créer une liste"
  const listSource: 'inscrits' | 'non_inscrits' =
    segment === 'non_inscrits' ? 'non_inscrits' : 'inscrits'

  const listLabel =
    segment === 'non_inscrits' ? 'non inscrits' : 'inscrits'

  return (
    <div className="px-8 py-8 max-w-[1200px]">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl font-semibold text-[#0a0a0a] tracking-tight">Top cliqueurs</h1>
          <p className="text-sm text-[#737373] mt-0.5">Croisement HubSpot × Airtable — top 100 contacts</p>
        </div>

        {/* Export CSV */}
        {!loading && filteredContacts.length > 0 && (
          <button
            onClick={() => downloadCSV(filteredContacts, segment)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#737373] bg-white border border-[#e5e5e5] rounded-[4px] hover:border-[#0a0a0a] hover:text-[#0a0a0a] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 2v7M4.5 6.5L7 9l2.5-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 11v.5a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Export CSV
          </button>
        )}
      </div>

      {/* Note lifetime */}
      <p className="text-xs text-[#a3a3a3] mb-6">
        Clics cumulés depuis la création du compte (HubSpot CRM). Inscriptions : données Airtable en temps réel.
      </p>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 mb-6 border border-red-200 bg-red-50 rounded-[4px]">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" stroke="#ef4444" strokeWidth="1.2" />
            <path d="M7 4.5v3M7 9.5v.2" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span className="text-xs text-red-700">{error}</span>
        </div>
      )}

      {/* ── Segment toggle ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 mb-4">
        {SEGMENTS.map(({ value, label, count }) => (
          <button
            key={value}
            onClick={() => { setSegment(value); setThemeFilter('') }}
            className={`px-3 py-1.5 text-xs font-medium rounded-[4px] border transition-colors ${
              segment === value
                ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]'
                : 'bg-white text-[#737373] border-[#e5e5e5] hover:border-[#0a0a0a] hover:text-[#0a0a0a]'
            }`}
          >
            {label}
            {!loading && (
              <span className={`ml-1.5 tabular-nums ${segment === value ? 'text-white/70' : 'text-[#a3a3a3]'}`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Filtre thématique ───────────────────────────────────────────────── */}
      {themes.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative">
            <select
              value={themeFilter}
              onChange={(e) => setThemeFilter(e.target.value)}
              className="pl-3 pr-8 py-2 text-xs text-[#0a0a0a] bg-white border border-[#e5e5e5] rounded-[4px] outline-none focus:border-[#0a0a0a] transition-all appearance-none cursor-pointer"
            >
              <option value="">Toutes les thématiques</option>
              {themes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 3.5l3 3 3-3" stroke="#a3a3a3" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>

          {themeFilter && (
            <>
              <span className="text-xs text-[#a3a3a3]">
                {themeContacts.length} contact{themeContacts.length !== 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/dashboard/listes?source=${listSource}&theme=${encodeURIComponent(themeFilter)}`
                  )
                }
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0a0a0a] bg-white border border-[#0a0a0a] rounded-[4px] hover:bg-[#0a0a0a] hover:text-white transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M4.5 6h3M6 4.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                Créer une liste ({listLabel})
              </button>
              <button
                type="button"
                onClick={() => setThemeFilter('')}
                className="text-xs text-[#a3a3a3] hover:text-[#0a0a0a] transition-colors"
              >
                Effacer
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="5.5" cy="5.5" r="4" stroke="#a3a3a3" strokeWidth="1.2" />
            <path d="M8.5 8.5l3.5 3.5" stroke="#a3a3a3" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un contact…"
          className="w-full pl-9 pr-4 py-2.5 text-sm text-[#0a0a0a] placeholder-[#a3a3a3] bg-white border border-[#e5e5e5] rounded-[4px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] transition-all duration-150"
        />
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e5e5e5] rounded-[6px]">

        {/* Table header bar */}
        <div className="px-5 py-4 border-b border-[#e5e5e5] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#0a0a0a]">
            {segment === 'inscrits'     ? 'Contacts inscrits' :
             segment === 'non_inscrits' ? 'Contacts engagés non inscrits' :
             'Contacts'}
          </h2>
          {!loading && (
            <span className="text-xs text-[#a3a3a3]">
              {totalRows} contact{totalRows !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#f5f5f5]">
              <th className="px-5 py-3 text-left text-xs font-medium text-[#a3a3a3] tracking-wide uppercase w-8">#</th>
              {columns.map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium text-[#a3a3a3] tracking-wide uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-[#f5f5f5] last:border-0">
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-6" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-52" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-14" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-48" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-20" /></td>
                  {segment !== 'inscrits' && <td className="px-5 py-3.5"><Skeleton className="h-4 w-16" /></td>}
                </tr>
              ))
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-5 py-10 text-center text-sm text-[#a3a3a3]">
                  {search.trim() ? 'Aucun résultat pour cette recherche.' : 'Aucun contact trouvé.'}
                </td>
              </tr>
            ) : (
              pageRows.map((c, i) => {
                const rank = rangeStart + i
                return (
                  <tr
                    key={c.contactId}
                    className="border-b border-[#f5f5f5] last:border-0 hover:bg-[#fafafa] transition-colors"
                  >
                    {/* Rang */}
                    <td className="px-5 py-3.5 text-xs text-[#a3a3a3] tabular-nums">{rank}</td>

                    {/* Contact */}
                    <td className="px-5 py-3.5 font-medium text-[#0a0a0a]">{c.emailAddress}</td>

                    {/* Clics totaux */}
                    <td className="px-5 py-3.5 text-[#0a0a0a] tabular-nums font-semibold">
                      {fmtNumber(c.totalClicks)}
                    </td>

                    {/* Colonnes variables selon segment */}
                    {segment === 'inscrits' ? (
                      <>
                        {/* Formations */}
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {c.inscriptions.slice(0, 4).map((ins, j) => (
                              <span
                                key={j}
                                className="text-[10px] font-medium text-[#737373] border border-[#e5e5e5] px-1.5 py-0.5 rounded-[2px]"
                                title={ins.nomFormation}
                              >
                                {ins.nomFormation.length > 40
                                  ? ins.nomFormation.slice(0, 40) + '…'
                                  : ins.nomFormation}
                              </span>
                            ))}
                            {c.inscriptions.length > 4 && (
                              <span className="text-[10px] text-[#a3a3a3] px-1 py-0.5">
                                +{c.inscriptions.length - 4}
                              </span>
                            )}
                          </div>
                        </td>
                        {/* Nb inscriptions */}
                        <td className="px-5 py-3.5 text-[#737373] tabular-nums">
                          {c.nbInscriptions}
                        </td>
                      </>
                    ) : segment === 'non_inscrits' ? (
                      <>
                        {/* Ouvertures */}
                        <td className="px-5 py-3.5 text-[#0a0a0a] tabular-nums">
                          {fmtNumber(c.totalOpens)}
                        </td>
                        {/* Badge Non inscrit */}
                        <td className="px-5 py-3.5">
                          <BadgeNonInscrit />
                        </td>
                      </>
                    ) : (
                      <>
                        {/* Ouvertures */}
                        <td className="px-5 py-3.5 text-[#0a0a0a] tabular-nums">
                          {fmtNumber(c.totalOpens)}
                        </td>
                        {/* Taux d'ouverture */}
                        <td className="px-5 py-3.5 text-[#737373] tabular-nums">
                          {fmtRate(c.openRate)}
                        </td>
                        {/* Statut */}
                        <td className="px-5 py-3.5">
                          {c.isInscrit ? <BadgeInscrit /> : null}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {/* ── Pagination ──────────────────────────────────────────────────────── */}
        {!loading && totalRows > 0 && (
          <div className="px-5 py-3 border-t border-[#e5e5e5] flex items-center justify-between gap-4">

            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={!hasPrev}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                hasPrev ? 'text-[#0a0a0a] hover:text-[#737373]' : 'text-[#d4d4d4] cursor-not-allowed'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M8.5 3L4.5 7l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Précédent
            </button>

            <div className="flex items-center gap-3">
              <span className="text-xs text-[#737373]">
                {rangeStart}–{rangeEnd} sur {totalRows} contact{totalRows !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center border border-[#e5e5e5] rounded-[4px] overflow-hidden">
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <button
                    key={size}
                    onClick={() => setPageSize(size)}
                    className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                      pageSize === size
                        ? 'bg-[#0a0a0a] text-white'
                        : 'bg-white text-[#737373] hover:bg-[#f5f5f5] hover:text-[#0a0a0a]'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                hasNext ? 'text-[#0a0a0a] hover:text-[#737373]' : 'text-[#d4d4d4] cursor-not-allowed'
              }`}
            >
              Suivant
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M5.5 3L9.5 7l-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

          </div>
        )}

      </div>
    </div>
  )
}
