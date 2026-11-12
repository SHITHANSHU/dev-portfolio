import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mdx } from "@/components/content/Mdx";
import { Toc } from "@/components/journal/Toc";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getProject, getProjects } from "@/lib/content/load";
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

export default async function Page({ params }: { params: Promise<Params> }) {
  const p = getProject((await params).slug);
  if (!p) notFound();
  const all = getProjects();
  const i = all.findIndex((x) => x.slug === p.slug);
  const next = all[(i + 1) % all.length];
  return (
    <article className="wrap pt-14">
      <Link href="/projects/" className="meta hover:text-ink">← All projects</Link>
      <header className="mt-6 grid gap-10 md:grid-cols-12">
        <div className="md:col-span-8">
          <p className="section-no">{p.meta.category} · {p.meta.year}</p>
          <h1 className="mt-3 font-serif text-5xl md:text-7xl font-medium tracking-tight leading-[0.98]">{p.meta.title}</h1>
          <p className="mt-6 max-w-2xl font-serif text-2xl leading-snug text-ink-2">{p.meta.summary}</p>
        </div>
        <aside className="md:col-span-4 border-t-2 border-ink pt-3 font-sans text-sm" aria-label="Project facts">
          <dl className="divide-y divide-rule">
            <div className="py-2"><dt className="meta">Status</dt><dd className="mt-1"><StatusBadge status={p.meta.status} />{p.meta.statusNote && <span className="block mt-1 text-muted">{p.meta.statusNote}</span>}</dd></div>
            {p.meta.role && <div className="py-2"><dt className="meta">Role</dt><dd>{p.meta.role}</dd></div>}
            {p.meta.facts.map((f) => <div key={f.label} className="py-2"><dt className="meta">{f.label}</dt><dd>{f.value}</dd></div>)}
            {p.meta.links.map((l) => <div key={l.href} className="py-2"><dt className="meta">Link</dt><dd><a className="link" href={l.href} rel="noopener">{l.label}</a></dd></div>)}
          </dl>
        </aside>
      </header>
      <hr className="rule-strong mt-12" />
      <div className="mt-10 grid gap-x-12 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="hidden lg:block"><div className="sticky top-20"><Toc headings={p.headings} /></div></aside>
        <div className="min-w-0"><div className="prose"><Mdx source={p.source} /></div></div>
      </div>
      {next && next.slug !== p.slug && (
        <nav aria-label="Next project" className="mt-24 border-t-2 border-ink py-6"><p className="meta">Next project</p><Link href={`/projects/${next.slug}/`} className="font-serif text-3xl hover:underline decoration-signal underline-offset-4">{next.meta.title}</Link></nav>
      )}
    </article>
  );
}
