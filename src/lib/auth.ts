import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { createSupabaseAdmin } from '@/lib/supabase'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const supabase = createSupabaseAdmin()

        // 1. Authentification credentials (bcrypt vérifié par GoTrue côté Supabase)
        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email as string,
          password: credentials.password as string,
        })
        if (error || !data.user) return null

        // 2. Profil applicatif obligatoire — pas de fallback silencieux.
        //    Un compte auth.users sans profil user_profiles = login refusé.
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('full_name, role, is_active')
          .eq('id', data.user.id)
          .single()

        if (profileError || !profile) return null
        if (!profile.is_active) return null

        // 3. last_login_at — fire-and-forget : best-effort, ne bloque jamais le login.
        supabase
          .from('user_profiles')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', data.user.id)
          .then(
            () => {},
            () => {} // swallow — perte d'une métrique, pas de blocage UX
          )

        // 4. Retour enrichi → propagé vers JWT puis Session via les callbacks
        return {
          id: data.user.id,
          email: data.user.email ?? '',
          name: profile.full_name,
          role: profile.role as 'admin' | 'user',
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    jwt({ token, user }) {
      // `user` n'est défini qu'au moment de authorize() — sinon le token persiste.
      // Conditionnel : protège les sessions JWT antérieures au déploiement.
      if (user) {
        token.id = user.id
        token.role = user.role
        token.name = user.name
      }
      return token
    },
    session({ session, token }) {
      // Casts requis : NextAuth v5 type le JWT avec un index signature
      // Record<string, unknown> qui dégrade les types augmentés à `unknown`.
      if (token.id) session.user.id = token.id as string
      if (token.role) session.user.role = token.role as 'admin' | 'user'
      if (token.name) session.user.name = token.name as string
      return session
    },
  },
})
