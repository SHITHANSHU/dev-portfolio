import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractHeadings, getArticles, getProjects, readingMinutes } from "./load";
import { labComponents } from "@/components/lab/registry";

describe("content", () => {
  it("loads and validates every article and project (frontmatter schema)", () => {
    expect(getArticles().length).toBeGreaterThanOrEqual(3);
    expect(getProjects().length).toBeGreaterThanOrEqual(3);
  });
  it("resolves related slugs", () => {
    const slugs = new Set(getArticles().map((a) => a.slug));
    for (const a of getArticles()) for (const r of a.meta.related) expect(slugs.has(r), `${a.slug} → ${r}`).toBe(true);
  });
  it("every lab tag used in MDX is registered", () => {
    const known = new Set([...Object.keys(labComponents), "Callout", "Figure", "Details", "Metric", "PhotoSlot", "FlowDiagram", "SequenceDiagram"]);
    for (const a of [...getArticles(), ...getProjects()]) {
      const stripped = a.source.replace(/```[\s\S]*?```/g, "");
      for (const m of stripped.matchAll(/<([A-Z][A-Za-z0-9]+)/g)) expect(known.has(m[1] ?? ""), `${a.slug}: <${m[1]}>`).toBe(true);
    }
  });
  it("every root-relative image in project MDX exists under public/", () => {
    for (const p of getProjects()) for (const m of p.source.matchAll(/!\[[^\]]*\]\((\/[^)\s]+)\)|src="(\/[^"]+)"/g)) {
      const src = m[1] ?? m[2] ?? "";
      expect(fs.existsSync(path.join(process.cwd(), "public", src)), `${p.slug}: ${src}`).toBe(true);
    }
  });
  it("heading ids are unique per document", () => {
    for (const d of [...getArticles(), ...getProjects()]) {
      const ids = d.headings.map((h) => h.id);
      expect(new Set(ids).size, d.headings.map((h) => h.text).join("|")).toBe(ids.length);
    }
  });
  it("no secrets or private network details in content", () => {
    const dir = path.join(process.cwd(), "src", "content");
    for (const sub of ["articles", "projects"]) for (const f of fs.readdirSync(path.join(dir, sub))) {
      const t = fs.readFileSync(path.join(dir, sub, f), "utf8");
      expect(t, f).not.toMatch(/AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|\b192\.168\.\d+\.\d+\b|\b10\.\d+\.\d+\.\d+\b|\/Users\/shithanshu/);
    }
  });
  it("extractHeadings ignores fenced code and matches slugger duplicates", () => {
    const hs = extractHeadings("## A\n```\n## not\n```\n## A\n### B `x`");
    expect(hs.map((h) => h.id)).toEqual(["a", "a-1", "b-x"]);
  });
  it("readingMinutes is >= 1", () => expect(readingMinutes("short")).toBe(1));
});
