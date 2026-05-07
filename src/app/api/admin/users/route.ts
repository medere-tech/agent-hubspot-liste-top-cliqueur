import { auth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const MEDERE_EMAIL_REGEX = /^[^@\s]+@medere\.fr$/i
const MIN_PASSWORD_LEN = 8

interface UserProfile {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'user'
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

// ─── GET /api/admin/users — liste tous les profils ────────────────────────────
export async function GET() {
  const session = await auth()
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, role, is_active, created_at, last_login_at')
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ users: (data ?? []) as UserProfile[] })
}

// ─── POST /api/admin/users — création d'un utilisateur ────────────────────────

interface CreateUserBody {
  email: string
  password: string
  full_name: string
  role: 'admin' | 'user'
}

function isValidCreateBody(body: unknown): body is CreateUserBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return (
    typeof b.email === 'string' &&
    typeof b.password === 'string' &&
    typeof b.full_name === 'string' &&
    (b.role === 'admin' || b.role === 'user')
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!isValidCreateBody(raw)) {
    return NextResponse.json(
      { error: 'Champs requis: email, password, full_name, role' },
      { status: 400 }
    )
  }

  const email = raw.email.trim().toLowerCase()
  const fullName = raw.full_name.trim()

  if (!MEDERE_EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'L\'email doit être @medere.fr' }, { status: 400 })
  }
  if (raw.password.length < MIN_PASSWORD_LEN) {
    return NextResponse.json(
      { error: `Mot de passe: minimum ${MIN_PASSWORD_LEN} caractères` },
      { status: 400 }
    )
  }
  if (fullName.length === 0) {
    return NextResponse.json({ error: 'Nom complet requis' }, { status: 400 })
  }

  const supabase = createSupabaseAdmin()

  // 1. Création du compte auth.users (Supabase gère le bcrypt en interne)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: raw.password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message ?? 'Création auth échouée' },
      { status: 400 }
    )
  }

  // 2. Création du profil applicatif
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .insert({
      id: authData.user.id,
      email,
      full_name: fullName,
      role: raw.role,
      is_active: true,
    })
    .select('id, email, full_name, role, is_active, created_at, last_login_at')
    .single()

  // 3. Rollback si l'INSERT profil échoue — sinon compte auth orphelin sans profil
  //    (login refusé par auth.ts → compte inutilisable)
  if (profileError || !profile) {
    await supabase.auth.admin.deleteUser(authData.user.id).then(
      () => {},
      () => {} // best-effort
    )
    return NextResponse.json(
      { error: profileError?.message ?? 'Création profil échouée' },
      { status: 500 }
    )
  }

  return NextResponse.json({ user: profile as UserProfile }, { status: 201 })
}
