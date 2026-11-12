import type { Metadata } from "next";
import { SearchClient } from "@/components/journal/SearchClient";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Search", description: "Search articles and projects.", alternates: { canonical: absoluteUrl("/search/") } };

export default function Page() {
  return <div className="wrap pt-14 max-w-3xl"><SearchClient /></div>;
}
