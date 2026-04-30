'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

type Source = 'inscrits' | 'non_inscrits' | 'prospects_chauds'

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
  listId?: string
  listName?: string
  count?: number
  error?: string
}

// Forme commune des contacts retournés par /api/contacts/by-theme et /api/contacts/inscrits.
// La route inscrits ajoute `inscriptions`, qu'on ignore côté tableau.
interface ContactItem {
  email: string
  contactId: string
  totalClicks: number
  clicksOnTheme: number
  lastClickOnTheme: string
}

interface ContactsApiResponse {
  theme: string | null
  minClicks: number
  count: number
  prospects: ContactItem[]
  uniqueThemes: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
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

// Tableau preview commun aux 3 modes.
function PreviewTable({
  data, loading, selectedTheme, error, emptyAllMessage, emptyFilteredMessage,
}: {
  data: ContactItem[] | null
  loading: boolean
  selectedTheme: string
  error: string
  emptyAllMessage: string
  emptyFilteredMessage: string
}) {
  return (
    <>
      {error && <div className="mb-3"><ErrorBanner message={error} /></div>}
      <div className="border border-[#e5e5e5] rounded-[4px] overflow-hidden max-h-[360px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#fafafa] sticky top-0">
            <tr className="border-b border-[#e5e5e5]">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#a3a3a3] tracking-wide uppercase">
                Email
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-[#a3a3a3] tracking-wide uppercase">
                {selectedTheme ? 'Clics sur le thème' : 'Clics totaux'}
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#a3a3a3] tracking-wide uppercase">
                Dernier clic
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#f5f5f5] last:border-0">
                  <td className="px-4 py-2.5"><div className="h-4 w-48 bg-[#f5f5f5] rounded animate-pulse" /></td>
                  <td className="px-4 py-2.5"><div className="h-4 w-8 bg-[#f5f5f5] rounded animate-pulse ml-auto" /></td>
                  <td className="px-4 py-2.5"><div className="h-4 w-20 bg-[#f5f5f5] rounded animate-pulse" /></td>
                </tr>
              ))
            ) : (data?.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-[#a3a3a3]">
                  {selectedTheme ? emptyFilteredMessage : emptyAllMessage}
                </td>
              </tr>
            ) : (
              data!.map((p) => (
                <tr key={p.email} className="border-b border-[#f5f5f5] last:border-0 hover:bg-[#fafafa] transition-colors">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/dashboard/contacts/${encodeURIComponent(p.email)}`}
                      className="text-[#0a0a0a] hover:underline cursor-pointer"
                    >
                      {p.email}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-[#0a0a0a] tabular-nums text-right">{p.clicksOnTheme}</td>
                  <td className="px-4 py-2.5 text-[#737373]">{fmtDate(p.lastClickOnTheme)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

// Dropdown thème commun aux modes inscrits/non_inscrits.
function ThemeFilterDropdown({
  value, onChange, options, loading,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  loading: boolean
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={loading && options.length === 0}
          className="pl-3 pr-8 py-2.5 text-sm text-[#0a0a0a] bg-white border border-[#e5e5e5] rounded-[4px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] transition-all appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Toutes les thématiques</option>
          {options.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M2 3.5l3 3 3-3" stroke="#a3a3a3" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-xs text-[#a3a3a3] hover:text-[#0a0a0a] transition-colors cursor-pointer"
        >
          Effacer
        </button>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ListesPage() {
  // ── Listes existantes ─────────────────────────────────────────────────────
  const [existingLists, setExistingLists] = useState<HubSpotList[]>([])
  const [portalId, setPortalId] = useState<number | null>(null)
  const [loadingLists, setLoadingLists] = useState(true)
  const [listsError, setListsError] = useState('')

  // ── Form state ─────────────────────────────────────────────────────────────
  const [listName, setListName] = useState('')
  const [source, setSource] = useState<Source>('inscrits')
  const [creating, setCreating] = useState(false)
  const [createResult, setCreateResult] = useState<CreateResult | null>(null)

  // ── Inscrits state (Supabase) ──────────────────────────────────────────────
  const [inscritsData, setInscritsData] = useState<ContactItem[] | null>(null)
  const [inscritsThemes, setInscritsThemes] = useState<string[]>([])
  const [inscritsSelectedTheme, setInscritsSelectedTheme] = useState('')
  const [inscritsLoading, setInscritsLoading] = useState(false)
  const [inscritsError, setInscritsError] = useState('')

  // ── Non-inscrits state (Supabase) ──────────────────────────────────────────
  const [nonInscritsData, setNonInscritsData] = useState<ContactItem[] | null>(null)
  const [nonInscritsThemes, setNonInscritsThemes] = useState<string[]>([])
  const [nonInscritsSelectedTheme, setNonInscritsSelectedTheme] = useState('')
  const [nonInscritsLoading, setNonInscritsLoading] = useState(false)
  const [nonInscritsError, setNonInscritsError] = useState('')

  // ── Prospects chauds state (Supabase, URL-driven) ──────────────────────────
  const [prospectsTheme, setProspectsTheme] = useState('')
  const [prospectsData, setProspectsData] = useState<ContactItem[] | null>(null)
  const [prospectsLoading, setProspectsLoading] = useState(false)
  const [prospectsError, setProspectsError] = useState('')

  const nameInputRef = useRef<HTMLInputElement>(null)

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

  // ── Lire les params URL ────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const s = params.get('source')
    const t = params.get('theme')

    if (s === 'prospects_chauds' && t) {
      setSource('prospects_chauds')
      setProspectsTheme(t)
      setListName(`Prospects chauds — ${t}`)
      return
    }

    if (s === 'inscrits' || s === 'non_inscrits') {
      setSource(s)
      if (t && s === 'inscrits') setInscritsSelectedTheme(t)
      if (t && s === 'non_inscrits') setNonInscritsSelectedTheme(t)
    }
  }, [])

  useEffect(() => {
    fetchExistingLists()
  }, [fetchExistingLists])

  // Reset feedback on source change
  useEffect(() => {
    setCreateResult(null)
  }, [source])

  // ── Fetch inscrits ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (source !== 'inscrits') return
    let cancelled = false
    const load = async () => {
      setInscritsLoading(true)
      setInscritsError('')
      try {
        const url = inscritsSelectedTheme
          ? `/api/contacts/inscrits?theme=${encodeURIComponent(inscritsSelectedTheme)}`
          : '/api/contacts/inscrits'
        const res = await fetch(url)
        const json = await res.json()
        if (!res.ok) {
          throw new Error((json as { error?: string })?.error ?? `Erreur ${res.status}`)
        }
        if (cancelled) return
        const apiData = json as ContactsApiResponse
        setInscritsData(apiData.prospects ?? [])
        setInscritsThemes(apiData.uniqueThemes ?? [])
      } catch (err) {
        if (!cancelled) setInscritsError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        if (!cancelled) setInscritsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [source, inscritsSelectedTheme])

  // ── Fetch non-inscrits ─────────────────────────────────────────────────────
  useEffect(() => {
    if (source !== 'non_inscrits') return
    let cancelled = false
    const load = async () => {
      setNonInscritsLoading(true)
      setNonInscritsError('')
      try {
        const url = nonInscritsSelectedTheme
          ? `/api/contacts/by-theme?theme=${encodeURIComponent(nonInscritsSelectedTheme)}`
          : '/api/contacts/by-theme'
        const res = await fetch(url)
        const json = await res.json()
        if (!res.ok) {
          throw new Error((json as { error?: string })?.error ?? `Erreur ${res.status}`)
        }
        if (cancelled) return
        const apiData = json as ContactsApiResponse
        setNonInscritsData(apiData.prospects ?? [])
        setNonInscritsThemes(apiData.uniqueThemes ?? [])
      } catch (err) {
        if (!cancelled) setNonInscritsError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        if (!cancelled) setNonInscritsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [source, nonInscritsSelectedTheme])

  // ── Fetch prospects chauds ─────────────────────────────────────────────────
  useEffect(() => {
    if (source !== 'prospects_chauds' || !prospectsTheme) return
    let cancelled = false
    const load = async () => {
      setProspectsLoading(true)
      setProspectsError('')
      try {
        const res = await fetch(`/api/contacts/by-theme?theme=${encodeURIComponent(prospectsTheme)}`)
        const json = await res.json()
        if (!res.ok) {
          throw new Error((json as { error?: string })?.error ?? `Erreur ${res.status}`)
        }
        if (!cancelled) setProspectsData((json as ContactsApiResponse).prospects ?? [])
      } catch (err) {
        if (!cancelled) setProspectsError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        if (!cancelled) setProspectsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [source, prospectsTheme])

  // ── Compute emails for selected source ─────────────────────────────────────
  const contactEmails: string[] = (() => {
    if (source === 'prospects_chauds') return prospectsData?.map((p) => p.email) ?? []
    if (source === 'non_inscrits')     return nonInscritsData?.map((p) => p.email) ?? []
    if (source === 'inscrits')         return inscritsData?.map((p) => p.email) ?? []
    return []
  })()

  const contactCount = contactEmails.length

  // ── Form submit ─────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!listName.trim() || creating) return
    if (contactCount === 0) return

    setCreating(true)
    setCreateResult(null)

    try {
      // L'API valide source ∈ {inscrits, non_inscrits, thematique} ; on map
      // prospects_chauds → 'thematique' pour passer la validation. Cette valeur
      // est seulement validée côté API, pas utilisée dans la création.
      const apiSource = source === 'prospects_chauds' ? 'thematique' : source
      const theme =
        source === 'prospects_chauds' ? prospectsTheme :
        source === 'inscrits'         ? (inscritsSelectedTheme || undefined) :
        source === 'non_inscrits'     ? (nonInscritsSelectedTheme || undefined) :
        undefined

      const res = await fetch('/api/hubspot/listes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: listName.trim(),
          contactEmails,
          source: apiSource,
          ...(theme ? { theme } : {}),
        }),
      })

      const json = (await res.json()) as CreateResult & { error?: string }
      if (!res.ok) {
        setCreateResult({ success: false, error: json.error ?? `Erreur ${res.status}` })
      } else {
        setCreateResult({ ...json, success: true })
        setListName('')

        // Optimistic UI — prepend the new list immediately
        const newListId = json.listId != null ? String(json.listId) : null
        const optimistic: HubSpotList | null = newListId
          ? {
              listId: newListId,
              name: (json.listName ?? '').replace(/^\[Agent\]\s*/, ''),
              createdAt: new Date().toISOString(),
              additionalProperties: { hs_list_size: String(json.count ?? 0) },
            }
          : null

        if (optimistic) {
          setExistingLists((prev) => [
            optimistic,
            ...prev.filter((l) => l.listId !== optimistic.listId),
          ])
        }

        // Refresh — keep optimistic on top if HubSpot index lags
        try {
          const listsRes = await fetch('/api/hubspot/listes')
          if (listsRes.ok) {
            const listsJson = (await listsRes.json()) as ListesApiResponse
            const fetched = listsJson.lists ?? []
            if (optimistic && !fetched.some((l) => l.listId === optimistic.listId)) {
              setExistingLists([optimistic, ...fetched])
            } else {
              setExistingLists(fetched)
            }
            setPortalId(listsJson.portalId ?? null)
          }
        } catch {
          // optimistic is shown — silent fail
        }
      }
    } catch (err) {
      setCreateResult({ success: false, error: err instanceof Error ? err.message : 'Erreur inconnue' })
    } finally {
      setCreating(false)
    }
  }

  const sourceLoading =
    source === 'prospects_chauds' ? prospectsLoading :
    source === 'non_inscrits'     ? nonInscritsLoading :
    inscritsLoading

  const canSubmit =
    listName.trim() !== '' &&
    !creating &&
    !sourceLoading &&
    contactCount > 0

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="px-8 py-8 max-w-[1200px]">

      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[#0a0a0a] tracking-tight">Listes HubSpot</h1>
        <p className="text-sm text-[#737373] mt-0.5">
          Création de listes statiques depuis les contacts cliqueurs (≥3 clics par thème)
        </p>
      </div>

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
                  { value: 'inscrits',     label: 'Inscrits' },
                  { value: 'non_inscrits', label: 'Non inscrits' },
                  ...(prospectsTheme
                    ? [{ value: 'prospects_chauds' as Source, label: 'Prospects chauds' }]
                    : []),
                ] as { value: Source; label: string }[]
              ).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSource(value)}
                  className={`px-3 py-2 text-xs font-medium rounded-[4px] border transition-colors cursor-pointer ${
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

          {/* Mode inscrits */}
          {source === 'inscrits' && (
            <div>
              <label className="block text-xs font-medium text-[#0a0a0a] mb-1.5">
                Filtrer par thématique{' '}
                <span className="text-[#a3a3a3] font-normal">(optionnel)</span>
              </label>
              <ThemeFilterDropdown
                value={inscritsSelectedTheme}
                onChange={setInscritsSelectedTheme}
                options={inscritsThemes}
                loading={inscritsLoading}
              />
              <PreviewTable
                data={inscritsData}
                loading={inscritsLoading}
                selectedTheme={inscritsSelectedTheme}
                error={inscritsError}
                emptyAllMessage="Aucun inscrit avec thématique en base."
                emptyFilteredMessage="Aucun inscrit n'a cliqué sur ce thème."
              />
            </div>
          )}

          {/* Mode non_inscrits */}
          {source === 'non_inscrits' && (
            <div>
              <label className="block text-xs font-medium text-[#0a0a0a] mb-1.5">
                Filtrer par thématique{' '}
                <span className="text-[#a3a3a3] font-normal">(optionnel)</span>
              </label>
              <ThemeFilterDropdown
                value={nonInscritsSelectedTheme}
                onChange={setNonInscritsSelectedTheme}
                options={nonInscritsThemes}
                loading={nonInscritsLoading}
              />
              <PreviewTable
                data={nonInscritsData}
                loading={nonInscritsLoading}
                selectedTheme={nonInscritsSelectedTheme}
                error={nonInscritsError}
                emptyAllMessage="Aucun non-inscrit avec thématique en base."
                emptyFilteredMessage="Aucun non-inscrit n'a cliqué sur ce thème."
              />
            </div>
          )}

          {/* Mode prospects_chauds */}
          {source === 'prospects_chauds' && (
            <div>
              <label className="block text-xs font-medium text-[#0a0a0a] mb-1.5">
                Aperçu des prospects chauds — {prospectsTheme}
              </label>
              <PreviewTable
                data={prospectsData}
                loading={prospectsLoading}
                selectedTheme={prospectsTheme}
                error={prospectsError}
                emptyAllMessage="Aucun prospect chaud."
                emptyFilteredMessage="Aucun prospect chaud sur ce thème."
              />
            </div>
          )}

          {/* Preview nom HubSpot + count */}
          {!sourceLoading && (
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
                          href={`https://app-eu1.hubspot.com/contacts/${portalId}/objectLists/${createResult.listId}`}
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
                  ? 'bg-[#0a0a0a] text-white border-[#0a0a0a] hover:bg-[#262626] cursor-pointer'
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
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#737373] bg-white border border-[#e5e5e5] rounded-[4px] hover:border-[#0a0a0a] hover:text-[#0a0a0a] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                  <td className="px-6 py-3.5"><div className="h-4 w-56 bg-[#f5f5f5] rounded animate-pulse" /></td>
                  <td className="px-6 py-3.5"><div className="h-4 w-12 bg-[#f5f5f5] rounded animate-pulse" /></td>
                  <td className="px-6 py-3.5"><div className="h-4 w-24 bg-[#f5f5f5] rounded animate-pulse" /></td>
                  <td className="px-6 py-3.5"><div className="h-4 w-16 bg-[#f5f5f5] rounded animate-pulse ml-auto" /></td>
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
                        href={`https://app-eu1.hubspot.com/contacts/${portalId}/objectLists/${list.listId}`}
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
