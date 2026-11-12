import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const articleMetaSchema = z.object({
  title: z.string().min(8),
  description: z.string().min(40).max(300),
  date: isoDate,
  updated: isoDate.optional(),
  status: z.enum(["published", "draft"]),
  category: z.string(),
  tags: z.array(z.string()).min(1),
  featured: z.boolean().default(false),
  /** Short label shown in lists, e.g. "Article 01". */
  series: z.string().optional(),
  /** Slugs of related articles; resolved at build time. */
  related: z.array(z.string()).default([]),
});
export type ArticleMeta = z.infer<typeof articleMetaSchema>;

/** Evidence labels from the product plan; never upgrade a label without source evidence. */
export const evidenceStatus = z.enum(["implemented", "demonstrated", "in-progress", "planned", "exploratory"]);
export type EvidenceStatus = z.infer<typeof evidenceStatus>;

export const projectMetaSchema = z.object({
  title: z.string(),
  summary: z.string().min(40).max(320),
  status: evidenceStatus,
  statusNote: z.string().optional(),
  category: z.string(),
  tags: z.array(z.string()).min(1),
  year: z.string(),
  /** Display order on the archive; lower first. */
  order: z.number().int(),
  featured: z.boolean().default(false),
  role: z.string().optional(),
  /** Verified, safe-to-publish links only. */
  links: z.array(z.object({ label: z.string(), href: z.string().url() })).default([]),
  /** Key/value facts shown in the spec sheet. Only evidenced facts. */
  facts: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
});
export type ProjectMeta = z.infer<typeof projectMetaSchema>;

export type Heading = { id: string; text: string; level: 2 | 3 };

export type Article = { slug: string; meta: ArticleMeta; source: string; headings: Heading[]; readingMinutes: number };
export type Project = { slug: string; meta: ProjectMeta; source: string; headings: Heading[] };
