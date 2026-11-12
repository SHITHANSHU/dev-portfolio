"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { NumberField, Segmented, Slider, Stat, StatGrid } from "../controls";
import { bandwidthStorage, type Schedule } from "@/lib/calc/camera";

type S = { cameras: number; rate: number; unit: "kbit" | "Mbit"; schedule: Schedule; hours: number; duty: number; days: number; overhead: number };
const D: S = { cameras: 16, rate: 4, unit: "Mbit", schedule: "continuous", hours: 10, duty: 30, days: 30, overhead: 15 };

export function BandwidthStorageCalculator() {
  const [s, setS] = useState<S>(D);
  const set = <K extends keyof S>(k: K, v: S[K]) => setS((p) => ({ ...p, [k]: v }));
  const kbps = s.unit === "Mbit" ? s.rate * 1000 : s.rate;
  const r = bandwidthStorage({ cameras: s.cameras, bitrateKbps: kbps, schedule: s.schedule, businessHoursPerDay: s.hours, motionDutyPct: s.duty, retentionDays: s.days, overheadPct: s.overhead });
  const bar = (pct: number) => (
    <div className="h-3 border border-lab" aria-hidden="true"><div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: pct > 70 ? "var(--signal)" : "var(--lab)" }} /></div>
  );

  return (
    <LabShell
      id="lab-camera-storage" label="Lab 3.B" title="Bandwidth and storage calculator" kind="calculator"
      objective="Size network links and disks from camera count, bitrate, schedule and retention, with every bit-to-byte step visible."
      assumptions={[
        "Estimate only. Every camera has the same average bitrate; real VBR streams fluctuate with the scene.",
        "Bitrate is the main storage input; resolution x fps only matters through the bitrate the encoder actually produces.",
        "Decimal units: 1 kbit = 1000 bit, 1 GB = 10^9 B, 1 TB = 10^12 B. TiB (2^40 B) shown for comparison with how disks and OSes often report.",
        "Link utilisation uses live aggregate bitrate (cameras stream whatever the recording schedule) against nominal 100 Mbit/s and 1 Gbit/s; protocol overhead and other traffic not included.",
        "Overhead % covers container/index metadata and redundancy you choose (e.g. mirroring ~100%); it multiplies storage only, not bandwidth.",
        "Motion duty cycle is a user-supplied fraction of the day with activity; no pre/post-event buffer modelled.",
      ]}
      onReset={() => setS(D)}
      summary={
        <p>
          {r.cameras} cameras at {kbps.toLocaleString("en-US")} kbit/s ({s.schedule}, {(r.duty * 100).toFixed(0)}% duty) produce {r.aggregateMbps.toFixed(1)} Mbit/s live,
          using {r.util100MPct.toFixed(0)}% of a 100M link or {r.util1GPct.toFixed(1)}% of 1G. Storage is {r.gbPerDay.toFixed(0)} GB/day; over {s.days} days that is {r.tbRetention.toFixed(2)} TB ({r.tibRetention.toFixed(2)} TiB).
        </p>
      }
      controls={<>
        <NumberField label="Cameras" value={s.cameras} min={0} max={1000} onChange={(v) => set("cameras", Math.round(v))} />
        <Segmented label="Bitrate unit" value={s.unit} options={[{ value: "kbit", label: "kbit/s" }, { value: "Mbit", label: "Mbit/s" }]}
          onChange={(u) => setS((p) => ({ ...p, unit: u, rate: u === "Mbit" ? p.rate / 1000 : p.rate * 1000 }))} />
        <NumberField label="Bitrate per camera" unit={`${s.unit}/s`} value={s.rate} min={0} max={s.unit === "Mbit" ? 100 : 100000} step={s.unit === "Mbit" ? 0.25 : 100} onChange={(v) => set("rate", v)} />
        <Segmented label="Recording schedule" value={s.schedule} options={[{ value: "continuous", label: "Continuous" }, { value: "business", label: "Business hours" }, { value: "motion", label: "Motion" }]} onChange={(v) => set("schedule", v)} />
        {s.schedule === "business" && <Slider label="Recorded hours per day" unit="h" value={s.hours} min={1} max={24} onChange={(v) => set("hours", v)} />}
        {s.schedule === "motion" && <Slider label="Motion duty cycle" unit="%" value={s.duty} min={1} max={100} onChange={(v) => set("duty", v)} />}
        <Slider label="Retention" unit="days" value={s.days} min={1} max={180} onChange={(v) => set("days", v)} />
        <Slider label="Redundancy / overhead" unit="%" value={s.overhead} min={0} max={100} onChange={(v) => set("overhead", v)} />
      </>}
    >
      <StatGrid>
        <Stat label="Aggregate bandwidth" value={r.aggregateMbps.toFixed(1)} unit="Mbit/s" note="all cameras, live" />
        <Stat label="Storage per day" value={r.gbPerDay.toFixed(0)} unit="GB" note={`${r.tbPerDay.toFixed(3)} TB`} />
        <Stat label={`Total ${s.days}-day retention`} value={r.tbRetention.toFixed(2)} unit="TB" note={`${r.tibRetention.toFixed(2)} TiB`} />
      </StatGrid>
      <div className="mt-4 space-y-2">
        <div><p>Link utilisation, 100 Mbit/s: <span className="num">{r.util100MPct.toFixed(0)}%</span>{r.util100MPct > 70 ? " (above ~70%: little headroom)" : ""}</p>{bar(r.util100MPct)}</div>
        <div><p>Link utilisation, 1 Gbit/s: <span className="num">{r.util1GPct.toFixed(1)}%</span></p>{bar(r.util1GPct)}</div>
      </div>
      <div className="mt-4">
        <p className="font-medium">Step by step (bits vs bytes)</p>
        <ol className="mt-1 list-decimal pl-5 space-y-1 num text-[0.8rem]">{r.steps.map((t) => <li key={t}>{t}</li>)}</ol>
      </div>
    </LabShell>
  );
}
