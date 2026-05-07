import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  /**
   * Augmentation du User retourné par authorize().
   * `id` est déjà optionnel sur DefaultUser (next-auth v5) — on le rend requis ici
   * et on ajoute `role`.
   */
  interface User {
    id: string
    role: 'admin' | 'user'
  }

  /**
   * Session lue côté serveur via auth() et côté client via useSession().
   * Intersection avec DefaultSession['user'] pour conserver name/email/image.
   */
  interface Session {
    user: {
      id: string
      role: 'admin' | 'user'
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  /** Augmentation du JWT signé en cookie — doit miroiter ce qu'on stocke dans jwt() */
  interface JWT {
    id: string
    role: 'admin' | 'user'
  }
}
