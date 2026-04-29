'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ThemeAggregate {
  themeName: string
  totalContacts: number
  nonInscrits: number
  nonInscritsHot: number
  inscrits: number
  conversionRate: number
  totalClicks: number
  avgClicksPerContact: number
}

interface ApiResponse {
  count: number
  themes: ThemeAggregate[]
}

type SortKey = keyof ThemeAggregate
type SortDir = 'asc' | 'desc'

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMNS: Array<{ key: SortKey; label: string; align: 'left' | 'right' }> = [
  { key: 'themeName',           label: 'Thème',              align: 'left'  },
  { key: 'totalContacts',       label: 'Contacts',           align: 'right' },
  { key: 'nonInscritsHot',      label: 'Prospects chauds',   align: 'right' },
  { key: 'nonInscrits',         label: 'Non inscrits',       align: 'right' },
  { key: 'inscrits',            label: 'Inscrits',           align: 'right' },
  { key: 'conversionRate',      label: 'Taux de conversion', align: 'right' },
  { key: 'totalClicks',         label: 'Clics totaux',       align: 'right' },
  { key: 'avgClicksPerContact', label: 'Moy. clics/contact', align: 'right' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNumber(n: number): string {
  return n.toLocaleString('fr-FR')
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

function FlameIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M5 1.2c.4 1 0 1.7-.5 2.4-.6.7-1.3 1.4-1.3 2.6 0 1.4 1.1 2.6 2.3 2.6s2.3-1.2 2.3-2.6c0-.9-.4-1.5-.9-2 .1.6 0 1-.4 1.4.1-.9-.3-1.6-.8-2.1-.5-.5-.9-1.2-.7-2.3z"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.15"
      />
    </svg>
  )
}

function SortIcon({ direction }: { direction: SortDir | null }) {
  if (direction === null) {
    return (
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="opacity-40">
        <path d="M3 4l2-2 2 2M3 6l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
  return direction === 'asc' ? (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M3 6l2-2 2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ) : (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M3 4l2 2 2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ThematiquesPage() {
  const router = useRouter()
  const [data, setData] = useState<ThemeAggregate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('nonInscritsHot')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/hubspot/thematiques')
        const json = await res.json()
        if (!res.ok) {
          throw new Error((json as { error?: string })?.error ?? `Erreur ${res.status}`)
        }
        if (!cancelled) setData((json as ApiResponse).themes ?? [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── Derivations ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? data.filter((t) => t.themeName.toLowerCase().includes(q)) : data
  }, [data, search])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      let cmp: number
      if (typeof av === 'string' && typeof bv === 'string') {
        cmp = av.localeCompare(bv, 'fr')
      } else {
        cmp = (av as number) - (bv as number)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const totals = useMemo(() => ({
    totalThemes:       data.length,
    totalHot:          data.reduce((s, t) => s + t.nonInscritsHot, 0),
    totalNonInscrits:  data.reduce((s, t) => s + t.nonInscrits, 0),
  }), [data])

  // ── Handlers ───────────────────────────────────────────────────────────────
  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'themeName' ? 'asc' : 'desc')
    }
  }

  function goToListe(themeName: string) {
    router.push(`/dashboard/listes?source=thematique&theme=${encodeURIComponent(themeName)}`)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="px-8 py-8 max-w-[1200px]">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[#0a0a0a] tracking-tight">Thématiques</h1>
        <p className="text-sm text-[#737373] mt-0.5">
          Vue agrégée par thème — segmentation prospects vs inscrits
        </p>
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
      <div className="grid grid-cols-3 gap-4 mb-8">
        <MetricCard label="Thématiques"       value={fmtNumber(totals.totalThemes)}      loading={loading} />
        <MetricCard label="Prospects chauds"  value={fmtNumber(totals.totalHot)}         loading={loading} />
        <MetricCard label="Non inscrits"      value={fmtNumber(totals.totalNonInscrits)} loading={loading} />
      </div>

      {/* ── Search bar ──────────────────────────────────────────────────────── */}
      <div className="relative mb-4">
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
          placeholder="Rechercher une thématique…"
          className="w-full pl-9 pr-4 py-2.5 text-sm text-[#0a0a0a] placeholder-[#a3a3a3] bg-white border border-[#e5e5e5] rounded-[4px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] transition-all duration-150"
        />
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e5e5e5] rounded-[6px]">

        <div className="px-5 py-4 border-b border-[#e5e5e5] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#0a0a0a]">Thématiques</h2>
          {!loading && (
            <span className="text-xs text-[#a3a3a3]">
              {sorted.length} thème{sorted.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#f5f5f5]">
              {COLUMNS.map((col) => {
                const active = sortKey === col.key
                const direction = active ? sortDir : null
                return (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={`px-5 py-3 text-xs font-medium text-[#a3a3a3] tracking-wide uppercase cursor-pointer select-none hover:text-[#0a0a0a] transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    <span className={`inline-flex items-center gap-1.5 ${col.align === 'right' ? 'flex-row-reverse' : ''}`}>
                      {col.label}
                      <SortIcon direction={direction} />
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-[#f5f5f5] last:border-0">
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="px-5 py-3.5">
                      <Skeleton className={`h-4 ${c.align === 'left' ? 'w-40' : 'w-12 ml-auto'}`} />
                    </td>
                  ))}
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-5 py-10 text-center text-sm text-[#a3a3a3]">
                  {search.trim()
                    ? 'Aucun résultat pour cette recherche.'
                    : 'Aucune donnée — la sync Supabase n\'a pas encore tourné.'}
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr
                  key={row.themeName}
                  onClick={() => goToListe(row.themeName)}
                  className="border-b border-[#f5f5f5] last:border-0 hover:bg-[#fafafa] transition-colors cursor-pointer"
                >
                  <td className="px-5 py-3.5 text-[#0a0a0a] font-medium">{row.themeName}</td>

                  <td className="px-5 py-3.5 text-[#0a0a0a] tabular-nums text-right">
                    {fmtNumber(row.totalContacts)}
                  </td>

                  <td className="px-5 py-3.5 text-right">
                    {row.nonInscritsHot > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] bg-red-50 border border-red-200 text-red-700 text-xs font-semibold tabular-nums">
                        <FlameIcon />
                        {fmtNumber(row.nonInscritsHot)}
                      </span>
                    ) : (
                      <span className="text-[#a3a3a3] tabular-nums">0</span>
                    )}
                  </td>

                  <td className="px-5 py-3.5 text-[#737373] tabular-nums text-right">
                    {fmtNumber(row.nonInscrits)}
                  </td>

                  <td className="px-5 py-3.5 text-[#737373] tabular-nums text-right">
                    {fmtNumber(row.inscrits)}
                  </td>

                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[#0a0a0a] tabular-nums text-xs">
                        {row.conversionRate.toFixed(1)}{' '}%
                      </span>
                      <div className="w-16 h-1.5 bg-[#f5f5f5] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#0a0a0a] rounded-full"
                          style={{ width: `${Math.min(100, row.conversionRate)}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  <td className="px-5 py-3.5 text-[#0a0a0a] tabular-nums text-right">
                    {fmtNumber(row.totalClicks)}
                  </td>

                  <td className="px-5 py-3.5 text-[#737373] tabular-nums text-right">
                    {row.avgClicksPerContact.toFixed(1)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
