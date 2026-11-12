import { getArticles, getProjects } from "@/lib/content/load";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const paths = [
    "/", "/about/", "/journal/", "/projects/", "/contact/", "/search/",
    ...getArticles().map((a) => ({ p: `/journal/${a.slug}/`, d: a.meta.updated ?? a.meta.date })),
    ...getProjects().map((p) => `/projects/${p.slug}/`),
  ];
  const urls = paths
    .map((x) => (typeof x === "string" ? `<url><loc>${absoluteUrl(x)}</loc></url>` : `<url><loc>${absoluteUrl(x.p)}</loc><lastmod>${x.d}</lastmod></url>`))
    .join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
