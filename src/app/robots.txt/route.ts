import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";
export const GET = () => new Response(`User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl("/sitemap.xml")}\n`, { headers: { "Content-Type": "text/plain" } });
