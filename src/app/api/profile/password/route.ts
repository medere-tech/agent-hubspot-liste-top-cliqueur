import { auth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const MIN_PASSWORD_LEN = 8

// ─── POST /api/profile/password — changement de son propre mot de passe ──────
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!raw || typeof raw !== 'object') {
    return NextResponse.json({ error: 'Body invalide' }, { status: 400 })
  }

  const b = raw as Record<string, unknown>
  const currentPassword = b.current_password
  const newPassword = b.new_password

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return NextResponse.json(
      { error: 'Champs requis: current_password, new_password' },
      { status: 400 }
    )
  }
  if (newPassword.length < MIN_PASSWORD_LEN) {
    return NextResponse.json(
      { error: `Nouveau mot de passe: minimum ${MIN_PASSWORD_LEN} caractères` },
      { status: 400 }
    )
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: 'Le nouveau mot de passe doit différer de l\'ancien' },
      { status: 400 }
    )
  }

  const supabase = createSupabaseAdmin()

  // 1. Vérifier que le compte est toujours actif. Important : le cookie JWT
  //    peut survivre jusqu'à 8h après une désactivation côté DB. Sans ce check,
  //    un user désactivé pourrait encore changer son mot de passe.
  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .select('is_active')
    .eq('id', session.user.id)
    .single()

  if (profileErr || !profile || !profile.is_active) {
    return NextResponse.json({ error: 'Compte désactivé' }, { status: 403 })
  }

  // 2. Re-authentification avec le mot de passe actuel.
  //    Anti-vol-de-cookie : empêche qu'un attaquant ayant intercepté la session
  //    puisse changer le mot de passe sans connaître l'ancien.
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: session.user.email,
    password: currentPassword,
  })
  if (authErr) {
    return NextResponse.json({ error: 'Mot de passe actuel incorrect' }, { status: 401 })
  }

  // 3. Mise à jour du mot de passe via l'API admin (service_role).
  //    On ne peut pas utiliser supabase.auth.updateUser() côté serveur car
  //    ça nécessite une session Supabase active, or on utilise NextAuth JWT.
  const { error: updateErr } = await supabase.auth.admin.updateUserById(
    session.user.id,
    { password: newPassword }
  )
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
