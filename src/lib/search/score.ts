export type SearchDoc = {
  kind: "article" | "project";
  title: string;
  href: string;
  description: string;
  tags: string[];
  headings: string[];
  /** Plain-text excerpt of the body, truncated at build time. */
  text: string;
};

const tokenize = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9.+#]+/).filter(Boolean);

/** Field-weighted term match. Every query token must match somewhere (AND), prefix matches count. */
export function scoreDoc(doc: SearchDoc, query: string): number {
  const terms = tokenize(query);
  if (!terms.length) return 0;
  const fields: [string[], number][] = [
    [tokenize(doc.title), 10],
    [doc.tags.flatMap(tokenize), 6],
    [doc.headings.flatMap(tokenize), 4],
    [tokenize(doc.description), 3],
    [tokenize(doc.text), 1],
  ];
  let total = 0;
  for (const term of terms) {
    let best = 0;
    for (const [words, weight] of fields) {
      if (words.includes(term)) best = Math.max(best, weight);
      else if (term.length >= 3 && words.some((w) => w.startsWith(term))) best = Math.max(best, weight * 0.6);
    }
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

export function search(docs: SearchDoc[], query: string, limit = 20): SearchDoc[] {
  return docs
    .map((d) => ({ d, s: scoreDoc(d, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.d.title.localeCompare(b.d.title))
    .slice(0, limit)
    .map((x) => x.d);
}
