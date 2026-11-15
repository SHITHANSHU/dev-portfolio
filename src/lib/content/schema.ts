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

/** Project lifecycle. */
export const projectStatus = z.enum(["idea", "in-progress", "completed", "archived"]);
export type ProjectStatus = z.infer<typeof projectStatus>;

const yearMonth = z.string().regex(/^\d{4}-\d{2}$/, "expected YYYY-MM");

export const projectMetaSchema = z
  .object({
    title: z.string(),
    summary: z.string().min(40).max(320),
    status: projectStatus,
    statusNote: z.string().optional(),
    /** Short bullets shown before the detailed write-up. */
    tldr: z.array(z.string()).min(2).max(6),
    category: z.string(),
    /** Technologies used. */
    tags: z.array(z.string()).min(1),
    started: yearMonth,
    completed: yearMonth.optional(),
    repo: z.string().url().optional(),
    demo: z.string().url().optional(),
    /** Display order on the archive; lower first. */
    order: z.number().int(),
    featured: z.boolean().default(false),
    role: z.string().optional(),
    /** Other verified, safe-to-publish links. */
    links: z.array(z.object({ label: z.string(), href: z.string().url() })).default([]),
    /** Key/value facts shown in the spec sheet. Only evidenced facts. */
    facts: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  })
  .refine((m) => (m.status === "completed") === !!m.completed, { message: "`completed` is required for, and only for, status completed", path: ["completed"] });
export type ProjectMeta = z.infer<typeof projectMetaSchema>;

export type Heading = { id: string; text: string; level: 2 | 3 };

export type Article = { slug: string; meta: ArticleMeta; source: string; headings: Heading[]; readingMinutes: number };
export type Project = { slug: string; meta: ProjectMeta; source: string; headings: Heading[] };
