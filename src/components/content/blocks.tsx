import type { ReactNode } from "react";

type Tone = "note" | "warning" | "assumption";
const tones: Record<Tone, { label: string; color: string }> = {
  note: { label: "Note", color: "var(--ink)" },
  warning: { label: "Caution", color: "var(--signal)" },
  assumption: { label: "Assumption", color: "var(--lab)" },
};

export function Callout({ type = "note", title, children }: { type?: Tone; title?: string; children: ReactNode }) {
  const t = tones[type];
  return (
    <aside className="my-6 border-l-[3px] bg-paper-2 py-3 pl-4 pr-4 font-sans text-[0.95rem] leading-relaxed [&>p+p]:mt-2" style={{ borderColor: t.color }}>
      <p className="meta mb-1" style={{ color: t.color }}>{title ?? t.label}</p>
      {children}
    </aside>
  );
}

export function Figure({ caption, children, label }: { caption: ReactNode; children: ReactNode; label?: string }) {
  return (
    <figure className="bleed my-8">
      <div className="border-y border-rule py-5">{children}</div>
      <figcaption className="meta mt-2 normal-case tracking-normal !text-[0.8rem] leading-snug max-w-[40rem]">
        {label && <span className="mr-2 uppercase tracking-wider" style={{ color: "var(--signal)" }}>{label}</span>}{caption}
      </figcaption>
    </figure>
  );
}

export function Details({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="my-5 border border-rule px-4 py-2 font-sans text-[0.95rem]">
      <summary className="cursor-pointer min-h-9 py-1 font-medium">{summary}</summary>
      <div className="pt-2 pb-2 space-y-3">{children}</div>
    </details>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="table-scroll my-6" tabIndex={0} role="region" aria-label="Table">{children}</div>;
}

/** Marked place for a real photo that has not been taken yet. */
export function PhotoSlot({ caption }: { caption: string }) {
  return (
    <figure className="my-8 border-2 border-dashed border-rule bg-paper-2 px-5 py-10 text-center font-sans">
      <p className="meta">Photo to add</p>
      <figcaption className="mt-2 text-sm text-ink-2">{caption}</figcaption>
    </figure>
  );
}

/** Label/value result chip for inline calculations in prose. */
export function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <span className="inline-flex flex-col border-t-2 border-ink pr-6 pt-1 font-sans align-top">
      <span className="meta">{label}</span>
      <span className="num text-xl">{value}</span>
      {note && <span className="text-xs text-muted">{note}</span>}
    </span>
  );
}
