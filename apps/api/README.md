# memo.st API Worker

Hono service for memo.st agent-memory APIs. It runs on Cloudflare Workers and
uses D1 (durable metadata, knowledge-graph triples), Vectorize (semantic
retrieval) and Workers AI (BGE embeddings + Llama for KG extraction).
No external API keys required.

## Scripts

```bash
pnpm --filter api dev
pnpm --filter api build
pnpm --filter api deploy
pnpm --filter api cf-typegen
```

## Cloudflare Resources

Create the resources before production deploy:

```bash
wrangler d1 create memost-db-dev
wrangler vectorize create memost-vector-dev --dimensions 1024 --metric cosine
```

Apply D1 migrations:

```bash
wrangler d1 migrations apply memost-db-dev --local
wrangler d1 migrations apply memost-db-dev --remote
```

## Auth

Two principal kinds, both resolved by `requirePrincipal`:

- **Clerk session** (`Authorization: Bearer <Clerk JWT>`) — used by the
  dashboard worker. Required for `/v1/agents/*` (key & agent management).
- **API key** (`Authorization: Bearer mst_test_*` / `mst_live_*`) — used by
  SDKs and the playground proxy. Inferred agent comes from the key.

## Endpoints

- `GET  /health`
- `GET  /v1/agents` — list agents owned by the principal
- `POST /v1/agents` — create agent + return raw API key (shown once)
- `GET  /v1/agents/:id`
- `DELETE /v1/agents/:id`
- `GET  /v1/agents/:id/keys` — list keys (no secrets)
- `POST /v1/agents/:id/keys` — issue new key (raw shown once)
- `DELETE /v1/agents/:id/keys/:keyId` — revoke
- `GET  /v1/memories?pid=…&tid=…&limit=…`
- `POST /v1/memories` — body `{ content, pid?, tid?, metadata?, extractKg? }`
- `POST /v1/memories/search` — body `{ query, pid?, tid?, limit?, includeKg? }`
- `DELETE /v1/memories/:id`

Vector and KG triple stores are kept in sync. Search runs vector first
(filtered by `agent_id` + optional `pid`/`tid`), falls back to a D1 LIKE
text scan, and fans out into the knowledge graph.
