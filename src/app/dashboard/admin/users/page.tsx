'use client'

import { useCallback, useEffect, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'user'
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

interface CreateForm {
  email: string
  full_name: string
  role: 'admin' | 'user'
  password: string
}

interface EditForm {
  email: string
  full_name: string
  role: 'admin' | 'user'
  is_active: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MEDERE_EMAIL_REGEX = /^[^@\s]+@medere\.fr$/i

function fmtDate(iso: string | null): string {
  if (!iso) return 'Jamais'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

// ─── UI Atoms ─────────────────────────────────────────────────────────────────

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
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

function InfoBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 border border-[#e5e5e5] bg-[#fafafa] rounded-[4px]">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 mt-0.5" aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" stroke="#737373" strokeWidth="1.2" />
        <path d="M7 4v.2M7 6.5v3" stroke="#737373" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span className="text-xs text-[#737373] leading-relaxed">{message}</span>
    </div>
  )
}

function RoleBadge({ role }: { role: 'admin' | 'user' }) {
  if (role === 'admin') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-[3px] text-[11px] font-medium tracking-wide uppercase border border-[#0a0a0a] text-[#0a0a0a]">
        Admin
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-[3px] text-[11px] font-medium tracking-wide uppercase border border-[#e5e5e5] text-[#737373]">
      User
    </span>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          active ? 'bg-[#0a0a0a]' : 'bg-[#d4d4d4]'
        }`}
      />
      <span className={active ? 'text-[#0a0a0a]' : 'text-[#a3a3a3]'}>
        {active ? 'Actif' : 'Désactivé'}
      </span>
    </span>
  )
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function CreateUserModal({
  open, onClose, onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState<CreateForm>({
    email: '',
    full_name: '',
    role: 'user',
    password: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const emailValid = MEDERE_EMAIL_REGEX.test(form.email.trim().toLowerCase())
  const nameValid = form.full_name.trim().length > 0
  const passwordValid = form.password.length >= 8
  const canSubmit = emailValid && nameValid && passwordValid && !submitting

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          full_name: form.full_name.trim(),
          role: form.role,
          password: form.password,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Création échouée')
        return
      }
      setForm({ email: '', full_name: '', role: 'user', password: '' })
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
      <div className="bg-white rounded-[6px] shadow-xl w-full max-w-[460px] p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-[#0a0a0a]">Inviter un utilisateur</h2>
          <p className="text-xs text-[#737373] mt-1">Email @medere.fr uniquement.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-xs font-medium text-[#0a0a0a] mb-1.5 tracking-wide">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={submitting}
              placeholder="prenom.nom@medere.fr"
              className="w-full px-3 py-2.5 border border-[#e5e5e5] bg-white text-sm text-[#0a0a0a] placeholder-[#a3a3a3] rounded-[4px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#0a0a0a] mb-1.5 tracking-wide">Nom complet</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              disabled={submitting}
              placeholder="Prénom Nom"
              className="w-full px-3 py-2.5 border border-[#e5e5e5] bg-white text-sm text-[#0a0a0a] placeholder-[#a3a3a3] rounded-[4px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#0a0a0a] mb-1.5 tracking-wide">Rôle</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'user' })}
              disabled={submitting}
              className="w-full px-3 py-2.5 border border-[#e5e5e5] bg-white text-sm text-[#0a0a0a] rounded-[4px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] disabled:opacity-50"
            >
              <option value="user">User — accès dashboard</option>
              <option value="admin">Admin — accès total</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#0a0a0a] mb-1.5 tracking-wide">
              Mot de passe initial
            </label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              disabled={submitting}
              placeholder="Minimum 8 caractères"
              autoComplete="new-password"
              className="w-full px-3 py-2.5 border border-[#e5e5e5] bg-white text-sm text-[#0a0a0a] placeholder-[#a3a3a3] rounded-[4px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] disabled:opacity-50 font-mono"
            />
            <p className="mt-1.5 text-[11px] text-[#a3a3a3]">
              À transmettre à l&apos;utilisateur de manière sécurisée. Il pourra le changer dans son profil.
            </p>
          </div>

          {error && <ErrorBanner message={error} />}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm text-[#0a0a0a] border border-[#e5e5e5] rounded-[4px] hover:bg-[#f5f5f5] disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#0a0a0a] rounded-[4px] hover:bg-[#1a1a1a] disabled:bg-[#e5e5e5] disabled:text-[#a3a3a3] disabled:cursor-not-allowed"
            >
              {submitting && <Spinner size={12} />}
              Créer l&apos;utilisateur
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditUserModal({
  user, onClose, onUpdated,
}: {
  user: UserProfile | null
  onClose: () => void
  onUpdated: () => void
}) {
  const [form, setForm] = useState<EditForm>({
    email: user?.email ?? '',
    full_name: user?.full_name ?? '',
    role: user?.role ?? 'user',
    is_active: user?.is_active ?? true,
  })
  const [newPassword, setNewPassword] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  if (!user) return null

  const emailValid = MEDERE_EMAIL_REGEX.test(form.email.trim().toLowerCase())
  const nameValid = form.full_name.trim().length > 0
  const profileChanged =
    form.email.trim().toLowerCase() !== user.email ||
    form.full_name.trim() !== user.full_name ||
    form.role !== user.role ||
    form.is_active !== user.is_active

  const passwordValid = newPassword.length >= 8

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !emailValid || !nameValid || !profileChanged || savingProfile) return
    setSavingProfile(true)
    setError('')
    setInfo('')
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          full_name: form.full_name.trim(),
          role: form.role,
          is_active: form.is_active,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Mise à jour échouée')
        return
      }
      setInfo('Profil mis à jour.')
      onUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau')
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleResetPassword() {
    if (!user || !passwordValid || savingPassword) return
    setSavingPassword(true)
    setError('')
    setInfo('')
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Reset échoué')
        return
      }
      setInfo('Mot de passe réinitialisé. Transmettez-le à l\'utilisateur.')
      setNewPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4 py-6 overflow-y-auto">
      <div className="bg-white rounded-[6px] shadow-xl w-full max-w-[460px] p-6 my-auto">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-[#0a0a0a]">Modifier {user.email}</h2>
          <p className="text-xs text-[#737373] mt-1">Compte créé le {fmtDate(user.created_at)}</p>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4" noValidate>
          <div>
            <label className="block text-xs font-medium text-[#0a0a0a] mb-1.5 tracking-wide">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={savingProfile}
              className="w-full px-3 py-2.5 border border-[#e5e5e5] bg-white text-sm text-[#0a0a0a] rounded-[4px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#0a0a0a] mb-1.5 tracking-wide">Nom complet</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              disabled={savingProfile}
              className="w-full px-3 py-2.5 border border-[#e5e5e5] bg-white text-sm text-[#0a0a0a] rounded-[4px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#0a0a0a] mb-1.5 tracking-wide">Rôle</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'user' })}
              disabled={savingProfile}
              className="w-full px-3 py-2.5 border border-[#e5e5e5] bg-white text-sm text-[#0a0a0a] rounded-[4px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] disabled:opacity-50"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-[#e5e5e5]">
            <div>
              <p className="text-sm text-[#0a0a0a]">Compte actif</p>
              <p className="text-xs text-[#a3a3a3]">Un compte désactivé ne peut plus se connecter.</p>
            </div>
            <button
              type="button"
              onClick={() => setForm({ ...form, is_active: !form.is_active })}
              disabled={savingProfile}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                form.is_active ? 'bg-[#0a0a0a]' : 'bg-[#e5e5e5]'
              } disabled:opacity-50`}
              aria-pressed={form.is_active}
              aria-label="Toggle compte actif"
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                  form.is_active ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="submit"
              disabled={!emailValid || !nameValid || !profileChanged || savingProfile}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#0a0a0a] rounded-[4px] hover:bg-[#1a1a1a] disabled:bg-[#e5e5e5] disabled:text-[#a3a3a3] disabled:cursor-not-allowed"
            >
              {savingProfile && <Spinner size={12} />}
              Enregistrer
            </button>
          </div>
        </form>

        {/* Reset password — section séparée */}
        <div className="mt-6 pt-5 border-t border-[#e5e5e5]">
          <h3 className="text-sm font-medium text-[#0a0a0a] mb-1">Réinitialiser le mot de passe</h3>
          <p className="text-xs text-[#737373] mb-3">
            Le nouveau mot de passe est défini ici. Transmets-le à l&apos;utilisateur — l&apos;ancien sera révoqué.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={savingPassword}
              placeholder="Minimum 8 caractères"
              autoComplete="new-password"
              className="flex-1 px-3 py-2 border border-[#e5e5e5] bg-white text-sm text-[#0a0a0a] placeholder-[#a3a3a3] rounded-[4px] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] disabled:opacity-50 font-mono"
            />
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={!passwordValid || savingPassword}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#0a0a0a] rounded-[4px] hover:bg-[#1a1a1a] disabled:bg-[#e5e5e5] disabled:text-[#a3a3a3] disabled:cursor-not-allowed shrink-0"
            >
              {savingPassword && <Spinner size={12} />}
              Réinitialiser
            </button>
          </div>
        </div>

        {(error || info) && (
          <div className="mt-4">
            {error && <ErrorBanner message={error} />}
            {info && !error && (
              <div className="flex items-center gap-2.5 px-4 py-3 border border-[#e5e5e5] bg-[#fafafa] rounded-[4px]">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0" aria-hidden="true">
                  <circle cx="7" cy="7" r="5.5" stroke="#0a0a0a" strokeWidth="1.2" />
                  <path d="M4.5 7l2 2 3-4" stroke="#0a0a0a" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-xs text-[#0a0a0a]">{info}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end mt-5 pt-4 border-t border-[#e5e5e5]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#0a0a0a] border border-[#e5e5e5] rounded-[4px] hover:bg-[#f5f5f5]"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Chargement échoué')
        return
      }
      setUsers(data.users ?? [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau')
    }
  }, [])

  useEffect(() => {
    // Fetch initial au mount — setState après await, pattern standard React.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().finally(() => setLoading(false))
  }, [refresh])

  return (
    <div className="px-8 py-8 max-w-[1200px] mx-auto">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-semibold text-[#0a0a0a]">Utilisateurs</h1>
          <p className="text-sm text-[#737373] mt-1">
            Gérer les accès à l&apos;application — création, rôles, désactivation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#0a0a0a] rounded-[4px] hover:bg-[#1a1a1a]"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Inviter un utilisateur
        </button>
      </div>

      <div className="mb-5">
        <InfoBanner message="Toute modification de votre propre rôle ou statut prendra effet à votre prochaine connexion (jusqu'à 8h de délai dû à la session JWT en cours)." />
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      <div className="border border-[#e5e5e5] rounded-[4px] overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#fafafa]">
            <tr className="border-b border-[#e5e5e5]">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#a3a3a3] tracking-wide uppercase">
                Email
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#a3a3a3] tracking-wide uppercase">
                Nom
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#a3a3a3] tracking-wide uppercase">
                Rôle
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#a3a3a3] tracking-wide uppercase">
                Statut
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-[#a3a3a3] tracking-wide uppercase">
                Dernière connexion
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-[#a3a3a3] tracking-wide uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-[#f5f5f5] last:border-0">
                  <td className="px-4 py-3"><div className="h-4 w-48 bg-[#f5f5f5] rounded animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-32 bg-[#f5f5f5] rounded animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-12 bg-[#f5f5f5] rounded animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-16 bg-[#f5f5f5] rounded animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-24 bg-[#f5f5f5] rounded animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-16 bg-[#f5f5f5] rounded animate-pulse ml-auto" /></td>
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#a3a3a3]">
                  Aucun utilisateur — créez le premier compte ci-dessus.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-[#f5f5f5] last:border-0 hover:bg-[#fafafa]">
                  <td className="px-4 py-3 text-[#0a0a0a]">{u.email}</td>
                  <td className="px-4 py-3 text-[#737373]">{u.full_name}</td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3"><StatusBadge active={u.is_active} /></td>
                  <td className="px-4 py-3 text-[#737373] text-xs">{fmtDate(u.last_login_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingUser(u)}
                      className="px-3 py-1.5 text-xs text-[#0a0a0a] border border-[#e5e5e5] rounded-[4px] hover:bg-[#f5f5f5]"
                    >
                      Modifier
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refresh}
      />
      <EditUserModal
        key={editingUser?.id ?? 'none'}
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onUpdated={refresh}
      />
    </div>
  )
}
