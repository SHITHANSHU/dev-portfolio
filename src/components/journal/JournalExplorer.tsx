"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

export type JournalItem = { slug: string; title: string; description: string; date: string; dateLabel: string; category: string; tags: string[]; readingMinutes: number; series?: string };

export function JournalExplorer({ items }: { items: JournalItem[] }) {
  const categories = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);
  const tags = useMemo(() => [...new Set(items.flatMap((i) => i.tags))].sort(), [items]);
  const [cat, setCat] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const shown = items.filter((i) => (!cat || i.category === cat) && (!tag || i.tags.includes(tag)));
  const clear = () => { setCat(null); setTag(null); };

  const chip = (on: boolean) => `meta min-h-9 border px-2.5 ${on ? "border-ink bg-ink text-paper" : "border-rule hover:border-ink"}`;
  return (
    <div>
      <div className="grid gap-4 border-y border-rule py-4 md:grid-cols-[8rem_1fr]">
        <p className="meta pt-2">Category</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {categories.map((c) => <button key={c} type="button" aria-pressed={cat === c} className={chip(cat === c)} onClick={() => setCat(cat === c ? null : c)}>{c}</button>)}
        </div>
        <p className="meta pt-2">Topic</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by topic">
          {tags.map((t) => <button key={t} type="button" aria-pressed={tag === t} className={chip(tag === t)} onClick={() => setTag(tag === t ? null : t)}>{t}</button>)}
        </div>
      </div>
      <p className="meta mt-4" role="status">{shown.length} of {items.length} articles{(cat || tag) && <> · <button type="button" className="underline" onClick={clear}>clear filters</button></>}</p>
      {shown.length === 0 ? (
        <p className="mt-8 font-serif text-xl">No articles match those filters. <button type="button" className="link" onClick={clear}>Show all</button>.</p>
      ) : (
        <ol className="mt-2">
          {shown.map((a) => (
            <li key={a.slug} className="group grid gap-x-8 gap-y-2 border-b border-rule py-8 md:grid-cols-12">
              <div className="md:col-span-2 meta space-y-1"><p>{a.series}</p><p>{a.dateLabel}</p><p>{a.readingMinutes} min read</p></div>
              <div className="md:col-span-7">
                <h2 className="font-serif text-[1.65rem] leading-tight font-medium tracking-tight">
                  <Link href={`/journal/${a.slug}/`} className="hover:underline decoration-signal underline-offset-4 decoration-2">{a.title}</Link>
                </h2>
                <p className="mt-2 text-[1.02rem] text-ink-2">{a.description}</p>
              </div>
              <ul className="md:col-span-3 meta flex flex-wrap content-start gap-x-3 gap-y-1 md:justify-end" aria-label="Tags">
                {a.tags.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
