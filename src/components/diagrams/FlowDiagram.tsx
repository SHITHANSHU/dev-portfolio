import type { ReactNode } from "react";

export type FlowStep = { label: string; sub?: string; tone?: "default" | "store" | "warn" };

/**
 * Linear architecture diagram. Horizontal on wide screens, vertical on narrow ones.
 * Semantic <ol>, so it reads correctly to assistive tech without relying on the arrows.
 */
export function FlowDiagram({ steps, title }: { steps: FlowStep[]; title: string }) {
  return (
    <ol aria-label={title} className="flex flex-col gap-0 md:flex-row md:items-stretch">
      {steps.map((s, i) => (
        <li key={s.label} className="flex md:flex-1 md:flex-row flex-col items-stretch">
          <div className={`flex-1 border px-3 py-2.5 font-sans ${s.tone === "store" ? "border-ink bg-paper-2" : s.tone === "warn" ? "border-signal" : "border-rule"}`}>
            <p className="font-semibold text-[0.9rem] leading-tight">{s.label}</p>
            {s.sub && <p className="mt-1 text-[0.78rem] leading-snug text-muted">{s.sub}</p>}
          </div>
          {i < steps.length - 1 && (
            <span aria-hidden className="flex items-center justify-center text-signal md:w-6 h-6 md:h-auto num">
              <span className="md:hidden">↓</span><span className="hidden md:inline">→</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function Legend({ children }: { children: ReactNode }) {
  return <p className="meta mt-3 normal-case tracking-normal">{children}</p>;
}
