import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate, getArticles, getProjects } from "@/lib/content/load";
import { site } from "@/lib/site";

export default function Home() {
  const articles = getArticles();
  const projects = getProjects();
  const [lead, ...others] = articles;
  return (
    <>
      <section className="wrap pt-14 md:pt-24 pb-16">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-8">
            <p className="meta">{site.name} · {site.location}</p>
            <h1 className="mt-5 font-serif text-[2.7rem] leading-[1.02] font-medium tracking-tight md:text-[5.2rem] [text-wrap:balance]">
              Backend engineer building distributed systems, streaming pipelines and video infrastructure.
            </h1>
            <p className="mt-8 max-w-xl text-xl leading-snug text-ink-2">Founding Engineer at Beltech AI, working on multi-tenant platforms, real-time data and camera analytics. I write here about system design and the trade-offs behind it.</p>
            <p className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-sans text-sm font-medium">
              <Link className="link" href="/journal/">Read the journal →</Link>
              <Link className="link" href="/projects/">Projects →</Link>
              <Link className="link" href="/about/">About →</Link>
            </p>
          </div>
          <aside className="md:col-span-4 md:border-l md:border-rule md:pl-8 font-sans text-sm self-end" aria-label="At a glance">
            <p className="meta mb-3">At a glance</p>
            <dl className="divide-y divide-rule border-y border-rule">
              {[["Now", "Founding Engineer, Beltech AI"], ["Since", "April 2021"], ["Works in", "Kafka · MQTT · ksqlDB · Debezium · PostgreSQL · Spring Boot · Python"], ["Domain", "Smart-city platforms, VMS for large camera fleets, ledgers and workflows"]].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[4.5rem_1fr] gap-3 py-2.5"><dt className="meta pt-0.5">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </aside>
        </div>
      </section>

      {lead && (
        <section aria-labelledby="featured" className="border-t-2 border-ink">
          <div className="wrap grid gap-x-10 gap-y-6 py-12 md:grid-cols-12">
            <h2 id="featured" className="meta md:col-span-2 pt-2">Latest article</h2>
            <div className="md:col-span-7">
              <p className="section-no">{lead.meta.series} · {lead.readingMinutes} min · {formatDate(lead.meta.date)}</p>
              <Link href={`/journal/${lead.slug}/`} className="group block mt-2">
                <h3 className="font-serif text-4xl md:text-5xl font-medium leading-[1.05] tracking-tight group-hover:underline decoration-signal decoration-2 underline-offset-8 [text-wrap:balance]">{lead.meta.title}</h3>
              </Link>
              <p className="mt-5 max-w-xl text-lg text-ink-2">{lead.meta.description}</p>
            </div>
            <ol className="md:col-span-3 border-t md:border-t-0 md:border-l border-rule md:pl-6 space-y-5" aria-label="More articles">
              {others.map((a) => (
                <li key={a.slug}>
                  <p className="meta">{a.meta.series}</p>
                  <Link href={`/journal/${a.slug}/`} className="font-serif text-xl leading-snug hover:underline decoration-signal underline-offset-4">{a.meta.title}</Link>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <section aria-labelledby="work" className="border-t border-rule">
        <div className="wrap py-12">
          <div className="flex items-baseline justify-between"><h2 id="work" className="meta">Selected projects</h2><Link href="/projects/" className="meta hover:text-ink">All projects →</Link></div>
          <ol className="mt-6">
            {projects.map((p, i) => (
              <li key={p.slug} className="border-t border-rule">
                <Link href={`/projects/${p.slug}/`} className="group grid items-baseline gap-x-8 gap-y-1 py-5 md:grid-cols-12">
                  <span className="section-no md:col-span-1">{String(i + 1).padStart(2, "0")}</span>
                  <span className="md:col-span-5 font-serif text-3xl leading-tight group-hover:underline decoration-signal underline-offset-4">{p.meta.title}</span>
                  <span className="md:col-span-4 text-ink-2 text-base">{p.meta.category}</span>
                  <span className="md:col-span-2 md:text-right"><StatusBadge status={p.meta.status} /></span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="labs" className="border-t-2 border-ink">
        <div className="wrap grid gap-x-10 gap-y-4 py-12 md:grid-cols-12">
          <h2 id="labs" className="meta md:col-span-2 pt-2">Interactive labs</h2>
          <p className="md:col-span-6 font-serif text-2xl leading-snug">Articles include interactive models: capacity calculators, partition explorers, an MQTT QoS playground and a GOP visualiser. Each one states its assumptions.</p>
          <p className="md:col-span-4 meta normal-case tracking-normal !text-[0.85rem] leading-relaxed">All data is synthetic. The models do not connect to real systems, and their output is not benchmark data.</p>
        </div>
      </section>
    </>
  );
}
