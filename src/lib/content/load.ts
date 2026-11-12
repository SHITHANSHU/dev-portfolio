import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import GithubSlugger from "github-slugger";
import {
  articleMetaSchema,
  projectMetaSchema,
  type Article,
  type Heading,
  type Project,
} from "./schema";

const root = path.join(process.cwd(), "src", "content");

function readDir(dir: string): { slug: string; file: string }[] {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => ({ slug: f.replace(/\.mdx$/, ""), file: path.join(full, f) }));
}

/** Extract h2/h3 headings outside fenced code blocks; ids match rehype-slug (github-slugger). */
export function extractHeadings(source: string): Heading[] {
  const slugger = new GithubSlugger();
  const out: Heading[] = [];
  let fenced = false;
  for (const line of source.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const m = /^(#{2,3})\s+(.+?)\s*#*$/.exec(line);
    if (!m) continue;
    const text = (m[2] ?? "").replace(/[`*_]/g, "");
    out.push({ id: slugger.slug(text), text, level: m[1]?.length === 2 ? 2 : 3 });
  }
  return out;
}

export function readingMinutes(source: string): number {
  const prose = source.replace(/```[\s\S]*?```/g, "").replace(/<[^>]+>/g, " ");
  const words = prose.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

let articleCache: Article[] | null = null;
let projectCache: Project[] | null = null;

export function getArticles(): Article[] {
  if (articleCache) return articleCache;
  const includeDrafts = process.env.NODE_ENV !== "production";
  const all = readDir("articles").map(({ slug, file }) => {
    const { data, content } = matter(fs.readFileSync(file, "utf8"));
    const parsed = articleMetaSchema.safeParse(data);
    if (!parsed.success) throw new Error(`Invalid frontmatter in articles/${slug}.mdx: ${parsed.error.message}`);
    return { slug, meta: parsed.data, source: content, headings: extractHeadings(content), readingMinutes: readingMinutes(content) };
  });
  articleCache = all
    .filter((a) => includeDrafts || a.meta.status === "published")
    .sort((a, b) => b.meta.date.localeCompare(a.meta.date));
  return articleCache;
}

export function getProjects(): Project[] {
  if (projectCache) return projectCache;
  projectCache = readDir("projects")
    .map(({ slug, file }) => {
      const { data, content } = matter(fs.readFileSync(file, "utf8"));
      const parsed = projectMetaSchema.safeParse(data);
      if (!parsed.success) throw new Error(`Invalid frontmatter in projects/${slug}.mdx: ${parsed.error.message}`);
      return { slug, meta: parsed.data, source: content, headings: extractHeadings(content) };
    })
    .sort((a, b) => a.meta.order - b.meta.order);
  return projectCache;
}

export const getArticle = (slug: string) => getArticles().find((a) => a.slug === slug);
export const getProject = (slug: string) => getProjects().find((p) => p.slug === slug);

export function getRelated(article: Article, limit = 2): Article[] {
  const all = getArticles().filter((a) => a.slug !== article.slug);
  const explicit = article.meta.related.map((s) => all.find((a) => a.slug === s)).filter((a): a is Article => !!a);
  const scored = all
    .filter((a) => !explicit.includes(a))
    .map((a) => ({ a, score: a.meta.tags.filter((t) => article.meta.tags.includes(t)).length }))
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
  return [...explicit, ...scored].slice(0, limit);
}

export function getAdjacent(article: Article): { prev?: Article; next?: Article } {
  const all = getArticles();
  const i = all.findIndex((a) => a.slug === article.slug);
  return { prev: all[i + 1], next: all[i - 1] };
}

export const formatDate = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
