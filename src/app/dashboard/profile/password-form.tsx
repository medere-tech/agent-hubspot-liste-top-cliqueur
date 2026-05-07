'use client'

import { useState } from 'react'

const MIN_LEN = 8

function Spinner({ size = 12 }: { size?: number }) {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="#d4d4d4" strokeWidth="1.5" />
      <path d="M7 2a5 5 0 015 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 border border-[#e5e5e5] bg-[#fafafa] rounded-[4px]">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0" aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" stroke="#0a0a0a" strokeWidth="1.2" />
        <path d="M4.5 7l2 2 3-4" stroke="#0a0a0a" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-xs text-[#0a0a0a]">{message}</span>
    </div>
  )
}

export default function PasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const currentTouched = current.length > 0
  const nextTouched = next.length > 0
  const confirmTouched = confirm.length > 0

  const currentInvalid = currentTouched && current.length < MIN_LEN
  const nextInvalid = nextTouched && next.length < MIN_LEN
  const sameAsCurrent = nextTouched && next === current && next.length > 0
  const mismatch = confirmTouched && confirm !== next

  const canSubmit =
    current.length >= MIN_LEN &&
    next.length >= MIN_LEN &&
    next !== current &&
    next === confirm &&
    !submitting

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    setSuccess(false)
    try {
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: current,
          new_password: next,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Échec du changement de mot de passe')
        return
      }
      setSuccess(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="border border-[#e5e5e5] rounded-[4px] bg-white p-6">
      <h2 className="text-sm font-medium text-[#0a0a0a] mb-4 tracking-wide uppercase">
        Changer le mot de passe
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Mot de passe actuel */}
        <div>
          <label className="block text-xs font-medium text-[#0a0a0a] mb-1.5 tracking-wide">
            Mot de passe actuel
          </label>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={submitting}
              autoComplete="current-password"
              className={`w-full pr-10 px-3 py-2.5 border bg-white text-sm text-[#0a0a0a] rounded-[4px] outline-none transition-colors disabled:opacity-50 ${
                currentInvalid
                  ? 'border-red-400 ring-1 ring-red-400'
                  : 'border-[#e5e5e5] focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]'
              }`}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowCurrent((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a3a3a3] hover:text-[#0a0a0a]"
              aria-label={showCurrent ? 'Masquer' : 'Afficher'}
            >
              <svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                <path d="M1 7.5S3.5 3 7.5 3s6.5 4.5 6.5 4.5S11.5 12 7.5 12 1 7.5 1 7.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <circle cx="7.5" cy="7.5" r="1.75" stroke="currentColor" strokeWidth="1.2" />
                {showCurrent && <path d="M2 2l11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />}
              </svg>
            </button>
          </div>
          {currentInvalid && (
            <p className="mt-1 text-xs text-red-600">Minimum {MIN_LEN} caractères.</p>
          )}
        </div>

        {/* Nouveau mot de passe */}
        <div>
          <label className="block text-xs font-medium text-[#0a0a0a] mb-1.5 tracking-wide">
            Nouveau mot de passe
          </label>
          <div className="relative">
            <input
              type={showNext ? 'text' : 'password'}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={submitting}
              autoComplete="new-password"
              className={`w-full pr-10 px-3 py-2.5 border bg-white text-sm text-[#0a0a0a] rounded-[4px] outline-none transition-colors disabled:opacity-50 ${
                nextInvalid || sameAsCurrent
                  ? 'border-red-400 ring-1 ring-red-400'
                  : 'border-[#e5e5e5] focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]'
              }`}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowNext((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a3a3a3] hover:text-[#0a0a0a]"
              aria-label={showNext ? 'Masquer' : 'Afficher'}
            >
              <svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                <path d="M1 7.5S3.5 3 7.5 3s6.5 4.5 6.5 4.5S11.5 12 7.5 12 1 7.5 1 7.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <circle cx="7.5" cy="7.5" r="1.75" stroke="currentColor" strokeWidth="1.2" />
                {showNext && <path d="M2 2l11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />}
              </svg>
            </button>
          </div>
          {nextInvalid && (
            <p className="mt-1 text-xs text-red-600">Minimum {MIN_LEN} caractères.</p>
          )}
          {sameAsCurrent && !nextInvalid && (
            <p className="mt-1 text-xs text-red-600">Doit être différent du mot de passe actuel.</p>
          )}
        </div>

        {/* Confirmation */}
        <div>
          <label className="block text-xs font-medium text-[#0a0a0a] mb-1.5 tracking-wide">
            Confirmer le nouveau mot de passe
          </label>
          <input
            type={showNext ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={submitting}
            autoComplete="new-password"
            className={`w-full px-3 py-2.5 border bg-white text-sm text-[#0a0a0a] rounded-[4px] outline-none transition-colors disabled:opacity-50 ${
              mismatch
                ? 'border-red-400 ring-1 ring-red-400'
                : 'border-[#e5e5e5] focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]'
            }`}
          />
          {mismatch && (
            <p className="mt-1 text-xs text-red-600">Les mots de passe ne correspondent pas.</p>
          )}
        </div>

        {error && <ErrorBanner message={error} />}
        {success && (
          <SuccessBanner message="Mot de passe mis à jour. Utilisez-le à votre prochaine connexion." />
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#0a0a0a] rounded-[4px] hover:bg-[#1a1a1a] disabled:bg-[#e5e5e5] disabled:text-[#a3a3a3] disabled:cursor-not-allowed"
          >
            {submitting && <Spinner size={12} />}
            Mettre à jour
          </button>
        </div>
      </form>
    </div>
  )
}
