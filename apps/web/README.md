# memo.st web

TanStack Start app for the memo.st agent memory SaaS surface. It runs on
Cloudflare Workers and uses Clerk for user and organization authentication.

## Getting Started

Install dependencies from the repository root:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the result.

Useful package scripts:

```bash
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web start
pnpm --filter web deploy
```

## Environment

Create `apps/web/.dev.vars` for local Workers secrets:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

Public landing content works without keys. Clerk sign-in and authenticated API
context require the Clerk variables above.

## Architecture

- `src/routes/__root.tsx` wires TanStack Router, global CSS, and Clerk.
- `src/routes/index.tsx` is the memo.st product surface.
- `src/routes/api.memories.ts` is the first memory API route.
- `wrangler.jsonc` configures the Cloudflare Workers target.

For production, set Clerk secrets with Wrangler and connect `memo.st` in
Cloudflare DNS/routes.
