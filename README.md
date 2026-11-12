# Engineering journal

Static Next.js 16 (App Router, React 19, strict TypeScript, Tailwind v4, MDX) site: profile, project case studies, long-form articles with interactive labs.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # static export to out/
npx serve out        # preview the export
npm run typecheck && npm run lint && npm test
node scripts/check-links.mjs   # after build: internal links and anchors
node scripts/overflow.mjs http://localhost:3000/journal/   # 390px overflow probe (needs Chrome)
```

## Add an article

Create `src/content/articles/<slug>.mdx` with frontmatter validated by `src/lib/content/schema.ts` (title, description 40–300 chars, date, status, category, tags, optional series/related/featured). No H1; start at `##`. Routing, TOC, search index, RSS, sitemap and reading time pick it up automatically. `status: draft` is hidden in production.

## Add a project

Create `src/content/projects/<slug>.mdx` (see `projectMetaSchema`). Use only the evidence labels: implemented, demonstrated, in-progress, planned, exploratory.

## Add a lab

1. Pure logic in `src/lib/calc/<name>.ts` plus a test.
2. A `"use client"` component wrapped in `LabShell` under `src/components/lab/<group>/`.
3. Export it from the group `index.ts`; the group is spread in `src/components/lab/registry.ts`.
4. Use `<LabName />` in MDX.

## Deploy

Set `NEXT_PUBLIC_SITE_URL` (canonical URLs, RSS, sitemap) and, for project pages such as GitHub Pages, `NEXT_PUBLIC_BASE_PATH=/repo-name`. Publish `out/`. Vercel and Cloudflare Pages: build command `npm run build`, output `out`. Nothing is deployed by this repo.

## Notes

- `blockJS: false` in `Mdx.tsx` allows object/array props in MDX. Content is local and trusted; do not render untrusted MDX.
- Labs use synthetic data and simplified models. They are not benchmarks.
