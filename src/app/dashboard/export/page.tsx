'use client'

import { useEffect, useState } from 'react'
import { downloadCSV } from '@/lib/csv'

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

interface ThematiquesApiResponse {
  count: number
  themes: ThemeAggregate[]
}

interface ThemeDetail { theme: string; clicks: number; lastClick: string }
interface InscriptionDetail {
  nomFormation: string
  specialite: string | null
  dateCreation: string | null
}

interface ContactItem {
  email: string
  contactId: string
  totalClicks: number
  clicksOnTheme: number
  lastClickOnTheme: string
  themes?: ThemeDetail[]
  inscriptions?: InscriptionDetail[]
}

interface ContactsApiResponse {
  theme: string | null
  count: number
  prospects: ContactItem[]
  uniqueThemes: string[]
}

type SectionResult = { kind: 'success' | 'error'; message: string } | null

interface SectionState {
  loading: boolean
  result: SectionResult
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmtDateFr(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d)
}

function slugify(s: string): string {
  return (
    s.toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'export'
  )
}

function pluralRows(n: number, singular: string, plural: string): string {
  return `${n} ${n !== 1 ? plural : singular}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="#d4d4d4" strokeWidth="1.5" />
      <path d="M7 2a5 5 0 015 5" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

interface DropdownProps {
  value: string
  onChange: (v: string) => void
  options: string[]
  loading: boolean
}

function ExportCard({
  title, description, state, onExport, buttonLabel, dropdown,
}: {
  title: string
  description: string
  state: SectionState
  onExport: () => void
  buttonLabel: string
  dropdown?: DropdownProps
}) {
  return (
    <div className="bg-white border border-[#e5e5e5] rounded-[6px] p-6">
      <h2 className="text-sm font-semibold text-[#0a0a0a] mb-1">{title}</h2>
      <p className="text-xs text-[#a3a3a3] mb-4">{description}</p>

      {dropdown && (
        <div className="flex items-center gap-2 mb-4">
          <div className="relative">
            <select
              value={dropdown.value}
              onChange={(e) => dropdown.onChange(e.target.value)}
              disabled={dropdown.loading && dropdown.options.length === 0}
              className="pl-3 pr-8 py-2 text-sm text-[#0a0a0a] bg-white border border-[#e5e5e5] rounded-[4px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] transition-all appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Toutes les thématiques</option>
              {dropdown.options.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 3.5l3 3 3-3" stroke="#a3a3a3" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
          {dropdown.value && (
            <button
              type="button"
              onClick={() => dropdown.onChange('')}
              className="text-xs text-[#a3a3a3] hover:text-[#0a0a0a] transition-colors cursor-pointer"
            >
              Effacer
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onExport}
          disabled={state.loading}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-[4px] border transition-colors ${
            state.loading
              ? 'bg-[#f5f5f5] text-[#a3a3a3] border-[#e5e5e5] cursor-not-allowed'
              : 'bg-[#0a0a0a] text-white border-[#0a0a0a] hover:bg-[#262626] cursor-pointer'
          }`}
        >
          {state.loading ? (
            <>
              <Spinner />
              Export en cours…
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M7 2v7M4.5 6.5L7 9l2.5-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 11v.5a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              {buttonLabel}
            </>
          )}
        </button>

        {state.result && (
          state.result.kind === 'success' ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-[#0a0a0a]">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <circle cx="6" cy="6" r="4.5" stroke="#22c55e" strokeWidth="1.2" />
                <path d="M4 6l1.5 1.5L8 4.5" stroke="#22c55e" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {state.result.message}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-[#b91c1c]">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <circle cx="6" cy="6" r="4.5" stroke="#ef4444" strokeWidth="1.2" />
                <path d="M6 4v3M6 8.5v.2" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              {state.result.message}
            </span>
          )
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExportPage() {
  const [nonInscritsThemes, setNonInscritsThemes] = useState<string[]>([])
  const [inscritsThemes, setInscritsThemes] = useState<string[]>([])
  const [themesLoading, setThemesLoading] = useState(true)
  const [themesError, setThemesError] = useState('')

  const [nonInscritsSelectedTheme, setNonInscritsSelectedTheme] = useState('')
  const [inscritsSelectedTheme, setInscritsSelectedTheme] = useState('')

  const [thematiquesState, setThematiquesState] = useState<SectionState>({ loading: false, result: null })
  const [nonInscritsState, setNonInscritsState] = useState<SectionState>({ loading: false, result: null })
  const [inscritsState, setInscritsState] = useState<SectionState>({ loading: false, result: null })

  // Charge les options des dropdowns au mount
  useEffect(() => {
    let cancelled = false
    const loadThemes = async () => {
      setThemesLoading(true)
      setThemesError('')
      try {
        const [nonRes, inscritsRes] = await Promise.all([
          fetch('/api/contacts/by-theme'),
          fetch('/api/contacts/inscrits'),
        ])
        if (cancelled) return
        if (nonRes.ok) {
          const json = (await nonRes.json()) as ContactsApiResponse
          setNonInscritsThemes(json.uniqueThemes ?? [])
        }
        if (inscritsRes.ok) {
          const json = (await inscritsRes.json()) as ContactsApiResponse
          setInscritsThemes(json.uniqueThemes ?? [])
        }
      } catch (err) {
        if (!cancelled) setThemesError(err instanceof Error ? err.message : 'Erreur de chargement')
      } finally {
        if (!cancelled) setThemesLoading(false)
      }
    }
    loadThemes()
    return () => { cancelled = true }
  }, [])

  // ── Export Thématiques ────────────────────────────────────────────────────
  async function exportThematiques() {
    setThematiquesState({ loading: true, result: null })
    try {
      const res = await fetch('/api/hubspot/thematiques')
      const json = await res.json()
      if (!res.ok) {
        throw new Error((json as { error?: string })?.error ?? `Erreur ${res.status}`)
      }
      const apiData = json as ThematiquesApiResponse

      const headers = [
        'Thème',
        'Contacts',
        'Prospects chauds',
        'Non inscrits',
        'Inscrits',
        'Taux de conversion (%)',
        'Clics totaux',
        'Moy. clics/contact',
      ]
      const rows = apiData.themes.map((t) => [
        t.themeName,
        String(t.totalContacts),
        String(t.nonInscritsHot),
        String(t.nonInscrits),
        String(t.inscrits),
        t.conversionRate.toFixed(1),
        String(t.totalClicks),
        t.avgClicksPerContact.toFixed(1),
      ])

      downloadCSV(`thematiques_${todayISO()}.csv`, headers, rows)
      setThematiquesState({
        loading: false,
        result: { kind: 'success', message: pluralRows(rows.length, 'thématique exportée', 'thématiques exportées') },
      })
    } catch (err) {
      setThematiquesState({
        loading: false,
        result: { kind: 'error', message: err instanceof Error ? err.message : 'Erreur inconnue' },
      })
    }
  }

  // ── Export Non inscrits ───────────────────────────────────────────────────
  async function exportNonInscrits() {
    setNonInscritsState({ loading: true, result: null })
    try {
      const url = nonInscritsSelectedTheme
        ? `/api/contacts/by-theme?theme=${encodeURIComponent(nonInscritsSelectedTheme)}`
        : '/api/contacts/by-theme'
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok) {
        throw new Error((json as { error?: string })?.error ?? `Erreur ${res.status}`)
      }
      const apiData = json as ContactsApiResponse

      const headers = [
        'Email', 'Contact ID', 'Clics sur le thème', 'Clics totaux', 'Dernier clic', 'Thèmes',
      ]
      const rows = apiData.prospects.map((p) => [
        p.email,
        p.contactId,
        String(p.clicksOnTheme),
        String(p.totalClicks),
        fmtDateFr(p.lastClickOnTheme),
        (p.themes ?? []).map((t) => t.theme).join(', '),
      ])

      const filename = nonInscritsSelectedTheme
        ? `non_inscrits_${slugify(nonInscritsSelectedTheme)}_${todayISO()}.csv`
        : `non_inscrits_${todayISO()}.csv`
      downloadCSV(filename, headers, rows)
      setNonInscritsState({
        loading: false,
        result: { kind: 'success', message: pluralRows(rows.length, 'contact exporté', 'contacts exportés') },
      })
    } catch (err) {
      setNonInscritsState({
        loading: false,
        result: { kind: 'error', message: err instanceof Error ? err.message : 'Erreur inconnue' },
      })
    }
  }

  // ── Export Inscrits ───────────────────────────────────────────────────────
  async function exportInscrits() {
    setInscritsState({ loading: true, result: null })
    try {
      const url = inscritsSelectedTheme
        ? `/api/contacts/inscrits?theme=${encodeURIComponent(inscritsSelectedTheme)}`
        : '/api/contacts/inscrits'
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok) {
        throw new Error((json as { error?: string })?.error ?? `Erreur ${res.status}`)
      }
      const apiData = json as ContactsApiResponse

      const headers = [
        'Email', 'Contact ID', 'Clics sur le thème', 'Clics totaux', 'Dernier clic', 'Formations',
      ]
      const rows = apiData.prospects.map((p) => [
        p.email,
        p.contactId,
        String(p.clicksOnTheme),
        String(p.totalClicks),
        fmtDateFr(p.lastClickOnTheme),
        (p.inscriptions ?? []).map((i) => i.nomFormation).join(', '),
      ])

      const filename = inscritsSelectedTheme
        ? `inscrits_${slugify(inscritsSelectedTheme)}_${todayISO()}.csv`
        : `inscrits_${todayISO()}.csv`
      downloadCSV(filename, headers, rows)
      setInscritsState({
        loading: false,
        result: { kind: 'success', message: pluralRows(rows.length, 'contact exporté', 'contacts exportés') },
      })
    } catch (err) {
      setInscritsState({
        loading: false,
        result: { kind: 'error', message: err instanceof Error ? err.message : 'Erreur inconnue' },
      })
    }
  }

  return (
    <div className="px-8 py-8 max-w-[1200px]">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[#0a0a0a] tracking-tight">Export</h1>
        <p className="text-sm text-[#737373] mt-0.5">
          Export CSV centralisé — données issues de Supabase. Format Excel FR (séparateur point-virgule, BOM UTF-8).
        </p>
      </div>

      <div className="space-y-4">
        <ExportCard
          title="Thématiques"
          description="Agrégat par thème — contacts uniques, prospects chauds, taux de conversion, clics."
          state={thematiquesState}
          onExport={exportThematiques}
          buttonLabel="Exporter les thématiques"
        />

        <ExportCard
          title="Contacts non inscrits"
          description="Contacts non inscrits avec ≥3 clics sur au moins un thème — filtrable par thématique."
          state={nonInscritsState}
          onExport={exportNonInscrits}
          buttonLabel="Exporter les non inscrits"
          dropdown={{
            value: nonInscritsSelectedTheme,
            onChange: setNonInscritsSelectedTheme,
            options: nonInscritsThemes,
            loading: themesLoading,
          }}
        />

        <ExportCard
          title="Contacts inscrits"
          description="Contacts inscrits avec ≥3 clics sur au moins un thème — filtrable par thématique."
          state={inscritsState}
          onExport={exportInscrits}
          buttonLabel="Exporter les inscrits"
          dropdown={{
            value: inscritsSelectedTheme,
            onChange: setInscritsSelectedTheme,
            options: inscritsThemes,
            loading: themesLoading,
          }}
        />
      </div>

      {themesError && (
        <div className="mt-4 text-xs text-[#a3a3a3]">
          Note : le chargement des thèmes a échoué ({themesError}). L&apos;export sans filtre reste possible.
        </div>
      )}
    </div>
  )
}
