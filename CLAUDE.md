@AGENTS.md

# shithanshu.com

Static Next.js site (see `README.md`). Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`, which gates on typecheck, lint, test, build and link check.

## Tasks

- Write / add a blog, article or journal post: use the `new-article` skill (`.claude/skills/new-article/SKILL.md`).
- Add or update a project case study: use the `new-project` skill (`.claude/skills/new-project/SKILL.md`).
- If the skill is not listed in this session, read its `SKILL.md` from this repo and follow it.

## Rules dir

The skills read author facts, briefs and hand-off files from the private repo `SHITHANSHU/blog-rules`, called the rules dir:

- Locally: `../blog-rules`.
- Cloud (`blogs` environment): `/home/user/blog-rules`, next to `/home/user/dev-portfolio`. If it is missing, say so and stop.

## Fresh environment

Run `npm ci` before any check. Chrome is at `$CHROME_PATH` in cloud sessions; `scripts/overflow.mjs` uses it. The cloud proxy blocks external sites, so point it at a local server (`npm run build && npx serve out`, or `npm run dev`).

## Publishing

The owner publishes by asking for a blog; a finished article goes live without a pull request.

- Cloud sessions start on a `claude/*` branch. Commit there, then `git pull --rebase origin main` and `git push origin HEAD:main`. Hand-off files in `blog-rules` publish the same way.
- Before pushing, the full Verify block from the skill must pass: `npm run typecheck && npm run lint && npm test && npm run build && node scripts/check-links.mjs`.
- The push to `main` deploys.

## Git

- Author: `shithanshu <shithanshu.smishra@gmail.com>`. In the cloud this comes from the `GIT_AUTHOR_*` / `GIT_COMMITTER_*` environment variables, so do not change git config. Locally it is the git config.
- No AI attribution: never add `Co-Authored-By: Claude`, "Generated with Claude Code", `Claude-Session:` trailers or session links to commits or files.
- Before every push, check `git log -1 --format='%an <%ae>%n%B'`. If the author is wrong, stop and tell the owner instead of pushing. If only trailers are wrong, amend the message.
