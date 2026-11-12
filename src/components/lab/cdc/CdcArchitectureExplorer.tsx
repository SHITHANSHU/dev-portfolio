"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { Segmented } from "../controls";
import { STAGES, eventWalk, type Op } from "@/lib/calc/cdc";
import { usePlayer } from "./usePlayer";

const OPS = [
  { value: "insert", label: "INSERT" },
  { value: "update", label: "UPDATE" },
  { value: "delete", label: "DELETE" },
] as const;

export function CdcArchitectureExplorer() {
  const [op, setOp] = useState<Op>("insert");
  const p = usePlayer(STAGES.length);
  const walk = eventWalk(op);
  const stage = STAGES[p.step];
  const snap = walk[p.step];
  const reset = () => { setOp("insert"); p.reset(); };
  if (!stage || !snap) return null;

  return (
    <LabShell
      id="lab-cdc-arch" label="Lab" title="CDC architecture explorer" kind="explorer"
      objective="Follow one synthetic row change from MySQL to Elasticsearch and see what each stage owns, how it fails and what limits its scaling."
      assumptions={[
        "Synthetic event with made-up values; nothing here connects to a real MySQL, Debezium, Kafka or Elasticsearch.",
        "Debezium-style envelope (op, before, after) is simplified; real events carry schema, source metadata and timestamps.",
        "A delete is shown as a delete event followed by a tombstone (null value) on the same key, as Debezium emits by default.",
        "Refresh timing (about 1 s) is the Elasticsearch default and is configurable.",
      ]}
      onReset={reset}
      summary={<p>{op.toUpperCase()} event, step {p.step + 1} of {STAGES.length}: <strong>{snap.title}</strong> at {stage.name}. {snap.detail}</p>}
      controls={
        <>
          <Segmented label="Operation on the source row" value={op} options={OPS} onChange={setOp} />
          <div>
            <p className="font-medium mb-1">Event playback</p>
            <div className="flex flex-wrap gap-1">
              <button type="button" className="btn lab-btn" onClick={p.toggle}>{p.playing ? "Pause" : "Play"}</button>
              <button type="button" className="btn lab-btn" onClick={p.next}>Step</button>
            </div>
            <p className="text-[0.78rem] opacity-80 mt-1">{p.reduced ? "Reduced motion is on: Play still only advances one discrete step at a time. " : ""}Playback never starts on its own.</p>
          </div>
        </>
      }
    >
      <ol className="grid gap-1 sm:grid-cols-5" aria-label="Pipeline stages">
        {STAGES.map((s, i) => (
          <li key={s.id}>
            <button type="button" className="btn lab-btn w-full justify-start text-left min-h-11" aria-pressed={i === p.step} aria-current={i === p.step ? "step" : undefined} onClick={() => p.setStep(i)}>
              <span className="num mr-1">{i + 1}.</span>{s.name}{i === p.step ? " ◆" : ""}
            </button>
          </li>
        ))}
      </ol>
      <svg viewBox="0 0 500 36" width="100%" role="img" aria-label={`Event position: stage ${p.step + 1} of ${STAGES.length}, ${stage.name}`} className="mt-2">
        <line x1="25" y1="18" x2="475" y2="18" stroke="var(--muted)" strokeWidth="1" />
        {STAGES.map((s, i) => (
          <g key={s.id}>
            <circle cx={25 + i * 112.5} cy="18" r="6" fill={i <= p.step ? "var(--lab)" : "var(--paper)"} stroke="var(--lab)" strokeWidth="1.5" />
            {i === p.step && <rect x={25 + i * 112.5 - 9} y="9" width="18" height="18" fill="none" stroke="var(--signal)" strokeWidth="2" />}
          </g>
        ))}
      </svg>
      <div className="border border-lab p-3 mt-2">
        <p className="font-semibold">{stage.name} <span className="opacity-70 font-normal">· event: {snap.title}</span></p>
        <p className="num text-[0.82rem] mt-1 break-words">{snap.detail}</p>
        <dl className="mt-3 space-y-2">
          <div><dt className="text-[0.72rem] uppercase tracking-wide opacity-80">Responsibility</dt><dd>{stage.responsibility}</dd></div>
          <div><dt className="text-[0.72rem] uppercase tracking-wide opacity-80" style={{ color: "var(--signal)" }}>Failure mode</dt><dd>{stage.failure}</dd></div>
          <div><dt className="text-[0.72rem] uppercase tracking-wide opacity-80">Scaling constraint</dt><dd>{stage.scaling}</dd></div>
        </dl>
      </div>
    </LabShell>
  );
}
