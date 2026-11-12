import { getArticles } from "@/lib/content/load";
import { absoluteUrl, site } from "@/lib/site";

export const dynamic = "force-static";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function GET() {
  const items = getArticles()
    .map((a) => `<item><title>${esc(a.meta.title)}</title><link>${absoluteUrl(`/journal/${a.slug}/`)}</link><guid isPermaLink="true">${absoluteUrl(`/journal/${a.slug}/`)}</guid><pubDate>${new Date(`${a.meta.date}T00:00:00Z`).toUTCString()}</pubDate><description>${esc(a.meta.description)}</description>${a.meta.tags.map((t) => `<category>${esc(t)}</category>`).join("")}</item>`)
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${esc(site.title)}</title><link>${absoluteUrl("/")}</link><description>${esc(site.tagline)}</description><language>en</language><atom:link href="${absoluteUrl("/rss.xml")}" rel="self" type="application/rss+xml"/>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
