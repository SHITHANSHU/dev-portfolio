"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { search, type SearchDoc } from "@/lib/search/score";

export function SearchClient() {
  const [docs, setDocs] = useState<SearchDoc[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    fetch(`${base}/search-index.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then(setDocs).catch(() => setFailed(true));
  }, []);
  const results = useMemo(() => (docs ? search(docs, q) : []), [docs, q]);
  return (
    <div>
      <label htmlFor="q" className="meta block mb-2">Search articles and projects</label>
      <input id="q" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="kafka, GOP, qos, partition…" className="w-full border-b-2 border-ink bg-transparent py-3 font-serif text-3xl outline-none focus-visible:border-signal placeholder:text-muted/60" />
      <p className="meta mt-3" role="status">
        {failed ? "Search index failed to load." : !docs ? "Loading index…" : q.trim() ? `${results.length} result${results.length === 1 ? "" : "s"}` : `${docs.length} documents indexed`}
      </p>
      {docs && q.trim() && results.length === 0 && <p className="mt-6 font-serif text-xl">Nothing matches “{q}”. Try a single term such as a technology name.</p>}
      <ul className="mt-4">
        {results.map((r) => (
          <li key={r.href} className="border-b border-rule py-5">
            <p className="meta">{r.kind === "article" ? "Journal" : "Project"} · {r.tags.slice(0, 3).join(" · ")}</p>
            <Link href={r.href} className="font-serif text-2xl leading-tight hover:underline decoration-signal underline-offset-4">{r.title}</Link>
            <p className="mt-1 text-ink-2 text-base">{r.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
