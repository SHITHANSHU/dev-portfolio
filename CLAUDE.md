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
- Cloud: the `blog-rules` checkout next to this repo. Find it with `ls -d ../blog-rules /home/user/blog-rules ~/blog-rules 2>/dev/null`. If it is missing, add the `SHITHANSHU/blog-rules` repository to the session; if that fails, say so and stop.

## Fresh environment

Run `npm ci` before any check. Chrome is at `$CHROME_PATH` in cloud sessions; `scripts/overflow.mjs` uses it.

## Publishing

- Work on `main`. No branch, no pull request.
- Before pushing, the full Verify block from the skill must pass: `npm run typecheck && npm run lint && npm test && npm run build && node scripts/check-links.mjs`.
- Commit and `git push origin main`; the push deploys.

## Git

- Author: `shithanshu <shithanshu.smishra@gmail.com>`. Set `git config user.name` / `user.email` if a fresh environment has anything else.
- No AI attribution: never add `Co-Authored-By: Claude`, "Generated with Claude Code", `Claude-Session:` trailers or session links to commits or files.
- Before every push, check `git log -1 --format='%an <%ae>%n%B'`. If the author or the trailers are wrong, fix the config and `git commit --amend --reset-author` before pushing.
