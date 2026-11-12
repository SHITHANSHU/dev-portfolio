"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { Segmented, Slider, Stat, StatGrid } from "../controls";
import { SPIKE_MULT, BATCH_HALF, simulateBacklog, workerDocsPerSec, type Scenario } from "@/lib/calc/cdc";

const D = { arrival: 400, peak: 500, batch: 100, workers: 2, scenario: "outage" as Scenario };
const SCEN = [
  { value: "steady", label: "Steady" },
  { value: "spike", label: `Spike ×${SPIKE_MULT} (3 min)` },
  { value: "outage", label: "Consumer outage (5 min)" },
] as const;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const dur = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 120 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`);

export function IndexingBacklogSimulator() {
  const [arrival, setArrival] = useState(D.arrival);
  const [peak, setPeak] = useState(D.peak);
  const [batch, setBatch] = useState(D.batch);
  const [workers, setWorkers] = useState(D.workers);
  const [scenario, setScenario] = useState<Scenario>(D.scenario);
  const r = simulateBacklog({ arrivalDocsPerSec: arrival, peakPerWorker: peak, batchSize: batch, workers, scenario });
  const perWorker = workerDocsPerSec(peak, batch);
  const W = 560, H = 200, L = 52, B = 26, T = 8;
  const n = r.backlog.length;
  const ymax = Math.max(1, r.peak);
  const x = (t: number) => L + (t / (n - 1)) * (W - L - 6);
  const y = (v: number) => H - B - (v / ymax) * (H - B - T);
  const pts = r.backlog.filter((_, t) => t % 5 === 0 || t === n - 1).map((v, k, a) => { const t = k === a.length - 1 ? n - 1 : k * 5; return `${x(t).toFixed(1)},${y(v).toFixed(1)}`; }).join(" ");
  const growing = r.steadyGrowthDocsPerSec > 0;
  const drainText = scenario === "steady" ? (growing ? "" : "no backlog builds") : r.drainSecAfterEvent === null ? "does not drain within the window" : `drains ${dur(r.drainSecAfterEvent)} after the event ends`;

  return (
    <LabShell
      id="lab-idx-backlog" label="Lab" title="Indexing backlog simulator" kind="simulation"
      objective="See how arrival rate, worker count and batch size decide whether a spike or outage is absorbed, drained slowly, or never recovered."
      assumptions={[
        `ASSUMPTION: per-worker throughput = peak × b / (b + ${BATCH_HALF}) docs/s for batch size b. Bigger batches amortise request overhead with diminishing returns; ${BATCH_HALF} is an illustrative half-saturation point, not a measurement.`,
        "Workers scale linearly (no partition cap, no shared-resource contention, no bulk rejections).",
        "One-second ticks, deterministic: event starts at t = 300 s of a 30 minute window; no random jitter.",
        "Outage means zero indexing while events keep arriving; recovery runs at full capacity. Defaults are illustrative.",
      ]}
      onReset={() => { setArrival(D.arrival); setPeak(D.peak); setBatch(D.batch); setWorkers(D.workers); setScenario(D.scenario); }}
      summary={
        <p>
          Capacity is {fmt(r.capacityDocsPerSec)} docs/s ({workers} × {fmt(perWorker)}) against {fmt(arrival)} docs/s arriving.
          {" "}Peak backlog {fmt(r.peak)} docs at {dur(r.peakAtSec)}; {drainText}.
          {growing ? ` Baseline load exceeds capacity: backlog grows ${fmt(r.steadyGrowthDocsPerSec)} docs/s indefinitely.` : ""}
        </p>
      }
      controls={
        <>
          <Segmented label="Scenario" value={scenario} options={SCEN} onChange={setScenario} />
          <Slider label="Arrival rate" unit="docs/s" value={arrival} min={50} max={2000} step={50} onChange={setArrival} />
          <Slider label="Peak throughput per worker" unit="docs/s" value={peak} min={100} max={2000} step={50} onChange={setPeak} />
          <Slider label="Batch size" unit="docs" value={batch} min={1} max={1000} onChange={setBatch} hint={`Effective ${fmt(perWorker)} docs/s per worker.`} />
          <Slider label="Workers" value={workers} min={0} max={16} onChange={setWorkers} />
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Backlog over 30 minutes. Peak ${fmt(r.peak)} documents at ${dur(r.peakAtSec)}; ends at ${fmt(r.finalBacklog)}.`}>
        {r.eventEndSec > r.eventStartSec && <rect x={x(r.eventStartSec)} y={T} width={x(r.eventEndSec) - x(r.eventStartSec)} height={H - B - T} fill="var(--signal)" opacity="0.12" />}
        <line x1={L} y1={H - B} x2={W - 6} y2={H - B} stroke="var(--muted)" />
        <line x1={L} y1={T} x2={L} y2={H - B} stroke="var(--muted)" />
        <polyline points={pts} fill="none" stroke="var(--signal)" strokeWidth="2" />
        <text x={L - 4} y={T + 8} fontSize="11" textAnchor="end" fill="var(--ink)">{fmt(ymax)}</text>
        <text x={L - 4} y={H - B} fontSize="11" textAnchor="end" fill="var(--ink)">0</text>
        <text x={L} y={H - 8} fontSize="11" fill="var(--ink)">0 s</text>
        <text x={W - 6} y={H - 8} fontSize="11" textAnchor="end" fill="var(--ink)">{n} s</text>
        {r.eventEndSec > r.eventStartSec && <text x={x(r.eventStartSec) + 3} y={T + 12} fontSize="11" fill="var(--ink)">{scenario === "outage" ? "outage" : "spike"}</text>}
        <text x={W - 8} y={T + 12} fontSize="11" textAnchor="end" fill="var(--ink)">backlog (docs) vs time</text>
      </svg>
      <StatGrid>
        <Stat label="Capacity" value={fmt(r.capacityDocsPerSec)} unit="docs/s" />
        <Stat label="Peak backlog" value={fmt(r.peak)} unit="docs" />
        <Stat label={growing ? "Baseline growth" : "Time to drain"} value={growing ? fmt(r.steadyGrowthDocsPerSec) : r.drainSecAfterEvent === null ? (scenario === "steady" ? "none" : "never") : dur(r.drainSecAfterEvent)} unit={growing ? "docs/s" : undefined} />
      </StatGrid>
    </LabShell>
  );
}
