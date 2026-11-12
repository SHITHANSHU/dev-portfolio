import type { ReactNode } from "react";

export type LabKind = "calculator" | "simulation" | "explorer";

const kindLabel: Record<LabKind, string> = {
  calculator: "Calculator · estimate",
  simulation: "Simulation · synthetic data",
  explorer: "Explorer · simplified model",
};

type Props = {
  id: string;
  /** e.g. "Lab 1.C" */
  label: string;
  title: string;
  kind: LabKind;
  /** One sentence: what the reader should understand after using it. */
  objective: string;
  /** Model assumptions, shown behind progressive disclosure. */
  assumptions: string[];
  onReset: () => void;
  /** Plain-language interpretation of the current result; announced to screen readers. */
  summary: ReactNode;
  controls: ReactNode;
  children: ReactNode;
};

/** Common frame for every interactive lab: objective, assumptions, reset, live textual summary. */
export function LabShell({ id, label, title, kind, objective, assumptions, onReset, summary, controls, children }: Props) {
  return (
    <section className="lab my-10" aria-labelledby={`${id}-t`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-lab px-4 py-3 md:px-5">
        <div>
          <p className="meta" style={{ color: "var(--lab)" }}>{label} · {kindLabel[kind]}</p>
          <h3 id={`${id}-t`} className="font-serif text-xl font-semibold leading-tight mt-1">{title}</h3>
        </div>
        <button type="button" className="btn lab-btn" onClick={onReset}>Reset</button>
      </header>
      <p className="px-4 pt-3 md:px-5 text-[0.9rem]"><span className="font-semibold">Goal.</span> {objective}</p>
      <div className="grid grid-cols-1 gap-6 px-4 py-4 md:px-5 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        <div className="space-y-4" role="group" aria-label={`${title} controls`}>{controls}</div>
        <div className="min-w-0">{children}</div>
      </div>
      <div className="border-t border-lab px-4 py-3 md:px-5">
        <p className="font-semibold text-[0.8rem] uppercase tracking-wide mb-1" style={{ color: "var(--lab)" }}>Reading the result</p>
        <div aria-live="polite" aria-atomic="true">{summary}</div>
        <details className="mt-3">
          <summary className="cursor-pointer font-medium min-h-8">Assumptions and limits</summary>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            {assumptions.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </details>
      </div>
    </section>
  );
}
