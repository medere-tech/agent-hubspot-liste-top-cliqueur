import { auth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import PasswordForm from './password-form'

interface ProfileRow {
  email: string
  full_name: string
  role: 'admin' | 'user'
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

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

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const supabase = createSupabaseAdmin()
  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('email, full_name, role, is_active, created_at, last_login_at')
    .eq('id', session.user.id)
    .single<ProfileRow>()

  // Compte sans profil ou désactivé : on dégage proprement vers /login.
  // Le middleware n'attrape pas le cas désactivé (il check juste le JWT).
  if (error || !profile || !profile.is_active) {
    redirect('/login')
  }

  return (
    <div className="px-8 py-8 max-w-[720px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0a0a0a]">Profil</h1>
        <p className="text-sm text-[#737373] mt-1">
          Vos informations et votre mot de passe.
        </p>
      </div>

      {/* ── Infos perso (read-only) ───────────────────────────────────────── */}
      <div className="border border-[#e5e5e5] rounded-[4px] bg-white p-6 mb-6">
        <h2 className="text-sm font-medium text-[#0a0a0a] mb-4 tracking-wide uppercase">
          Informations
        </h2>
        <dl className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-[#f5f5f5]">
            <dt className="text-sm text-[#737373]">Nom</dt>
            <dd className="text-sm text-[#0a0a0a]">{profile.full_name}</dd>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-[#f5f5f5]">
            <dt className="text-sm text-[#737373]">Email</dt>
            <dd className="text-sm text-[#0a0a0a]">{profile.email}</dd>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-[#f5f5f5]">
            <dt className="text-sm text-[#737373]">Rôle</dt>
            <dd><RoleBadge role={profile.role} /></dd>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-[#f5f5f5]">
            <dt className="text-sm text-[#737373]">Compte créé le</dt>
            <dd className="text-sm text-[#0a0a0a]">{fmtDate(profile.created_at)}</dd>
          </div>
          <div className="flex justify-between items-center py-2">
            <dt className="text-sm text-[#737373]">Dernière connexion</dt>
            <dd className="text-sm text-[#0a0a0a]">{fmtDate(profile.last_login_at)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-[11px] text-[#a3a3a3] leading-relaxed">
          Pour modifier votre nom, votre email ou votre rôle, contactez un administrateur.
        </p>
      </div>

      {/* ── Changer mot de passe (client component) ───────────────────────── */}
      <PasswordForm />
    </div>
  )
}
