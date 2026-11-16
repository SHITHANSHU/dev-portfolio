import type { Metadata } from "next";
import Link from "next/link";
import { getProjects } from "@/lib/content/load";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Projects",
  description: "Technical case studies of personal engineering projects: problem, design, architecture, issues and fixes, and what is still restricted. A browser-based architecture simulator, an offline BLE peer-to-peer app and an ESP32-C3 desk robot.",
  alternates: { canonical: absoluteUrl("/projects/") },
};

export default function Page() {
  const projects = getProjects();
  const [lead, ...rest] = projects;
  return (
    <div className="wrap pt-14">
      <header className="grid gap-4 md:grid-cols-12 mb-12">
        <p className="section-no md:col-span-2">§ Projects</p>
        <div className="md:col-span-8">
          <h1 className="font-serif text-5xl md:text-6xl font-medium tracking-tight leading-[1.02]">Projects</h1>
          <p className="mt-5 max-w-xl text-ink-2">Case studies of personal projects: the problem, the design and its trade-offs, the architecture, what broke and how it was fixed, and what is still to be built. Hardware projects include full build guides.</p>
        </div>
      </header>
      {lead && (
        <Link href={`/projects/${lead.slug}/`} className="group grid gap-8 border-y-2 border-ink py-10 md:grid-cols-12">
          <div className="md:col-span-4 space-y-2"><p className="section-no">01 · {lead.meta.started.slice(0, 4)}</p><p className="meta">{lead.meta.category}</p></div>
          <div className="md:col-span-8">
            <h2 className="font-serif text-4xl md:text-5xl font-medium tracking-tight leading-none group-hover:underline decoration-signal decoration-2 underline-offset-8">{lead.meta.title}</h2>
            <p className="mt-5 max-w-2xl text-xl text-ink-2 leading-snug">{lead.meta.summary}</p>
            <ul className="meta mt-5 flex flex-wrap gap-x-4 gap-y-1">{lead.meta.tags.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        </Link>
      )}
      <ol className="mt-0">
        {rest.map((p, i) => (
          <li key={p.slug} className="border-b border-rule">
            <Link href={`/projects/${p.slug}/`} className="group grid gap-x-8 gap-y-2 py-8 md:grid-cols-12">
              <p className="section-no md:col-span-1">{String(i + 2).padStart(2, "0")}</p>
              <div className="md:col-span-7">
                <h2 className="font-serif text-3xl leading-tight font-medium group-hover:underline decoration-signal decoration-2 underline-offset-4">{p.meta.title}</h2>
                <p className="mt-2 text-ink-2">{p.meta.summary}</p>
              </div>
              <div className="md:col-span-4 md:text-right"><p className="meta">{p.meta.category} · {p.meta.started.slice(0, 4)}</p></div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
