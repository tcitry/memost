# memo.st API Worker

Hono service for memo.st Agent memory APIs. It runs on Cloudflare Workers and
uses D1 for durable metadata plus Vectorize for semantic retrieval.

## Scripts

```bash
pnpm --filter @memost/api-worker dev
pnpm --filter @memost/api-worker build
pnpm --filter @memost/api-worker deploy
pnpm --filter @memost/api-worker cf-typegen
```

## Cloudflare Resources

Create the resources before production deploy:

```bash
wrangler d1 create memo-st
wrangler vectorize create memo-st-memory --dimensions 1536 --metric cosine
```

Then replace the placeholder `database_id` in `wrangler.jsonc` and apply D1
migrations:

```bash
wrangler d1 migrations apply memo-st --local
wrangler d1 migrations apply memo-st --remote
```

## Endpoints

- `GET /health`
- `GET /v1/memories?organizationId=...&namespace=...`
- `POST /v1/memories`
- `GET /v1/memories/:id`
- `POST /v1/memories/search`

`POST /v1/memories/search` uses Vectorize when `queryEmbedding` is provided and
falls back to recent D1 memories when it is omitted.
