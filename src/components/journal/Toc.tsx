"use client";
import { useEffect, useState } from "react";
import type { Heading } from "@/lib/content/schema";

/** Sticky table of contents with scroll-spy. Falls back to plain anchor links without JS. */
export function Toc({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState<string>("");
  useEffect(() => {
    const els = headings.map((h) => document.getElementById(h.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-72px 0px -70% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [headings]);
  return (
    <nav aria-label="Table of contents" className="font-sans text-[0.8125rem] leading-snug">
      <p className="meta mb-3">Contents</p>
      <ol className="space-y-1.5 border-l border-rule">
        {headings.map((h) => (
          <li key={h.id} className={h.level === 3 ? "pl-6" : "pl-3"}>
            <a href={`#${h.id}`} aria-current={active === h.id ? "location" : undefined} className={`block -ml-px border-l-2 pl-3 py-0.5 ${active === h.id ? "border-signal text-ink font-medium" : "border-transparent text-muted hover:text-ink"}`} style={{ marginLeft: "calc(-0.75rem - 1px)" }}>
              {h.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
