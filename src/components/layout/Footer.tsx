import Link from "next/link";
import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-32 border-t-2 border-ink no-print">
      <div className="wrap grid gap-8 py-10 md:grid-cols-12">
        <p className="md:col-span-5 font-serif text-lg leading-snug max-w-sm">{site.tagline}</p>
        <nav aria-label="Footer" className="md:col-span-4 meta flex flex-col gap-2">
          <Link href="/journal/" className="hover:text-ink">Journal</Link>
          <Link href="/projects/" className="hover:text-ink">Projects</Link>
          <Link href="/about/" className="hover:text-ink">About</Link>
          <a href="/rss.xml" className="hover:text-ink">RSS</a>
        </nav>
        <div className="md:col-span-3 meta flex flex-col gap-2">
          <a href={site.linkedin} className="hover:text-ink" rel="me noopener">LinkedIn</a>
          <a href={`mailto:${site.email}`} className="hover:text-ink">Email</a>
          <span>{site.location}</span>
        </div>
      </div>
      <div className="wrap pb-8 meta">Simulations on this site use synthetic data and simplified models. They are not measurements.</div>
    </footer>
  );
}
