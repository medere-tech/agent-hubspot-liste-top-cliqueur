import { auth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const MEDERE_EMAIL_REGEX = /^[^@\s]+@medere\.fr$/i

interface PatchBody {
  email?: string
  full_name?: string
  role?: 'admin' | 'user'
  is_active?: boolean
}

function parsePatchBody(body: unknown): PatchBody | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const result: PatchBody = {}
  if (b.email !== undefined) {
    if (typeof b.email !== 'string') return null
    result.email = b.email.trim().toLowerCase()
  }
  if (b.full_name !== undefined) {
    if (typeof b.full_name !== 'string') return null
    result.full_name = b.full_name.trim()
  }
  if (b.role !== undefined) {
    if (b.role !== 'admin' && b.role !== 'user') return null
    result.role = b.role
  }
  if (b.is_active !== undefined) {
    if (typeof b.is_active !== 'boolean') return null
    result.is_active = b.is_active
  }
  if (Object.keys(result).length === 0) return null
  return result
}

// ─── PATCH /api/admin/users/[id] — modifie role/is_active/email/full_name ─────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'ID requis' }, { status: 400 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const patch = parsePatchBody(raw)
  if (!patch) {
    return NextResponse.json({ error: 'Aucun champ valide à modifier' }, { status: 400 })
  }

  if (patch.email !== undefined && !MEDERE_EMAIL_REGEX.test(patch.email)) {
    return NextResponse.json({ error: 'L\'email doit être @medere.fr' }, { status: 400 })
  }
  if (patch.full_name !== undefined && patch.full_name.length === 0) {
    return NextResponse.json({ error: 'Nom complet vide' }, { status: 400 })
  }

  const supabase = createSupabaseAdmin()

  // ── Lecture du profil cible (sert au garde-fou ET au rollback éventuel) ──
  const { data: target, error: tgtErr } = await supabase
    .from('user_profiles')
    .select('id, email, role, is_active')
    .eq('id', id)
    .single()

  if (tgtErr || !target) {
    return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
  }

  // ── Garde-fou "au moins 1 admin actif" ───────────────────────────────────
  // Déclenché si rétrogradation (admin→user) OU désactivation d'un admin actif.
  const willLoseAdmin = patch.role === 'user' || patch.is_active === false
  if (willLoseAdmin && target.role === 'admin' && target.is_active === true) {
    const { count, error: countErr } = await supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true)
      .neq('id', id)

    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 })
    }
    if ((count ?? 0) < 1) {
      return NextResponse.json(
        { error: 'Au moins un admin actif doit rester dans le système' },
        { status: 409 }
      )
    }
  }

  // ── Update auth.users.email AVANT le profil — si échec, on n'a rien cassé ─
  const emailChanging = patch.email !== undefined && patch.email !== target.email
  if (emailChanging) {
    const { error: authErr } = await supabase.auth.admin.updateUserById(id, {
      email: patch.email!,
    })
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 400 })
    }
  }

  // ── Update user_profiles ─────────────────────────────────────────────────
  const { data: updated, error: updateErr } = await supabase
    .from('user_profiles')
    .update(patch)
    .eq('id', id)
    .select('id, email, full_name, role, is_active, created_at, last_login_at')
    .single()

  // ── Rollback auth.users si profile update fail → cohérence cross-système ─
  if (updateErr || !updated) {
    if (emailChanging) {
      await supabase.auth.admin
        .updateUserById(id, { email: target.email })
        .then(() => {}, () => {}) // best-effort
    }
    return NextResponse.json(
      { error: updateErr?.message ?? 'Mise à jour échouée' },
      { status: 500 }
    )
  }

  return NextResponse.json({ user: updated })
}
