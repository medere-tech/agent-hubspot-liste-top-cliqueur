'use client'

import type { Campaign, MarketingEmail, EmailType } from '@/lib/hubspot'
import { EMAIL_TYPE_LABELS } from '@/lib/hubspot'
import { useCallback, useEffect, useState } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number]

const TYPE_FILTER_OPTIONS: Array<{ value: EmailType | 'ALL'; label: string }> = [
  { value: 'ALL',       label: 'Tous' },
  { value: 'CV',        label: 'Classe virtuelle' },
  { value: 'PRES',      label: 'Présentiel' },
  { value: 'EL',        label: 'E-learning' },
  { value: 'WEBINAIRE', label: 'Webinaire' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 7 | 28 | 90 | 360

interface ApiResponse {
  days: number
  campaigns: { count: number; data: Campaign[] }
  emails: { count: number; data: MarketingEmail[] }
}

interface ThemeRow {
  theme: string
  type: string
  audiences: string[]
  emailCount: number
  totalClicks: number
  totalOpens: number
  totalDelivered: number
  isABTest: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNumber(n: number): string {
  return n.toLocaleString('fr-FR')
}

function fmtRate(numerator: number, denominator: number): string | null {
  if (denominator === 0) return null
  return (numerator / denominator * 100).toFixed(1) + '\u202f%'
}

function computeThemeRows(emails: MarketingEmail[]): ThemeRow[] {
  const map = new Map<string, ThemeRow>()

  for (const e of emails) {
    const key = `${e.theme}__${e.type}`
    const existing = map.get(key)
    if (existing) {
      existing.emailCount++
      for (const a of e.audiences) {
        if (!existing.audiences.includes(a)) existing.audiences.push(a)
      }
      if (e.isABTest) existing.isABTest = true
      existing.totalClicks    += e.clicks
      existing.totalOpens     += e.opens
      existing.totalDelivered += e.delivered
    } else {
      map.set(key, {
        theme: e.theme,
        type: e.type,
        audiences: [...e.audiences],
        emailCount: 1,
        totalClicks: e.clicks,
        totalOpens: e.opens,
        totalDelivered: e.delivered,
        isABTest: e.isABTest,
      })
    }
  }

  return [...map.values()].sort(
    (a, b) => b.totalClicks - a.totalClicks || b.emailCount - a.emailCount
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-[#f5f5f5] rounded-[4px] animate-pulse ${className ?? ''}`} />
}

function MetricCard({
  label, value, loading,
}: { label: string; value: string | number; loading: boolean }) {
  return (
    <div className="bg-white border border-[#e5e5e5] rounded-[6px] p-5">
      <p className="text-xs text-[#737373] font-medium tracking-wide uppercase mb-3">{label}</p>
      {loading ? (
        <Skeleton className="h-7 w-16" />
      ) : (
        <p className="text-2xl font-semibold text-[#0a0a0a] leading-none">{value}</p>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>(90)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filtres
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<EmailType | 'ALL'>('ALL')
  const [audienceFilter, setAudienceFilter] = useState<string>('ALL')

  // Pagination (0-based)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<PageSizeOption>(10)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (days: Period) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/hubspot/campaigns?days=${days}`)
      const json: ApiResponse = await res.json()
      if (!res.ok) throw new Error((json as unknown as { error?: string })?.error ?? `Erreur ${res.status}`)
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(period) }, [period, fetchData])

  // Reset page when any filter, period or page size changes
  useEffect(() => { setPage(0) }, [search, typeFilter, audienceFilter, period, pageSize])

  // ── Data derivation ────────────────────────────────────────────────────────
  const campaigns = data?.campaigns
  const emails    = data?.emails
  const emailList = emails?.data ?? []

  const uniqueThemes    = new Set(emailList.map((e) => e.theme)).size
  const uniqueAudiences = new Set(emailList.flatMap((e) => e.audiences)).size
  const themeRows       = computeThemeRows(emailList)

  // All distinct audiences for the dropdown
  const allAudiences = [...new Set(emailList.flatMap((e) => e.audiences))].sort()

  // ── Filtering pipeline ─────────────────────────────────────────────────────
  const afterType = typeFilter === 'ALL'
    ? themeRows
    : themeRows.filter((r) => r.type === typeFilter)

  const afterAudience = audienceFilter === 'ALL'
    ? afterType
    : afterType.filter((r) => r.audiences.includes(audienceFilter))

  const filteredRows = search.trim()
    ? afterAudience.filter((row) => {
        const q         = search.toLowerCase()
        const typeLabel = (EMAIL_TYPE_LABELS[row.type as EmailType] ?? row.type).toLowerCase()
        return (
          row.theme.toLowerCase().includes(q) ||
          typeLabel.includes(q) ||
          row.audiences.some((a) => a.toLowerCase().includes(q))
        )
      })
    : afterAudience

  const totalRows = filteredRows.length
  const pageRows  = filteredRows.slice(page * pageSize, (page + 1) * pageSize)
  const hasFilters = typeFilter !== 'ALL' || audienceFilter !== 'ALL' || search.trim() !== ''

  const resetFilters = () => {
    setSearch('')
    setTypeFilter('ALL')
    setAudienceFilter('ALL')
    setPage(0)
  }

  const PERIODS: { label: string; value: Period }[] = [
    { label: '7 j', value: 7 },
    { label: '28 j', value: 28 },
    { label: '90 j', value: 90 },
    { label: '360 j', value: 360 },
  ]

  // ── Pagination helpers ─────────────────────────────────────────────────────
  const hasPrev = page > 0
  const hasNext = (page + 1) * pageSize < totalRows
  const rangeStart = totalRows === 0 ? 0 : page * pageSize + 1
  const rangeEnd   = Math.min((page + 1) * pageSize, totalRows)

  return (
    <div className="px-8 py-8 max-w-[1200px]">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-[#0a0a0a] tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-[#737373] mt-0.5">Analyse des campagnes email HubSpot</p>
        </div>

        <div className="flex items-center border border-[#e5e5e5] rounded-[4px] overflow-hidden">
          {PERIODS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                period === value
                  ? 'bg-[#0a0a0a] text-white'
                  : 'bg-white text-[#737373] hover:bg-[#f5f5f5] hover:text-[#0a0a0a]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 mb-6 border border-red-200 bg-red-50 rounded-[4px]">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" stroke="#ef4444" strokeWidth="1.2" />
            <path d="M7 4.5v3M7 9.5v.2" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span className="text-xs text-red-700">{error}</span>
        </div>
      )}

      {/* ── Metric cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard label="Total campagnes"    value={campaigns?.count ?? 0} loading={loading} />
        <MetricCard label="Emails envoyés"     value={emails?.count ?? 0}    loading={loading} />
        <MetricCard label="Thématiques"        value={uniqueThemes}           loading={loading} />
        <MetricCard label="Audiences actives"  value={uniqueAudiences}        loading={loading} />
      </div>

      {/* ── Search bar ──────────────────────────────────────────────────────── */}
      <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="5.5" cy="5.5" r="4" stroke="#a3a3a3" strokeWidth="1.2" />
            <path d="M8.5 8.5l3.5 3.5" stroke="#a3a3a3" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une thématique, une audience…"
          className="w-full pl-9 pr-4 py-2.5 text-sm text-[#0a0a0a] placeholder-[#a3a3a3] bg-white border border-[#e5e5e5] rounded-[4px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] transition-all duration-150"
        />
      </div>

      {/* ── Filters row ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Type buttons */}
        <div className="flex items-center gap-1">
          {TYPE_FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTypeFilter(value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-[4px] border transition-colors ${
                typeFilter === value
                  ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]'
                  : 'bg-white text-[#737373] border-[#e5e5e5] hover:border-[#0a0a0a] hover:text-[#0a0a0a]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="w-px h-4 bg-[#e5e5e5]" />

        {/* Audience dropdown */}
        <div className="relative">
          <select
            value={audienceFilter}
            onChange={(e) => setAudienceFilter(e.target.value)}
            className="appearance-none pl-3 pr-7 py-1.5 text-xs font-medium text-[#737373] bg-white border border-[#e5e5e5] rounded-[4px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] transition-colors cursor-pointer hover:border-[#0a0a0a] hover:text-[#0a0a0a]"
          >
            <option value="ALL">Toutes les audiences</option>
            {allAudiences.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          {/* Chevron icon */}
          <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M2 3.5l3 3 3-3" stroke="#a3a3a3" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>

        {/* Reset */}
        {hasFilters && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 text-xs text-[#737373] hover:text-[#0a0a0a] transition-colors ml-auto"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            Réinitialiser les filtres
          </button>
        )}
      </div>

      {/* ── Theme table ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e5e5e5] rounded-[6px]">

        {/* Table header */}
        <div className="px-5 py-4 border-b border-[#e5e5e5] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#0a0a0a]">Thématiques</h2>
          {!loading && (
            <span className="text-xs text-[#a3a3a3]">
              {totalRows} thème{totalRows !== 1 ? 's' : ''}
              {emails?.count === 0 && (
                <span className="ml-2">— emails non disponibles (scope manquant)</span>
              )}
            </span>
          )}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#f5f5f5]">
              {['Thème', 'Type', 'Audience(s)', 'Emails', 'Clics', 'Ouvertures'].map((h) => (
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
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-40" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-16" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-8" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-14" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-14" /></td>
                </tr>
              ))
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-[#a3a3a3]">
                  {hasFilters
                    ? 'Aucun résultat pour ces filtres.'
                    : emails?.count === 0
                    ? 'Les emails individuels nécessitent le scope "content" dans l\'app HubSpot.'
                    : 'Aucun email sur cette période.'}
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => {
                const typeLabel    = EMAIL_TYPE_LABELS[row.type as EmailType] ?? row.type
                const clickRateStr = fmtRate(row.totalClicks, row.totalDelivered)
                const openRateStr  = fmtRate(row.totalOpens,  row.totalDelivered)
                return (
                  <tr
                    key={`${row.theme}-${i}`}
                    className="border-b border-[#f5f5f5] last:border-0 hover:bg-[#fafafa] transition-colors"
                  >
                    <td className="px-5 py-3.5 text-[#0a0a0a] font-medium">
                      <span className="flex items-center gap-2">
                        {row.theme}
                        {row.isABTest && (
                          <span className="text-[10px] font-semibold text-[#737373] border border-[#e5e5e5] px-1.5 py-0.5 rounded-[2px]">A/B</span>
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[#737373]">{typeLabel}</td>
                    <td className="px-5 py-3.5 text-[#737373]">{row.audiences.join(', ')}</td>
                    <td className="px-5 py-3.5 text-[#0a0a0a] tabular-nums">{row.emailCount}</td>
                    <td className="px-5 py-3.5">
                      <span className="text-[#0a0a0a] tabular-nums">{fmtNumber(row.totalClicks)}</span>
                      {clickRateStr && (
                        <span className="block text-[10px] text-[#a3a3a3] tabular-nums mt-0.5">{clickRateStr}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-[#0a0a0a] tabular-nums">{fmtNumber(row.totalOpens)}</span>
                      {openRateStr && (
                        <span className="block text-[10px] text-[#a3a3a3] tabular-nums mt-0.5">{openRateStr}</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {/* ── Pagination ──────────────────────────────────────────────────────── */}
        {!loading && totalRows > 0 && (
          <div className="px-5 py-3 border-t border-[#e5e5e5] flex items-center justify-between gap-4">

            {/* ← Précédent */}
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={!hasPrev}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                hasPrev
                  ? 'text-[#0a0a0a] hover:text-[#737373]'
                  : 'text-[#d4d4d4] cursor-not-allowed'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M8.5 3L4.5 7l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Précédent
            </button>

            {/* Centre : indicateur + sélecteur */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#737373]">
                {rangeStart}–{rangeEnd} sur {totalRows} thème{totalRows !== 1 ? 's' : ''}
              </span>

              {/* Page size toggle buttons */}
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

            {/* Suivant → */}
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                hasNext
                  ? 'text-[#0a0a0a] hover:text-[#737373]'
                  : 'text-[#d4d4d4] cursor-not-allowed'
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
