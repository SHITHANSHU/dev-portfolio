"use client";
import { useReducedMotion } from "../useReducedMotion";
import { useEffect, useState } from "react";
import { LabShell } from "../LabShell";
import { Slider, Stat, StatGrid } from "../controls";
import {
  DEFAULT_PIPELINE, PIPELINE_STAGES, bottleneckStage, initPipeline, msgPayloadJson, normalizePipelineConfig, stepPipeline,
  type PipelineConfig, type PipelineState,
} from "../../../lib/calc/iot";

const fresh = (c: PipelineConfig) => initPipeline(normalizePipelineConfig(c).seed);

export function IotPipelineSimulator() {
  const [cfg, setCfg] = useState<PipelineConfig>(DEFAULT_PIPELINE);
  const [sim, setSim] = useState<PipelineState>(() => fresh(DEFAULT_PIPELINE));
  const [playing, setPlaying] = useState(false);
  const reduced = useReducedMotion();
  const [inspect, setInspect] = useState(4);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setSim((s) => stepPipeline(s, cfg)), 600);
    return () => window.clearInterval(id);
  }, [playing, cfg]);

  const set = (patch: Partial<PipelineConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    setSim(fresh(next)); // a config change restarts the run so counters stay comparable
    setPlaying(false);
  };
  const reset = () => { setCfg(DEFAULT_PIPELINE); setSim(fresh(DEFAULT_PIPELINE)); setPlaying(false); setInspect(4); };

  const n = normalizePipelineConfig(cfg);
  const bn = bottleneckStage(sim, cfg);
  const stored = sim.counters[4]?.processed ?? 0;
  const inflight = sim.queues.reduce((a, q) => a + q.length, 0);
  const meanLat = stored > 0 ? sim.latencySumTicks / stored : 0;
  const offered = n.devices * n.msgsPerDevicePerSec;
  const maxQ = Math.max(1, ...sim.queues.map((q) => q.length));
  const recent = sim.recent[inspect] ?? [];

  return (
    <LabShell
      id="iot-pipeline" label="Lab 5.A" title="IoT pipeline simulator" kind="simulation"
      objective="See where messages pile up when devices publish faster than the slowest stage can drain."
      assumptions={[
        "Synthetic devices publish temperature readings; seeded, so a run is repeatable. Nothing connects to a real broker, Kafka, ksqlDB or MongoDB.",
        "One tick = 1 simulated second. A message moves at most one stage per tick; stage capacities are per-second message counts (illustrative defaults).",
        "Broker and Kafka are assumed not to be bottlenecks (5000 msg/s); queues are bounded at 20000 and drop at the broker when full.",
        "About 3% of readings are faulty and filtered by the ksqlDB-style stage; readings above 85 C count as alerts.",
        "Payload size is carried on each message but does not slow any stage in this model.",
        "Changing a setting restarts the run. Nothing plays automatically.",
      ]}
      onReset={reset}
      summary={
        <p>
          Tick {sim.tick}: offering {offered.toFixed(1)} msg/s, {stored} stored, {inflight} in flight.{" "}
          {bn === null ? "No stage has a growing backlog." : `Backlog is building at "${PIPELINE_STAGES[bn]}" (${sim.queues[bn]?.length ?? 0} waiting).`}
          {" "}Payload {n.payloadBytes} B means about {((offered * n.payloadBytes) / 1000).toFixed(1)} kB/s offered (decimal).
        </p>
      }
      controls={
        <>
          <Slider label="Devices" value={cfg.devices} min={1} max={200} onChange={(v) => set({ devices: v })} />
          <Slider label="Rate per device" unit="msg/s" value={cfg.msgsPerDevicePerSec} min={0.1} max={5} step={0.1} onChange={(v) => set({ msgsPerDevicePerSec: v })} />
          <Slider label="Payload size" unit="B" value={cfg.payloadBytes} min={16} max={2000} step={16} onChange={(v) => set({ payloadBytes: v })} />
          <Slider label="Bridge capacity" unit="msg/s" value={cfg.bridgeCapPerSec} min={1} max={500} onChange={(v) => set({ bridgeCapPerSec: v })} />
          <Slider label="Stream capacity" unit="msg/s" value={cfg.ksqlCapPerSec} min={1} max={500} onChange={(v) => set({ ksqlCapPerSec: v })} />
          <Slider label="Store capacity" unit="msg/s" value={cfg.storeCapPerSec} min={1} max={500} onChange={(v) => set({ storeCapPerSec: v })} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn lab-btn" onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "Start"}</button>
            <button type="button" className="btn lab-btn" onClick={() => { setPlaying(false); setSim((s) => stepPipeline(s, cfg)); }}>Step</button>
            <button type="button" className="btn lab-btn" onClick={() => { setPlaying(false); setSim((s) => { let x = s; for (let i = 0; i < 10; i++) x = stepPipeline(x, cfg); return x; }); }}>Step x10</button>
          </div>
          {reduced && <p className="text-[0.78rem] opacity-80">Reduced motion is on: use Step instead of Start for a calmer view.</p>}
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full num text-[0.85rem]">
          <caption className="sr-only">Per-stage counters and queue depth</caption>
          <thead><tr className="text-left"><th scope="col">Stage</th><th scope="col">Received</th><th scope="col">Processed</th><th scope="col">Dropped</th><th scope="col">Filtered</th><th scope="col">Waiting</th><th scope="col"><span className="sr-only">Backlog bar</span></th></tr></thead>
          <tbody>
            {PIPELINE_STAGES.map((name, i) => {
              const c = sim.counters[i];
              const q = sim.queues[i]?.length ?? 0;
              return (
                <tr key={name} className="border-t border-lab">
                  <th scope="row" className="text-left font-medium">{name}{bn === i ? " (bottleneck)" : ""}</th>
                  <td>{c?.received ?? 0}</td><td>{c?.processed ?? 0}</td><td>{c?.dropped ?? 0}</td><td>{c?.filtered ?? 0}</td><td>{q}</td>
                  <td className="w-24">
                    <svg viewBox="0 0 100 10" width="100%" height="10" role="img" aria-label={`${name} backlog ${q}`}>
                      <rect x="0" y="0" width="100" height="10" fill="none" stroke="var(--muted)" strokeWidth="0.5" />
                      <rect x="0" y="0" width={(q / maxQ) * 100} height="10" fill={bn === i ? "var(--signal)" : "var(--lab)"} />
                    </svg>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <StatGrid>
        <Stat label="Alerts (> 85 C)" value={String(sim.alerts)} />
        <Stat label="Mean end-to-end" value={meanLat.toFixed(1)} unit="s" note="simulated" />
        <Stat label="Offered" value={offered.toFixed(1)} unit="msg/s" />
      </StatGrid>
      <fieldset className="mt-4">
        <legend className="font-medium mb-1">Inspect messages last finished by</legend>
        <div className="flex flex-wrap gap-1">
          {PIPELINE_STAGES.map((name, i) => (
            <button key={name} type="button" className="btn lab-btn" aria-pressed={inspect === i} onClick={() => setInspect(i)}>{name}</button>
          ))}
        </div>
      </fieldset>
      <div className="overflow-x-auto mt-2">
        {recent.length === 0 ? <p className="text-[0.85rem] opacity-80">No messages have passed this stage yet. Press Step.</p> : (
          <table className="w-full num text-[0.8rem]">
            <caption className="sr-only">Recent messages at the selected stage</caption>
            <thead><tr className="text-left"><th scope="col">id</th><th scope="col">created</th><th scope="col">payload (JSON)</th><th scope="col">stage ticks</th></tr></thead>
            <tbody>{recent.map((m) => (
              <tr key={m.id} className="border-t border-lab"><td>{m.id}</td><td>t={m.createdTick}</td><td>{msgPayloadJson(m)}</td><td>{m.trail.map((t, i) => `${i}:${t}`).join(" ")}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </LabShell>
  );
}
