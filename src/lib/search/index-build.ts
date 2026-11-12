import { getArticles, getProjects } from "@/lib/content/load";
import type { SearchDoc } from "./score";

const plain = (md: string, max = 5000) =>
  md.replace(/```[\s\S]*?```/g, " ").replace(/<[^>]*>/g, " ").replace(/[#*_`>|\[\]()]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function buildSearchIndex(): SearchDoc[] {
  return [
    ...getArticles().map((a): SearchDoc => ({ kind: "article", title: a.meta.title, href: `/journal/${a.slug}/`, description: a.meta.description, tags: [a.meta.category, ...a.meta.tags], headings: a.headings.map((h) => h.text), text: plain(a.source) })),
    ...getProjects().map((p): SearchDoc => ({ kind: "project", title: p.meta.title, href: `/projects/${p.slug}/`, description: p.meta.summary, tags: [p.meta.category, ...p.meta.tags], headings: p.headings.map((h) => h.text), text: plain(p.source) })),
  ];
}
