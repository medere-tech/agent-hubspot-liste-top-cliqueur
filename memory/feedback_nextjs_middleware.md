---
name: Next.js 16 middleware.ts vs proxy.ts
description: The docs bundled in node_modules say middleware is deprecated in v16, but the actual runtime still uses middleware.ts
type: feedback
---

Use `src/middleware.ts` (not `src/proxy.ts`) for route protection in Next.js 16.

**Why:** The docs in `node_modules/next/dist/docs/` are aspirational/incorrect — `MIDDLEWARE_FILENAME` in the actual Next.js 16 source (`node_modules/next/dist/lib/constants.js`) is still `'middleware'`. The runtime looks for `middleware.ts`, not `proxy.ts`. The user explicitly corrected this mistake.

**How to apply:** Always use `middleware.ts` for Next.js middleware. Ignore the proxy.ts references in the bundled docs.
