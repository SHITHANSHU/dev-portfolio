import { describe, expect, it } from "vitest";
import { search, scoreDoc, type SearchDoc } from "./score";

const doc = (o: Partial<SearchDoc>): SearchDoc => ({ kind: "article", title: "", href: "/", description: "", tags: [], headings: [], text: "", ...o });
const docs = [
  doc({ title: "Kafka partitions", tags: ["Kafka"], href: "/a" }),
  doc({ title: "Camera GOP", text: "kafka mentioned once", href: "/b" }),
  doc({ title: "Robot", href: "/c" }),
];

describe("search", () => {
  it("ranks title/tag matches above body matches", () => {
    expect(search(docs, "kafka").map((d) => d.href)).toEqual(["/a", "/b"]);
  });
  it("requires all terms", () => {
    expect(search(docs, "kafka robot")).toEqual([]);
  });
  it("supports prefix and ignores empty queries", () => {
    expect(search(docs, "partit")[0]?.href).toBe("/a");
    expect(search(docs, "   ")).toEqual([]);
    expect(scoreDoc(docs[0] as SearchDoc, "")).toBe(0);
  });
});
