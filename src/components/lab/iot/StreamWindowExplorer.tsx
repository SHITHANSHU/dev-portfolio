"use client";
import { useMemo, useState } from "react";
import { LabShell } from "../LabShell";
import { Segmented, Slider, Stat, StatGrid } from "../controls";
import { generateEvents, windowAggregate, type ArrivalPattern, type WindowKind } from "../../../lib/calc/iot";

const D = { kind: "tumbling" as WindowKind, size: 30, hop: 10, gap: 10, grace: 0, pattern: "in-order" as ArrivalPattern };

export function StreamWindowExplorer() {
  const [kind, setKind] = useState<WindowKind>(D.kind);
  const [size, setSize] = useState(D.size);
  const [hop, setHop] = useState(D.hop);
  const [gap, setGap] = useState(D.gap);
  const [grace, setGrace] = useState(D.grace);
  const [pattern, setPattern] = useState<ArrivalPattern>(D.pattern);
  const events = useMemo(() => generateEvents(60, pattern, 3), [pattern]);
  const r = windowAggregate(events, { kind, sizeSec: size, hopSec: hop, gapSec: gap, graceSec: grace });

  return (
    <LabShell
      id="iot-windows" label="Lab 5.D" title="Stream window explorer" kind="explorer"
      objective="See how window type, lateness and grace change which events are counted and which are dropped."
      assumptions={[
        "60 synthetic temperature events; event time is when the sensor measured, arrival time is when the stream processor saw it.",
        "Simplified watermark = the maximum event time seen so far; a window closes once its end + grace <= watermark. Real engines (Kafka Streams, ksqlDB) define this per task and differ in detail.",
        "Events are processed in arrival order; a late event that falls in a closed window is dropped and listed below.",
        "Hopping windows overlap, so one event can count in several windows. Session windows merge events closer than the gap.",
        "No real ksqlDB or Kafka Streams is involved.",
      ]}
      onReset={() => { setKind(D.kind); setSize(D.size); setHop(D.hop); setGap(D.gap); setGrace(D.grace); setPattern(D.pattern); }}
      summary={<p>{kind} windows over 60 events ({pattern}): {r.windows.length} windows, {r.accepted} events counted, {r.dropped.length} dropped as late, {r.reorderedEvents} arrived out of event-time order. Final watermark {r.finalWatermarkSec}s with {grace}s grace.</p>}
      controls={
        <>
          <Segmented label="Window type" value={kind} options={[{ value: "tumbling", label: "Tumbling" }, { value: "hopping", label: "Hopping" }, { value: "session", label: "Session" }]} onChange={setKind} />
          {kind !== "session" && <Slider label="Window size" unit="s" value={size} min={5} max={120} step={5} onChange={(v) => { setSize(v); setHop((h) => Math.min(h, v)); }} />}
          {kind === "hopping" && <Slider label="Hop (advance)" unit="s" value={Math.min(hop, size)} min={1} max={size} onChange={setHop} />}
          {kind === "session" && <Slider label="Inactivity gap" unit="s" value={gap} min={1} max={60} onChange={setGap} />}
          <Slider label="Grace period" unit="s" value={grace} min={0} max={60} onChange={setGrace} />
          <Segmented label="Arrival" value={pattern} options={[{ value: "in-order", label: "In order" }, { value: "out-of-order", label: "Out of order" }, { value: "late", label: "Some very late" }]} onChange={setPattern} />
        </>
      }
    >
      <StatGrid>
        <Stat label="Windows" value={String(r.windows.length)} />
        <Stat label="Counted" value={String(r.accepted)} />
        <Stat label="Dropped late" value={String(r.dropped.length)} />
      </StatGrid>
      <div className="overflow-x-auto mt-3">
        <table className="w-full num text-[0.82rem]">
          <caption className="sr-only">Per-window aggregates</caption>
          <thead><tr className="text-left"><th scope="col">Window [start, end)</th><th scope="col">Count</th><th scope="col">Avg temp (C)</th><th scope="col">Late dropped</th></tr></thead>
          <tbody>{r.windows.map((w) => (
            <tr key={w.startSec} className="border-t border-lab"><td>[{w.startSec}s, {w.endSec}s)</td><td>{w.count}</td><td>{w.avg === null ? "-" : w.avg.toFixed(1)}</td><td>{w.droppedCount}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <h4 className="font-semibold mt-4 text-[0.9rem]">Dropped late events</h4>
      {r.dropped.length === 0 ? <p className="text-[0.85rem] opacity-80">None. Try Some very late with grace 0.</p> : (
        <div className="overflow-x-auto"><table className="w-full num text-[0.8rem]">
          <caption className="sr-only">Events dropped because their window had closed</caption>
          <thead><tr className="text-left"><th scope="col">id</th><th scope="col">event time</th><th scope="col">arrived</th><th scope="col">why</th></tr></thead>
          <tbody>{r.dropped.map((d) => <tr key={d.id} className="border-t border-lab"><td>{d.id}</td><td>{d.eventTimeSec}s</td><td>{d.arrivalTimeSec}s</td><td>{d.reason}</td></tr>)}</tbody>
        </table></div>
      )}
    </LabShell>
  );
}
