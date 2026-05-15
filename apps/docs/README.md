# memo.st docs

Static Astro documentation site for memo.st. Docs content is stored as MDX in
`src/content/docs`.

## Scripts

```bash
pnpm --filter docs dev
pnpm --filter docs build
pnpm --filter docs check-types
```

## Content

Add documentation pages as `.mdx` files in `src/content/docs`. Each file needs:

```md
---
title: Page title
description: Short summary for cards and metadata
order: 10
---
```

Routes are generated at `/docs/<file-name>/`.
