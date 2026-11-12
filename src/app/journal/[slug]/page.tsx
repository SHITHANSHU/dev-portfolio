import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mdx } from "@/components/content/Mdx";
import { Toc } from "@/components/journal/Toc";
import { formatDate, getAdjacent, getArticle, getArticles, getRelated } from "@/lib/content/load";
import { absoluteUrl, site } from "@/lib/site";

type Params = { slug: string };
export const dynamicParams = false;
export const generateStaticParams = (): Params[] => getArticles().map((a) => ({ slug: a.slug }));

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const a = getArticle((await params).slug);
  if (!a) return {};
  const url = absoluteUrl(`/journal/${a.slug}/`);
  return {
    title: a.meta.title,
    description: a.meta.description,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title: a.meta.title, description: a.meta.description, publishedTime: a.meta.date, modifiedTime: a.meta.updated, tags: a.meta.tags },
    twitter: { card: "summary", title: a.meta.title, description: a.meta.description },
  };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const a = getArticle((await params).slug);
  if (!a) notFound();
  const { prev, next } = getAdjacent(a);
  const related = getRelated(a);
  const ld = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: a.meta.title,
    description: a.meta.description,
    datePublished: a.meta.date,
    dateModified: a.meta.updated ?? a.meta.date,
    author: { "@type": "Person", name: site.name },
    keywords: a.meta.tags.join(", "),
    mainEntityOfPage: absoluteUrl(`/journal/${a.slug}/`),
  };
  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <header className="wrap pt-14 pb-10">
        <p className="section-no">{a.meta.series} · {a.meta.category}</p>
        <h1 className="mt-3 max-w-4xl font-serif text-[2.4rem] leading-[1.05] md:text-6xl font-medium tracking-tight [text-wrap:balance]">{a.meta.title}</h1>
        <p className="mt-6 max-w-2xl font-serif text-xl leading-snug text-ink-2">{a.meta.description}</p>
        <dl className="meta mt-8 flex flex-wrap gap-x-8 gap-y-2 border-t border-rule pt-3">
          <div><dt className="sr-only">Author</dt><dd>{site.name}</dd></div>
          <div><dt className="sr-only">Published</dt><dd><time dateTime={a.meta.date}>{formatDate(a.meta.date)}</time></dd></div>
          <div><dt className="sr-only">Reading time</dt><dd>{a.readingMinutes} min read</dd></div>
          <div><dt className="sr-only">Topics</dt><dd>{a.meta.tags.join(" · ")}</dd></div>
        </dl>
      </header>
      <div className="wrap grid gap-x-12 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="hidden lg:block"><div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2"><Toc headings={a.headings} /></div></aside>
        <div className="min-w-0 max-w-[56rem]">
          <details className="lg:hidden mb-8 border border-rule px-4 py-2 font-sans text-sm"><summary className="cursor-pointer min-h-9 py-1 font-medium">Contents</summary><div className="py-3"><Toc headings={a.headings} /></div></details>
          <div className="prose"><Mdx source={a.source} /></div>
        </div>
      </div>
      <nav aria-label="More articles" className="wrap mt-24 grid gap-0 border-t-2 border-ink md:grid-cols-2">
        {[{ x: prev, l: "Previous" }, { x: next, l: "Next" }].map(({ x, l }) => (
          <div key={l} className="border-b border-rule py-6 md:pr-8">
            <p className="meta">{l}</p>
            {x ? <Link href={`/journal/${x.slug}/`} className="font-serif text-2xl leading-snug hover:underline decoration-signal underline-offset-4">{x.meta.title}</Link> : <p className="text-muted">—</p>}
          </div>
        ))}
        {related.length > 0 && (
          <div className="md:col-span-2 py-6">
            <p className="meta mb-2">Related</p>
            <ul className="grid gap-4 md:grid-cols-2">{related.map((r) => <li key={r.slug}><Link href={`/journal/${r.slug}/`} className="link font-serif text-lg">{r.meta.title}</Link></li>)}</ul>
          </div>
        )}
      </nav>
    </article>
  );
}
