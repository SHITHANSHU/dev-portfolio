---
name: new-article
description: Write a new long-form engineering article for this site from a topic and key points - MDX article with scalability analysis, diagrams, and 2-3 animated interactive labs (playgrounds/calculators) built on LabShell, plus calc tests, registry wiring and full quality gates. Runs in three stages - Opus technical planning, Sonnet implementation, independent Opus review. Use when the user asks to add/write/create a blog, article, or journal post on a topic.
argument-hint: "<topic> — <key point 1>; <key point 2>; ..."
---

# New article

Input: `$ARGUMENTS` = topic plus key points. If the topic is missing, ask once. If key points are missing, derive them and list them in the plan.

The house style is the existing articles. Match them; do not invent a new format. Articles are written in first person singular ("I").

Three stages, each on a set model. Stages hand off through files in `<rules>/articles/<slug>/`, where `<rules>` is the private `blog-rules` checkout (see "Rules dir" in `CLAUDE.md`; locally `../blog-rules`). Commit and push each hand-off file to `blog-rules` when its stage writes it:

| Stage | Model | Runs as | Output |
| --- | --- | --- | --- |
| 1. Technical planning | Opus | main thread if it is Opus, else `Agent` with `model: "opus"` | `plan.md` |
| 2. Blog implementation | Sonnet | `Agent` with `model: "sonnet"` | article, labs, tests, passing checks |
| 3. Independent review | Opus | a **fresh** `Agent` with `model: "opus"` (never the writer) | `review.md`, then fixes |

Every agent prompt includes: the topic and key points, the path of this skill file (so it reads the rules below), the path of the stage input/output files, and which stage it owns.

## Context every stage reads

- `src/content/articles/kafka-partitions-replication-consumers.mdx` and `redis-persistence-pubsub-streams.mdx`: voice, structure, how labs are introduced and interpreted.
- `src/lib/content/schema.ts`: frontmatter contract.
- `src/components/lab/LabShell.tsx`, `controls.tsx`, `registry.ts`, `cdc/usePlayer.ts`, `useReducedMotion.ts`.
- One playground (`kafka/KafkaConsumerGroupPlayground.tsx`) and one calc module plus its test (`src/lib/calc/redis.ts`, `redis.test.ts`).
- `<rules>/writer-brief.md` and `<rules>/lab-brief.md`: author facts and lab contract. `<rules>/agent.md` §9–10 and `<rules>/plan.md` §7–8. This skill wins where they differ.
- `ls src/content/articles` for existing slugs, the next `series` number and `related` candidates.

## Stage 1: Technical planning (Opus)

Write `<rules>/articles/<slug>/plan.md` covering:

- **Problem and scope**: the concrete situation that makes the topic matter, who the reader is, what is in and out of scope, and the version(s) the article targets.
- **Metadata**: slug (kebab-case), title, `series: "Article NN"` (next number), category, tags, 1–3 existing `related` slugs.
- **Architecture**: the components, their responsibilities, and the data/request flow, written down as the FlowDiagram/SequenceDiagram steps the article will draw.
- **Failure modes**: crash, failover, overload/backpressure, skew/hot keys, replay, misconfiguration. For each: what the system does, what the guarantee really is, and how to recover.
- **Scaling model**: the unit of scale, where the bottleneck moves as load grows, and the capacity formulas with units.
- **Claims ledger**: every technical claim the article will make that needs evidence (version-specific behaviour, defaults, guarantees, limits). For each: the source (official docs URL or section, or "standard protocol fact"), or the label "illustrative" or "qualify/omit". Check uncertain ones against the official docs (WebFetch) now.
- **Outline**: the `##` sections. Each key point maps to at least one section. Headings are descriptive and unique (they become the TOC).
- **Labs**: 2–3, each with name, kind, learning objective, controls, what animates, and the calc functions with their units. Reuse an existing lab only if it fits exactly (e.g. `KafkaPartitionExplorer`).

Show the user a short summary of the plan. Proceed to stage 2 without waiting unless the user asked to review the plan.

## Stage 2: Blog implementation (Sonnet)

The Sonnet agent implements `plan.md` exactly. It writes the complete article, builds the interactive architecture explorers and playgrounds, adds the diagrams, code examples and calculations, and improves readability and navigation (TOC-friendly headings, short paragraphs, tables where they replace lists, each lab placed where its concept is explained). If a plan claim turns out wrong, it notes the change at the end of `plan.md` rather than silently diverging.

### Article (`src/content/articles/<slug>.mdx`)

Frontmatter: exactly `articleMetaSchema`. `date` = today (YYYY-MM-DD), `status: "published"`, `featured: false`, description 40–300 chars.

Body: no H1, start at `##`, `###` sparingly. Roughly 3,000–6,000 words. Typical spine (adapt to the topic):

1. The problem: the concrete situation. No generic intro.
2. Core model / architecture, with a `<Figure>` + `<FlowDiagram>` (and `<SequenceDiagram>` for protocols).
3. Mechanism sections, one per key point: how it behaves, why, config/code example, where it breaks.
4. **Scaling section (mandatory)**: unit of scale, bottleneck movement, hot keys/skew, the limits of horizontal scaling, and back-of-envelope capacity math with explicit units, labelled illustrative. Include a lab here.
5. Failure modes and recovery.
6. Operations: metrics and alerts that matter, and why.
7. Security considerations where relevant.
8. A comparison or decision table ("where it fits and where it does not").
9. `## Assumptions and limitations`: a `<Callout type="assumption">` with version scope and lab simplifications.
10. `## Conclusion`: one short section, no recap list.

Labs: each on its own line, preceded by a paragraph saying what to try and followed by a paragraph saying what the reader should have seen. The article must make sense without the labs.

Components available without imports: `Callout` (note|warning|assumption), `Figure` (label, caption), `FlowDiagram` (steps with tone default|store|warn), `SequenceDiagram`, `Details`, `Metric`, plus every key in `labComponents`. Code fences need a language; first line `// title: file.ext` (or `#`/`--`) becomes the caption.

Writing rules:
- **Voice: first person singular.** Write as the author ("I use…", "I chose…", "my lab shows…"); address the reader as "you". No third-person or impersonal narration about the article or author ("This article…", "the author…", "we", "let's"). First person never licenses invented anecdotes: experience claims still come only from the writer brief/resume.
- **No obvious definitions.** Readers are engineers. Never open with or pad in "what X is" for things they already know (what a camera, queue, cache or database is). Start at the non-obvious mechanism. Background that only some readers need (a protocol detail, an acronym's internals, a prerequisite concept) goes in a collapsed `<Details summary="…">` box the reader can click, never inline. Add one only if it is not obvious; most articles need zero to three.
- Experienced-engineer audience. Precise, opinionated about trade-offs, zero filler, no repeated conclusions.
- Never invent production numbers, benchmarks, incidents or customers. Numbers are documented facts (qualified by version/config) or arithmetic labelled illustrative. Author experience claims come only from the writer brief/resume.
- Every claim traces to the claims ledger. Code/config not validated against a specific version is labelled illustrative.
- MDX hazards: wrap `{`, `}` and bare `<` in prose in backticks.

### Labs: playgrounds with animation

Group = short topic name (`src/components/lab/<group>/`).

- **Pure logic** in `src/lib/calc/<group>.ts`: typed, deterministic (seeded PRNG such as mulberry32, never `Math.random`/`Date.now`), clamp inputs, units in names (`bytesPerSec`), never mix bits and bytes, label decimal vs binary units. Test in `src/lib/calc/<group>.test.ts`: normal, boundary, zero/invalid, determinism.
- **Component**: `"use client"`, named export, no required props, local state only, wrapped in `<LabShell>` (unique `id`, `label`, `kind`, one-sentence `objective`, `assumptions[]`, `onReset` restoring every default, a `summary` that changes with state). Controls from `controls.tsx`; every control must visibly change output.
- **At least one lab is a stepped simulation playground** (things flowing through the system over ticks: messages, requests, replicas, shards). Use `usePlayer` from `@/components/lab/cdc/usePlayer` (or the same Play/Pause/Step pattern): Play is user-initiated and never autoplays, bounded tick count, plus a Step button and an event log.
- **At least one lab answers a scaling question**: e.g. a load, node or partition slider, and the visual shows where the bottleneck/backlog/skew appears.
- **Animation**: inline SVG with `viewBox` + `width="100%"`. Animate by changing positions/state between ticks and letting CSS `transition` (transform, opacity, fill, width) interpolate. Key moving elements by stable id so they glide rather than remount. Global CSS already disables transitions under `prefers-reduced-motion`; show the `reduced` flag from `usePlayer` in a hint when relevant. No animation libraries, no chart libraries, no new npm dependencies.
- **Accessibility**: SVG `role="img"` + `aria-label` describing the current state; the summary is the textual equivalent; never colour-only meaning (add shape/text); touch targets ≥ 36px; keyboard operable; scrollable regions get `tabIndex={0}` + label.
- **Look**: an engineering instrument, not a toy. Tokens only: `var(--ink)`, `var(--lab)`, `var(--signal)` (backlog/loss/warning), `var(--muted)`, `var(--rule)`; classes `.lab`, `.btn lab-btn`, `.num`, `border-lab`, `bg-lab-soft`, `bg-paper`, `bg-paper-2`. No gradients, glow or rounded-card spam. Must work at 360px wide.
- **Integrity**: synthetic data only; never imply a connection to a real system; every simplification goes in `assumptions`.
- **Wiring**: `src/components/lab/<group>/index.ts` exports `<group>Labs: Record<string, ComponentType>` (key = JSX tag), then spread it in `src/components/lab/registry.ts`.
- **Component test** `src/components/lab/<group>/<group>.test.tsx`: for the main labs, change a control and assert the summary changed, Step advances, Reset restores.

### Verify (from `site/`)

Run all of these and report exact results. Fix failures; never weaken lint, types or tests to pass.

```bash
npm run typecheck && npm run lint && npm test
npm run build && node scripts/check-links.mjs
```

Then render it: `npm run dev`, open `/journal/<slug>/`, check desktop + 390px (`node scripts/overflow.mjs http://localhost:3000/journal/<slug>/`), light/dark, and click through each lab (Play, Step, Reset). If the browser can't be driven, say so instead of claiming it was checked.

## Stage 3: Independent review (Opus)

A fresh Opus agent that did not write the article. It reads `plan.md`, the MDX, the calc modules, the lab components and their tests, and writes `<rules>/articles/<slug>/review.md`. It must:

- **Challenge technical explanations**: is each mechanism described correctly, for the stated version? Are guarantees overstated ("exactly once", "durable", "no data loss")?
- **Find incorrect assumptions**: in prose, in calc functions, and in lab `assumptions[]`.
- **Check consistency between diagrams and text**: FlowDiagram/SequenceDiagram steps, lab behaviour and the prose describe the same flow, names and order.
- **Review code examples and edge cases**: config keys and syntax are plausible for the stated version; calc functions handle zero, max, invalid and boundary inputs; units are consistent.
- **Identify unsupported performance claims**: any number without a claims-ledger source or an "illustrative" label.
- **Check for obvious content**: flag definitions of things an engineer already knows as `should-fix` (delete, or move to a `<Details>` box if it is genuinely non-obvious background).
- **Check voice**: flag third-person/impersonal narration ("This article", "the author", "we", "let's") as `should-fix`, and any invented first-person anecdote as `must-fix`.

Each finding: location (`file:line`), the problem, why it is wrong, and the fix, tagged `must-fix` or `should-fix`. Facts it cannot verify are listed as such, not guessed.

Then fix every `must-fix` (and `should-fix` where cheap): send the findings back to the Sonnet implementation agent (`SendMessage`) or fix them in the main thread. Re-run the full Verify block after fixes.

## Report

≤15 lines: files created/changed, word count, labs (name, kind, what animates), check results with pass counts, review findings (fixed / left with reason), facts still unverified, anything skipped. Then publish as `CLAUDE.md` "Publishing" says (commit and push to `main`) once Verify passes, unless the user asked to hold it.
