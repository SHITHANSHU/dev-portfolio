import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { site, absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.title, template: `%s — ${site.name}` },
  description: site.tagline,
  alternates: { canonical: absoluteUrl("/"), types: { "application/rss+xml": absoluteUrl("/rss.xml") } },
  openGraph: { type: "website", siteName: site.title, title: site.title, description: site.tagline },
  twitter: { card: "summary" },
};

// Runs before paint to avoid a theme flash.
const themeScript = `try{var t=localStorage.getItem("theme");var a=["light","white","dark","sage","clay"];if(!a.includes(t))t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:bg-ink focus:text-paper focus:px-3 focus:py-2">Skip to content</a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
