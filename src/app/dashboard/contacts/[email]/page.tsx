'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ThemeEntry {
  theme: string
  clicks: number
  lastClick: string
}

interface Inscription {
  nomFormation: string
  specialite: string | null
  dateCreation: string | null
}

interface ContactDetails {
  email: string
  contactId: string
  firstname: string | null
  lastname: string | null
  totalClicks: number
  totalOpens: number
  totalDelivered: number
  openRate: number | null
  clickRate: number | null
  isInscrit: boolean
  inscriptions: Inscription[]
  themes: ThemeEntry[]
  lastSyncedAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNumber(n: number): string {
  return n.toLocaleString('fr-FR')
}

function fmtRate(r: number | null): string {
  if (r === null) return '—'
  return r.toFixed(1) + ' %'
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-[#f5f5f5] rounded-[4px] animate-pulse ${className ?? ''}`} />
}

function MetricCard({
  label, value, loading,
}: { label: string; value: string; loading: boolean }) {
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

function BadgeInscrit() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] bg-green-50 border border-green-200 text-green-700 text-xs font-semibold">
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
        <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M3.5 5.5l1.5 1.5L8 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Inscrit
    </span>
  )
}

function BadgeNonInscrit() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
        <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M3.5 3.5l4 4M7.5 3.5l-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      Non inscrit
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContactDetailsPage() {
  const params = useParams<{ email: string }>()
  const router = useRouter()
  // Next décode le param dynamique automatiquement
  const email = params.email ?? ''

  const [data, setData] = useState<ContactDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!email) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/contacts/${encodeURIComponent(email)}`)
        const json = await res.json()
        if (!res.ok) {
          throw new Error((json as { error?: string })?.error ?? `Erreur ${res.status}`)
        }
        if (!cancelled) setData(json as ContactDetails)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [email])

  const fullName = data
    ? [data.firstname, data.lastname].filter(Boolean).join(' ').trim() || data.email
    : email

  const hasName = Boolean(data?.firstname || data?.lastname)

  function goToTheme(themeName: string) {
    router.push(
      `/dashboard/listes?source=prospects_chauds&theme=${encodeURIComponent(themeName)}`
    )
  }

  return (
    <div className="px-8 py-8 max-w-[1200px]">

      {/* ── Bouton retour ─────────────────────────────────────────────────── */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-xs font-medium text-[#737373] hover:text-[#0a0a0a] transition-colors cursor-pointer mb-6"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Retour
      </button>

      {/* ── Erreur ────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 mb-6 border border-red-200 bg-red-50 rounded-[4px]">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" stroke="#ef4444" strokeWidth="1.2" />
            <path d="M7 4.5v3M7 9.5v.2" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span className="text-xs text-red-700">{error}</span>
        </div>
      )}

      {/* ── SECTION HAUTE — Fiche contact ─────────────────────────────────── */}
      <div className="bg-white border border-[#e5e5e5] rounded-[6px] p-6 mb-6">

        {/* En-tête : nom + badge */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            {loading ? (
              <>
                <Skeleton className="h-7 w-64 mb-2" />
                <Skeleton className="h-4 w-48" />
              </>
            ) : (
              <>
                <h1 className="text-xl font-semibold text-[#0a0a0a] tracking-tight truncate">
                  {fullName}
                </h1>
                {hasName && (
                  <p className="text-sm text-[#737373] mt-0.5 truncate">{data?.email}</p>
                )}
              </>
            )}
          </div>
          <div className="shrink-0">
            {loading ? (
              <Skeleton className="h-7 w-24" />
            ) : data ? (
              data.isInscrit ? <BadgeInscrit /> : <BadgeNonInscrit />
            ) : null}
          </div>
        </div>

        {/* 4 metric cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <MetricCard
            label="Clics totaux"
            value={data ? fmtNumber(data.totalClicks) : '—'}
            loading={loading}
          />
          <MetricCard
            label="Ouvertures totales"
            value={data ? fmtNumber(data.totalOpens) : '—'}
            loading={loading}
          />
          <MetricCard
            label="Emails reçus"
            value={data ? fmtNumber(data.totalDelivered) : '—'}
            loading={loading}
          />
          <MetricCard
            label="Taux d'ouverture"
            value={data ? fmtRate(data.openRate) : '—'}
            loading={loading}
          />
        </div>

        {/* Inscriptions (uniquement si inscrit) */}
        {!loading && data && data.isInscrit && data.inscriptions.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-[#a3a3a3] tracking-wide uppercase mb-3">
              Formations
            </h3>
            <ul className="space-y-1.5">
              {data.inscriptions.map((ins, i) => (
                <li
                  key={i}
                  className="flex items-baseline gap-2 flex-wrap text-sm leading-snug"
                >
                  <span className="font-medium text-[#0a0a0a]">{ins.nomFormation}</span>
                  {ins.specialite && (
                    <span className="text-xs text-[#737373]">— {ins.specialite}</span>
                  )}
                  {ins.dateCreation && (
                    <span className="text-xs text-[#a3a3a3]">— {fmtDate(ins.dateCreation)}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── SECTION BASSE — Tableau des thématiques ────────────────────────── */}
      <div className="bg-white border border-[#e5e5e5] rounded-[6px]">

        <div className="px-5 py-4 border-b border-[#e5e5e5]">
          <h2 className="text-sm font-semibold text-[#0a0a0a]">Thématiques</h2>
          <p className="text-xs text-[#a3a3a3] mt-0.5">
            Clic sur une thématique pour voir tous les prospects chauds correspondants.
          </p>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#f5f5f5]">
              <th className="px-5 py-3 text-left text-xs font-medium text-[#a3a3a3] tracking-wide uppercase">
                Thème
              </th>
              <th className="px-5 py-3 text-right text-xs font-medium text-[#a3a3a3] tracking-wide uppercase">
                Clics
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-[#a3a3a3] tracking-wide uppercase">
                Dernier clic
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-[#f5f5f5] last:border-0">
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-40" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-8 ml-auto" /></td>
                  <td className="px-5 py-3.5"><Skeleton className="h-4 w-24" /></td>
                </tr>
              ))
            ) : (data?.themes.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-10 text-center text-sm text-[#a3a3a3]">
                  Aucune thématique avec 3+ clics
                </td>
              </tr>
            ) : (
              data!.themes.map((t) => (
                <tr
                  key={t.theme}
                  onClick={() => goToTheme(t.theme)}
                  className="border-b border-[#f5f5f5] last:border-0 hover:bg-[#fafafa] transition-colors cursor-pointer"
                >
                  <td className="px-5 py-3.5 text-[#0a0a0a] font-medium">{t.theme}</td>
                  <td className="px-5 py-3.5 text-[#0a0a0a] tabular-nums text-right">
                    {fmtNumber(t.clicks)}
                  </td>
                  <td className="px-5 py-3.5 text-[#737373]">{fmtDate(t.lastClick)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
