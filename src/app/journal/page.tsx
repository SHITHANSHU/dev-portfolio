import type { Metadata } from "next";
import { JournalExplorer } from "@/components/journal/JournalExplorer";
import { formatDate, getArticles } from "@/lib/content/load";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Journal",
  description: "Long-form engineering articles on CDC pipelines, IoT streaming platforms and IP-camera video systems, each with working simulators.",
  alternates: { canonical: absoluteUrl("/journal/") },
};

export default function Page() {
  const items = getArticles().map((a) => ({ slug: a.slug, title: a.meta.title, description: a.meta.description, date: a.meta.date, dateLabel: formatDate(a.meta.date), category: a.meta.category, tags: a.meta.tags, readingMinutes: a.readingMinutes, series: a.meta.series }));
  return (
    <div className="wrap pt-14">
      <header className="grid gap-4 md:grid-cols-12 mb-10">
        <p className="section-no md:col-span-2">§ Journal</p>
        <div className="md:col-span-8">
          <h1 className="font-serif text-5xl md:text-6xl font-medium tracking-tight leading-[1.02]">Systems, explained until they can be tested.</h1>
          <p className="mt-5 max-w-xl text-ink-2">Long-form articles for engineers. Each one carries working calculators and simulators so assumptions can be changed rather than taken on trust. <a className="link" href="/rss.xml">RSS</a>.</p>
        </div>
      </header>
      <JournalExplorer items={items} />
    </div>
  );
}
