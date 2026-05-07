import { auth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const MIN_PASSWORD_LEN = 8

// ─── POST /api/admin/users/[id]/reset-password — reset par un admin ───────────
export async function POST(
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
  if (!raw || typeof raw !== 'object') {
    return NextResponse.json({ error: 'Body invalide' }, { status: 400 })
  }
  const password = (raw as Record<string, unknown>).password
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LEN) {
    return NextResponse.json(
      { error: `Mot de passe: minimum ${MIN_PASSWORD_LEN} caractères` },
      { status: 400 }
    )
  }

  const supabase = createSupabaseAdmin()
  const { error } = await supabase.auth.admin.updateUserById(id, { password })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
