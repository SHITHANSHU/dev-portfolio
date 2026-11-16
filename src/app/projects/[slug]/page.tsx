import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mdx } from "@/components/content/Mdx";
import { Toc } from "@/components/journal/Toc";
import { formatMonth, getProject, getProjects } from "@/lib/content/load";
import { absoluteUrl } from "@/lib/site";

type Params = { slug: string };
export const dynamicParams = false;
export const generateStaticParams = (): Params[] => getProjects().map((p) => ({ slug: p.slug }));

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = getProject((await params).slug);
  if (!p) return {};
  const url = absoluteUrl(`/projects/${p.slug}/`);
  return { title: p.meta.title, description: p.meta.summary, alternates: { canonical: url }, openGraph: { type: "article", url, title: p.meta.title, description: p.meta.summary } };
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="py-2"><dt className="meta">{label}</dt><dd className="mt-0.5">{children}</dd></div>;
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const p = getProject((await params).slug);
  if (!p) notFound();
  const { meta } = p;
  const all = getProjects();
  const i = all.findIndex((x) => x.slug === p.slug);
  const next = all[(i + 1) % all.length];
  return (
    <article className="wrap pt-14">
      <Link href="/projects/" className="meta hover:text-ink">← All projects</Link>
      <header className="mt-6 grid gap-10 md:grid-cols-12">
        <div className="md:col-span-8">
          <p className="section-no">Case study · {meta.category}</p>
          <h1 className="mt-3 font-serif text-5xl md:text-7xl font-medium tracking-tight leading-[0.98]">{meta.title}</h1>
          <p className="mt-6 max-w-2xl font-serif text-2xl leading-snug text-ink-2">{meta.summary}</p>
          <section aria-label="TL;DR" className="mt-10 border-y-2 border-ink bg-paper-2 px-5 py-5">
            <p className="meta" style={{ color: "var(--signal)" }}>TL;DR</p>
            <ul className="mt-3 space-y-2 font-sans text-[0.95rem] leading-relaxed">
              {meta.tldr.map((t) => <li key={t} className="pl-4 -indent-4"><span aria-hidden className="text-signal">▸ </span>{t}</li>)}
            </ul>
          </section>
        </div>
        <aside className="md:col-span-4 border-t-2 border-ink pt-3 font-sans text-sm" aria-label="Project facts">
          <dl className="divide-y divide-rule">
            <Row label="Timeline">{formatMonth(meta.started)}{meta.completed && ` – ${formatMonth(meta.completed)}`}</Row>
            {meta.role && <Row label="Role">{meta.role}</Row>}
            <Row label="Stack">{meta.tags.join(" · ")}</Row>
            {meta.repo && <Row label="Repository"><a className="link" href={meta.repo} rel="noopener">{meta.repo.replace(/^https?:\/\//, "")}</a></Row>}
            {meta.demo && <Row label="Live demo"><a className="link" href={meta.demo} rel="noopener">{meta.demo.replace(/^https?:\/\//, "")}</a></Row>}
            {meta.links.map((l) => <Row key={l.href} label="Link"><a className="link" href={l.href} rel="noopener">{l.label}</a></Row>)}
            {meta.facts.map((f) => <Row key={f.label} label={f.label}>{f.value}</Row>)}
          </dl>
        </aside>
      </header>
      <div className="mt-14 grid gap-x-12 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="hidden lg:block"><div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2"><Toc headings={p.headings} /></div></aside>
        <div className="min-w-0 max-w-[56rem]">
          <details className="lg:hidden mb-8 border border-rule px-4 py-2 font-sans text-sm"><summary className="cursor-pointer min-h-9 py-1 font-medium">Contents</summary><div className="py-3"><Toc headings={p.headings} /></div></details>
          <div className="prose prose-doc"><Mdx source={p.source} /></div>
        </div>
      </div>
      {next && next.slug !== p.slug && (
        <nav aria-label="Next project" className="mt-24 border-t-2 border-ink py-6"><p className="meta">Next project</p><Link href={`/projects/${next.slug}/`} className="font-serif text-3xl hover:underline decoration-signal underline-offset-4">{next.meta.title}</Link></nav>
      )}
    </article>
  );
}
