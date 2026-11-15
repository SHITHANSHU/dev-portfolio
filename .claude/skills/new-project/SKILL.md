---
name: new-project
description: Create or update a project case study for this site's /projects section - interviews the owner, reads the project's source folder read-only, writes an evidence ledger, then writes a structured MDX case study (TL;DR, overview, problem, solution, HLD/LLD Mermaid diagrams, implementation, issues and fixes, learnings, future work, planned-but-restricted scope). Electronics/hardware projects become full build tutorials (BOM, schematic, wiring, assembly, flashing, OTA, testing, troubleshooting) with SVG illustrations. Use when the user asks to add, write, document, or update a project (not a journal article - that is new-article).
argument-hint: "<project name or source path> | update <slug>"
---

# New project

Input: `$ARGUMENTS`. `update <slug>` = update mode (see end). Anything else = create mode; it may name the project, a source path, or both.

Projects are **technical case studies**, not journal articles. The journal (`/journal`, skill `new-article`) is personal, editorial writing. Never put a project into `src/content/articles/` and never change journal files from this skill.

This skill is generate-only: there is no CMS, draft or publish state. The page goes live when the owner commits and pushes.

## Context to read first

- `src/lib/content/schema.ts` (`projectMetaSchema`: the frontmatter contract, including the `completed` refine).
- One existing project of the same kind in `src/content/projects/` (`picopal.mdx` for hardware, `scaleforge.mdx` or `p2p-ble-app.mdx` for software): house structure and voice.
- `src/components/content/Mdx.tsx` and `blocks.tsx`: what MDX can render.
- `../.internal/projects/<slug>/evidence.md` if it exists (update mode, or a resumed run).
- `ls src/content/projects` for slugs and the next `order` value.

## 1. Intake interview

Ask with `AskUserQuestion`, up to 4 questions per call, recommended option first. Skip a question only when the answer is already in `$ARGUMENTS` or the conversation. First round:

1. Name (as shown on the page; offer 2-3 professional options if the working name is informal) and the source folder path(s).
2. Kind: software, electronics/hardware, or other. This decides the template.
3. Lifecycle status: idea, in progress, completed, archived. Start month, and completion month when completed.
4. Public repository URL and live demo URL. Only publish links the owner gives; never derive one from a git remote.

Second call, still before reading code:

5. What is planned but deliberately not built, and why (deferred, out of scope, blocked by hardware, security, cost).
6. Real photos or screenshots available? If yes, get the files; if no, the page gets drawn SVG illustrations and `<PhotoSlot>` markers.
7. Anything that must stay private (client names, credentials, internal hosts, pin maps, prices).

## 2. Evidence pass (read-only)

Read the source with Read/Grep/ls only. Never run, build, flash, or modify it. Write `../.internal/projects/<slug>/evidence.md` (outside the published repo) with these sections, matching `../.internal/evidence-*.md`:

1. Inventory: folders, docs, size (lines of code, test count by static grep, labelled "not re-run").
2. Built vs planned vs in progress, each with the file that proves it.
3. Tech and hardware facts (versions, parts, pins, partition tables, API routes, schema).
4. Architecture: components, data flow, state machines, deployment.
5. Issues found in logs, TODOs, troubleshooting docs, commit messages: symptom, root cause if recorded, fix if recorded.
6. Unknowns: anything the page would need but the source does not say.
7. Sensitive items to exclude: credentials, API keys, MAC addresses, private IPs, serial port paths, personal names, home paths.

Then a **second interview round** (`AskUserQuestion`) only for unknowns that change the page: root causes not in the logs, why a choice was made, whether a feature was verified on real hardware, dates. Record each answer in `evidence.md` as "owner, <date>". Never fill a gap by guessing; if the owner does not know, the page says it is unknown or leaves it out.

## 3. Write the case study

File: `src/content/projects/<slug>.mdx`. Slug: kebab-case from the published name.

### Frontmatter

Exactly `projectMetaSchema`:
- `summary`: 40-320 chars, one or two sentences, what it is and what makes it interesting.
- `tldr`: 3-5 bullets, each one sentence: what it does, the key design idea, current state, the headline limitation. This is the brief; the body is the detail.
- `status` + `started` (`YYYY-MM`) + `completed` (only and always when status is `completed`); `statusNote` for one honest sentence of nuance.
- `tags`: the technologies used. `category`: short domain label.
- `repo` / `demo` only from step 1. `facts`: 4-7 evidenced key/value pairs for the spec sheet (stack, size, tests, hardware).

### Body

No H1. `##` sections in this order. **A section with no evidence behind it is omitted, never padded**: not every project has auth, a database, or infrastructure. Headings are unique (they become the TOC).

1. `## Overview` - what it is, who it is for, the shape of the solution in one paragraph, and where it stands today.
2. `## Problem Statement` - the problem, why it matters, who has it, limits of existing options, goals and requirements (a short list or table).
3. `## Proposed Solution` - the approach, how it answers each requirement, key features, technical decisions with the trade-off and the alternative considered for each.
4. Electronics only, the build tutorial (see below).
5. `## Architecture` with `### High-level design` (system components, external integrations, data flow, deployment) and `### Low-level design` (modules and their relations, API contracts, database schema, sequence diagrams, key workflows). Use Mermaid: `flowchart` for HLD, `classDiagram`/`erDiagram` for structure, `sequenceDiagram` for protocols, `stateDiagram-v2` for state machines. One diagram per idea, each preceded by a sentence saying what to look at.
6. `## Implementation` - stack, important implementation decisions, database and API design, authentication and authorization, infrastructure and deployment, testing strategy. `###` per topic that exists.
7. `## Issues & Fixes` - one `###` per issue, each with bold-led paragraphs: **Problem.** **Root cause.** **Fix.** optional code or config block, **Lesson.**, optional **References.** Only issues with evidence. If the root cause was never found, say so.
8. `## Learnings` - key technical learnings, what I would do differently, known limitations.
9. `## Future Improvements` - ordered roadmap, next step first.
10. `## Planned but Restricted` - table `| Scope | State | What restricts it |`, covering every planned, deferred, dropped or out-of-scope item from the evidence and the owner's answers.

### Electronics: build tutorial

The goal: a reader can buy the parts and build the same device from this page alone. The build sections (Bill of Materials through OTA) go after Proposed Solution; `## Testing and Calibration` and `## Troubleshooting` go after Implementation, before Issues & Fixes. Reference page: `picopal.mdx`.

- `## Bill of Materials` - table: part, qty, purpose, approx price in INR, notes. Prices are labelled "estimate, not a receipt" in a Callout, with generic sources (Robu.in, Amazon.in, AliExpress); never name a seller as where the owner bought unless the owner said so. Add tools and consumables.
- `## Circuit and Pin Map` - SVG schematic in a `<Figure>`, then the full pin table from the source (`pins.h`, circuit docs). Call out strapping/boot pins and voltage levels.
- `## Power` - supply rails, current budget (labelled estimate unless measured), common grounds, decoupling, what breaks if it is wrong.
- `## Wiring Step by Step` - numbered steps in build order, each testable before the next (bring up one peripheral at a time).
- `## Mechanical Assembly` - SVG illustration, steps, and `<PhotoSlot>` where a real photo belongs.
- `## Firmware Setup and Flashing` - toolchain install, clone/build commands, first USB flash, filesystem upload. Commands in fenced `bash` blocks.
- `## First Boot and Configuration` - provisioning (captive portal etc.), what the device shows when healthy.
- `## OTA Updates and Safe Flashing` (if the device supports OTA) - partition layout, how an update is pushed, how corruption is avoided, how rollback works, how to recover over USB.
- `## Testing and Calibration` - the checklist the owner used (IDs, what to do, expected result).
- `## Troubleshooting` - symptom / likely cause / fix table, from the source's troubleshooting docs and the issues found.

### Images

- SVG illustrations go in `public/projects/<slug>/`, referenced as `![alt text](/projects/<slug>/<name>.svg)` inside `<Figure label="Fig. N" caption="... Illustration, not a photo.">`. The `img` mapping adds the deploy basePath.
- Draw SVGs by hand: `viewBox` set, light plate background (`#fbf9f4`), ink `#1b1a17`, accent `#b3361a`, teal `#1d5b57`, system sans/mono fonts, labels ≥ 11px at 720px wide, every wire labelled with its signal name. No external fonts or images inside the SVG.
- `<PhotoSlot caption="..." />` marks where a real photo should go. Replace with a real image when the owner provides one.

### Writing rules

- First person singular ("I chose", "my build"); the reader is "you". No "this article", "the author", "we", "let's".
- Engineers are the audience. No definitions of things they know. Optional background goes in `<Details summary="...">`.
- Never invent numbers, incidents, users, benchmarks or verification. Every number is from the evidence (with its source qualifier, e.g. "per the project log, not re-run") or labelled estimate/illustrative. Verification claims follow the owner's answers.
- Detailed like the journal: software projects 3,500-6,000 words, electronics tutorials 5,000-8,000.
- MDX hazards: wrap `{`, `}` and bare `<` in prose in backticks. Code fences need a language; first line `// title: file.ext` (or `#`/`--`) becomes the caption. Mermaid fences are plain ```` ```mermaid ````; avoid `{}` in Mermaid labels unless inside quotes, never use `;` in Mermaid text (it ends a statement), and no generics with commas in `classDiagram` names. A diagram that fails to parse shows its source instead, so Verify must confirm zero `.mermaid-src` fallbacks.
- YAML: quote every `tldr` bullet; an unquoted `: ` inside one breaks the frontmatter.
- Components available without imports: `Callout` (note|warning|assumption), `Figure`, `Details`, `Metric`, `PhotoSlot`, `FlowDiagram`, `SequenceDiagram`.
- Nothing from evidence section 7 (sensitive) appears on the page. The content test also blocks private IPs, keys and home paths.

## 4. Verify (from `site/`)

```bash
npm run typecheck && npm run lint && npm test
npm run build && node scripts/check-links.mjs
```

Then `npm run dev`, open `/projects/<slug>/`: every Mermaid diagram renders (not the source fallback), images load, TOC links jump, light and dark themes, and `node scripts/overflow.mjs http://localhost:3000/projects/<slug>/` reports no overflow at 390px. If the browser cannot be driven, say so instead of claiming it was checked.

## 5. Independent review

Spawn a **fresh** `Agent` (`model: "opus"`) that did not write the page. It reads `evidence.md`, the MDX and the SVGs, and writes `../.internal/projects/<slug>/review.md`: every claim traced to evidence or an owner answer, diagrams consistent with the prose (names, order, direction), pin map and BOM consistent with the schematic, no secrets, voice rules, no padded sections. Findings tagged `must-fix` / `should-fix` with `file:line`. Fix every must-fix, re-run Verify.

## Update mode (`update <slug>`)

1. Read the MDX and `../.internal/projects/<slug>/evidence.md`.
2. Ask the owner what changed (status, new features, new issues, photos, links), up to 4 questions per call.
3. Re-read only the source areas that changed; append to `evidence.md`.
4. Edit only the affected sections; keep the rest verbatim. Update `status`/`completed`/`statusNote`, `tldr`, and move items out of Planned but Restricted when they ship.
5. If the slug or title changes, `git mv` the file and SVG folder, and grep `src/` for the old slug.
6. Verify and review as above (review may be limited to changed sections).

## Report

≤15 lines: files created/changed, word count, diagrams and images added, check results with pass counts, review findings (fixed / left with reason), unknowns still open, anything skipped. Do not commit or push unless asked.
