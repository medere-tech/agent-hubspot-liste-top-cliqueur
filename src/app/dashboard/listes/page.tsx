'use client'

import type { EnrichedTopClicker, MarketingEmail } from '@/lib/hubspot'
import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Source = 'inscrits' | 'non_inscrits' | 'thematique'

interface TopCliqueurApiResponse {
  contacts: EnrichedTopClicker[]
  segments: {
    inscrits: EnrichedTopClicker[]
    non_inscrits_engages: EnrichedTopClicker[]
  }
}

interface CampaignsApiResponse {
  emails: { data: MarketingEmail[] }
}

interface HubSpotList {
  listId: string
  name: string
  createdAt?: string
  additionalProperties?: {
    hs_list_size?: string
  }
}

interface ListesApiResponse {
  lists: HubSpotList[]
  portalId: number | null
}

interface CreateResult {
  success: boolean
  listId?: number
  listName?: string
  count?: number
  error?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5" stroke="#d4d4d4" strokeWidth="1.5" />
      <path d="M7 2a5 5 0 015 5" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 border border-[#fecaca] bg-[#fef2f2] rounded-[4px]">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0" aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" stroke="#ef4444" strokeWidth="1.2" />
        <path d="M7 4.5v3M7 9.5v.2" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span className="text-xs text-[#b91c1c]">{message}</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ListesPage() {
  // ── Data state ─────────────────────────────────────────────────────────────
  const [topData, setTopData] = useState<TopCliqueurApiResponse | null>(null)
  const [themes, setThemes] = useState<string[]>([])
  const [existingLists, setExistingLists] = useState<HubSpotList[]>([])
  const [portalId, setPortalId] = useState<number | null>(null)

  const [loadingData, setLoadingData] = useState(true)
  const [loadingLists, setLoadingLists] = useState(true)
  const [dataError, setDataError] = useState('')
  const [listsError, setListsError] = useState('')

  // ── Form state ─────────────────────────────────────────────────────────────
  const [listName, setListName] = useState('')
  const [source, setSource] = useState<Source>('inscrits')
  const [selectedTheme, setSelectedTheme] = useState('')
  const [filterTheme, setFilterTheme] = useState('')   // filtre optionnel pour inscrits/non_inscrits
  const [creating, setCreating] = useState(false)
  const [createResult, setCreateResult] = useState<CreateResult | null>(null)

  const nameInputRef = useRef<HTMLInputElement>(null)

  // ── Fetch top cliqueurs + campaigns ────────────────────────────────────────
  const fetchInitialData = useCallback(async () => {
    setLoadingData(true)
    setDataError('')
    try {
      const [topRes, campaignsRes] = await Promise.all([
        fetch('/api/hubspot/top-cliqueurs'),
        fetch('/api/hubspot/campaigns?days=360'),
      ])

      if (!topRes.ok) throw new Error(`Erreur top cliqueurs: ${topRes.status}`)
      const topJson = (await topRes.json()) as TopCliqueurApiResponse
      setTopData(topJson)

      if (campaignsRes.ok) {
        const campJson = (await campaignsRes.json()) as CampaignsApiResponse
        setThemes(uniqueSortedThemes(campJson.emails?.data ?? []))
      }
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoadingData(false)
    }
  }, [])

  // ── Fetch existing lists ────────────────────────────────────────────────────
  const fetchExistingLists = useCallback(async () => {
    setLoadingLists(true)
    setListsError('')
    try {
      const res = await fetch('/api/hubspot/listes')
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        throw new Error(json.error ?? `Erreur ${res.status}`)
      }
      const json = (await res.json()) as ListesApiResponse
      setExistingLists(json.lists ?? [])
      setPortalId(json.portalId ?? null)
    } catch (err) {
      setListsError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoadingLists(false)
    }
  }, [])

  // ── Lire les params URL (source= et theme= envoyés depuis top-cliqueurs) ───
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const s = params.get('source')
    const t = params.get('theme')
    if (s === 'inscrits' || s === 'non_inscrits' || s === 'thematique') {
      setSource(s)
    }
    if (t) setFilterTheme(t)
  }, [])

  useEffect(() => {
    fetchInitialData()
    fetchExistingLists()
  }, [fetchInitialData, fetchExistingLists])

  // Reset theme states when source changes
  useEffect(() => {
    if (source !== 'thematique') setSelectedTheme('')
    if (source === 'thematique') setFilterTheme('')
    setCreateResult(null)
  }, [source])

  // ── Compute emails for selected source ─────────────────────────────────────
  const contactEmails: string[] = (() => {
    if (!topData) return []

    if (source === 'inscrits' || source === 'non_inscrits') {
      const base =
        source === 'inscrits'
          ? topData.segments.inscrits
          : topData.segments.non_inscrits_engages
      if (filterTheme) {
        return base
          .filter((c) =>
            c.inscriptions.some((ins) =>
              ins.nomFormation.toLowerCase().includes(filterTheme.toLowerCase())
            )
          )
          .map((c) => c.emailAddress)
      }
      return base.map((c) => c.emailAddress)
    }

    // thematique: inscrits whose formation name includes the selected theme
    if (selectedTheme) {
      return topData.segments.inscrits
        .filter((c) =>
          c.inscriptions.some((ins) =>
            ins.nomFormation.toLowerCase().includes(selectedTheme.toLowerCase())
          )
        )
        .map((c) => c.emailAddress)
    }
    return []
  })()

  const contactCount = contactEmails.length

  // ── Form submit ─────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!listName.trim() || creating) return
    if (source === 'thematique' && !selectedTheme) return

    setCreating(true)
    setCreateResult(null)

    try {
      const theme = source === 'thematique' ? selectedTheme : filterTheme || undefined
      const res = await fetch('/api/hubspot/listes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: listName.trim(),
          contactEmails,
          source,
          ...(theme ? { theme } : {}),
        }),
      })

      const json = (await res.json()) as CreateResult & { error?: string }
      if (!res.ok) {
        setCreateResult({ success: false, error: json.error ?? `Erreur ${res.status}` })
      } else {
        setCreateResult({ ...json, success: true })
        setListName('')
        // Refresh existing lists
        await fetchExistingLists()
      }
    } catch (err) {
      setCreateResult({ success: false, error: err instanceof Error ? err.message : 'Erreur inconnue' })
    } finally {
      setCreating(false)
    }
  }

  const canSubmit =
    listName.trim() !== '' &&
    !creating &&
    !loadingData &&
    (source !== 'thematique' || selectedTheme !== '')

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="px-8 py-8 max-w-[1200px]">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[#0a0a0a] tracking-tight">Listes HubSpot</h1>
        <p className="text-sm text-[#737373] mt-0.5">
          Création de listes statiques depuis les top cliqueurs et thématiques
        </p>
      </div>

      {dataError && (
        <div className="mb-6">
          <ErrorBanner message={dataError} />
        </div>
      )}

      {/* ── SECTION A — Créer une liste ─────────────────────────────────────── */}
      <div className="bg-white border border-[#e5e5e5] rounded-[6px] mb-6">

        <div className="px-6 py-4 border-b border-[#e5e5e5]">
          <h2 className="text-sm font-semibold text-[#0a0a0a]">Créer une liste</h2>
          <p className="text-xs text-[#a3a3a3] mt-0.5">
            La liste sera créée en statique dans HubSpot. Aucune liste existante ne sera supprimée.
          </p>
        </div>

        <div className="px-6 py-6 space-y-5">

          {/* Nom de la liste */}
          <div>
            <label className="block text-xs font-medium text-[#0a0a0a] mb-1.5">
              Nom de la liste
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder="Ex : Top cliqueurs MG — Sommeil 04/2026"
              className="w-full max-w-[480px] px-3 py-2.5 text-sm text-[#0a0a0a] placeholder-[#a3a3a3] bg-white border border-[#e5e5e5] rounded-[4px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] transition-all"
            />
          </div>

          {/* Source */}
          <div>
            <label className="block text-xs font-medium text-[#0a0a0a] mb-1.5">
              Source des contacts
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {(
                [
                  { value: 'inscrits', label: 'Top cliqueurs inscrits' },
                  { value: 'non_inscrits', label: 'Top cliqueurs non inscrits' },
                  { value: 'thematique', label: 'Thématique' },
                ] as { value: Source; label: string }[]
              ).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSource(value)}
                  className={`px-3 py-2 text-xs font-medium rounded-[4px] border transition-colors ${
                    source === value
                      ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]'
                      : 'bg-white text-[#737373] border-[#e5e5e5] hover:border-[#0a0a0a] hover:text-[#0a0a0a]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Filtre thématique optionnel pour inscrits et non_inscrits */}
          {(source === 'inscrits' || source === 'non_inscrits') && themes.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[#0a0a0a] mb-1.5">
                Filtrer par thématique{' '}
                <span className="text-[#a3a3a3] font-normal">(optionnel)</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <select
                    value={filterTheme}
                    onChange={(e) => setFilterTheme(e.target.value)}
                    className="pl-3 pr-8 py-2.5 text-sm text-[#0a0a0a] bg-white border border-[#e5e5e5] rounded-[4px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] transition-all appearance-none"
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
                {filterTheme && (
                  <button
                    type="button"
                    onClick={() => setFilterTheme('')}
                    className="text-xs text-[#a3a3a3] hover:text-[#0a0a0a] transition-colors"
                  >
                    Effacer
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Dropdown thème principal (source = thematique) */}
          {source === 'thematique' && (
            <div>
              <label className="block text-xs font-medium text-[#0a0a0a] mb-1.5">
                Thématique
              </label>
              {themes.length === 0 ? (
                <p className="text-xs text-[#a3a3a3]">
                  {loadingData ? 'Chargement des thèmes…' : 'Aucune thématique disponible'}
                </p>
              ) : (
                <select
                  value={selectedTheme}
                  onChange={(e) => setSelectedTheme(e.target.value)}
                  className="w-full max-w-[480px] px-3 py-2.5 text-sm text-[#0a0a0a] bg-white border border-[#e5e5e5] rounded-[4px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] transition-all appearance-none"
                >
                  <option value="">— Choisir une thématique —</option>
                  {themes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Preview nom HubSpot + contacts count */}
          {!loadingData && (source !== 'thematique' || selectedTheme) && (
            <div className="space-y-1">
              {listName.trim() && (
                <p className="text-xs text-[#737373]">
                  Nom dans HubSpot :{' '}
                  <span className="font-mono font-medium text-[#0a0a0a]">
                    [Agent] {listName.trim()}
                  </span>
                </p>
              )}
              <p className="text-xs text-[#737373]">
                <span className="font-semibold text-[#0a0a0a]">{contactCount}</span>{' '}
                contact{contactCount !== 1 ? 's' : ''} seront ajoutés à la liste
              </p>
            </div>
          )}

          {/* Feedback */}
          {createResult && (
            <div className={`flex items-start gap-2.5 px-4 py-3 rounded-[4px] border ${
              createResult.success
                ? 'bg-white border-[#d4d4d4]'
                : 'bg-[#fef2f2] border-[#fecaca]'
            }`}>
              {createResult.success ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 mt-0.5" aria-hidden="true">
                    <circle cx="7" cy="7" r="5.5" stroke="#22c55e" strokeWidth="1.2" />
                    <path d="M4.5 7l2 2 3-3" stroke="#22c55e" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-xs text-[#0a0a0a]">
                    Liste <strong>{createResult.listName}</strong> créée avec{' '}
                    <strong>{createResult.count}</strong> contact{(createResult.count ?? 0) !== 1 ? 's' : ''}.
                    {portalId && (
                      <>
                        {' '}
                        <a
                          href={`https://app.hubspot.com/contacts/${portalId}/lists/${createResult.listId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline text-[#0a0a0a] hover:text-[#737373]"
                        >
                          Voir dans HubSpot
                        </a>
                      </>
                    )}
                  </span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 mt-0.5" aria-hidden="true">
                    <circle cx="7" cy="7" r="5.5" stroke="#ef4444" strokeWidth="1.2" />
                    <path d="M7 4.5v3M7 9.5v.2" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  <span className="text-xs text-[#b91c1c]">{createResult.error}</span>
                </>
              )}
            </div>
          )}

          {/* Submit */}
          <div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!canSubmit}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-[4px] border transition-colors ${
                canSubmit
                  ? 'bg-[#0a0a0a] text-white border-[#0a0a0a] hover:bg-[#262626]'
                  : 'bg-[#f5f5f5] text-[#a3a3a3] border-[#e5e5e5] cursor-not-allowed'
              }`}
            >
              {creating ? (
                <>
                  <Spinner />
                  Création en cours…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M5 7h4M7 5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  Créer dans HubSpot
                </>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* ── SECTION B — Listes existantes ───────────────────────────────────── */}
      <div className="bg-white border border-[#e5e5e5] rounded-[6px]">

        <div className="px-6 py-4 border-b border-[#e5e5e5] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#0a0a0a]">Listes existantes</h2>
            <p className="text-xs text-[#a3a3a3] mt-0.5">50 dernières listes statiques HubSpot</p>
          </div>
          <button
            type="button"
            onClick={fetchExistingLists}
            disabled={loadingLists}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#737373] bg-white border border-[#e5e5e5] rounded-[4px] hover:border-[#0a0a0a] hover:text-[#0a0a0a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M10.5 6A4.5 4.5 0 111.5 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M10.5 3v3h-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Actualiser
          </button>
        </div>

        {listsError && (
          <div className="px-6 py-4">
            <ErrorBanner message={listsError} />
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#f5f5f5]">
              <th className="px-6 py-3 text-left text-xs font-medium text-[#a3a3a3] tracking-wide uppercase">
                Nom de la liste
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#a3a3a3] tracking-wide uppercase">
                Contacts
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#a3a3a3] tracking-wide uppercase">
                Créée le
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-[#a3a3a3] tracking-wide uppercase">
                Lien
              </th>
            </tr>
          </thead>
          <tbody>
            {loadingLists ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#f5f5f5] last:border-0">
                  <td className="px-6 py-3.5">
                    <div className="h-4 w-56 bg-[#f5f5f5] rounded animate-pulse" />
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="h-4 w-12 bg-[#f5f5f5] rounded animate-pulse" />
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="h-4 w-24 bg-[#f5f5f5] rounded animate-pulse" />
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="h-4 w-16 bg-[#f5f5f5] rounded animate-pulse ml-auto" />
                  </td>
                </tr>
              ))
            ) : existingLists.length === 0 && !listsError ? (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-sm text-[#a3a3a3]">
                  Aucune liste statique trouvée.
                </td>
              </tr>
            ) : (
              existingLists.map((list) => (
                <tr
                  key={list.listId}
                  className="border-b border-[#f5f5f5] last:border-0 hover:bg-[#fafafa] transition-colors"
                >
                  <td className="px-6 py-3.5 font-medium text-[#0a0a0a]">{list.name}</td>
                  <td className="px-6 py-3.5 text-[#737373] tabular-nums">
                    {list.additionalProperties?.hs_list_size != null
                      ? parseInt(list.additionalProperties.hs_list_size, 10).toLocaleString('fr-FR')
                      : '—'}
                  </td>
                  <td className="px-6 py-3.5 text-[#737373]">{fmtDate(list.createdAt)}</td>
                  <td className="px-6 py-3.5 text-right">
                    {portalId ? (
                      <a
                        href={`https://app.hubspot.com/contacts/${portalId}/lists/${list.listId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[#737373] hover:text-[#0a0a0a] transition-colors"
                      >
                        HubSpot
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                          <path d="M2 8L8 2M8 2H4.5M8 2v3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </a>
                    ) : (
                      <span className="text-xs text-[#d4d4d4]">—</span>
                    )}
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
