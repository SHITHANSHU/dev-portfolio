"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { NumberField, Stat, StatGrid } from "../controls";
import { capacity, fmtBitsPerSec, fmtBytesPerSec, type CapacityInput } from "@/lib/calc/cdc";

const DEFAULTS: CapacityInput = { appRps: 1000, writePct: 8, rowsPerWrite: 2, eventsPerRow: 1.5, eventBytes: 1200, indexDocsPerSec: 150, searchQps: 20, docsPerQuery: 2 };
const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "unbounded");

export function CdcCapacityCalculator() {
  const [i, setI] = useState<CapacityInput>(DEFAULTS);
  const set = (k: keyof CapacityInput) => (v: number) => setI((p) => ({ ...p, [k]: v }));
  const r = capacity(i);
  const bytes = fmtBytesPerSec(r.ingressBytesPerSec);
  const bits = fmtBitsPerSec(r.ingressBitsPerSec);
  const over = r.netDocsPerSec < 0;

  return (
    <LabShell
      id="lab-cdc-cap" label="Lab" title="CDC capacity calculator" kind="calculator"
      objective="Turn application request rate into database writes, CDC events, bandwidth and indexing load, and see whether the indexer keeps up."
      assumptions={[
        "Defaults are illustrative, not measurements from any system.",
        "Steady-state averages: no bursts, retries, batching delays or snapshot traffic.",
        "One CDC event becomes one indexing operation (one document write or delete).",
        "Search load reduces indexing capacity by 'docs-equivalent per query' per query/s; this cost is a guess you should replace with a measurement.",
        "Event size is the Kafka message payload; protocol overhead, replication traffic and compression are excluded. Units are decimal (1 kB = 1000 B, 1 Mbit = 1,000,000 bit).",
      ]}
      onReset={() => setI(DEFAULTS)}
      summary={
        <p>
          {fmt(i.appRps)} requests/s produce {fmt(r.cdcEventsPerSec, 1)} CDC events/s ({fmt(r.amplification, 2)} events per request), so 1,000 RPS is not 1,000 CDC events/s:
          only the write share counts, then it is multiplied by rows per write and events per row.
          {" "}Indexing runs at {Number.isFinite(r.utilisation) ? fmt(r.utilisation * 100, 0) + "%" : "unbounded"} utilisation;{" "}
          {over ? `the backlog grows by ${fmt(r.backlogGrowthDocsPerSec, 1)} docs/s, which never recovers without more capacity.` : `there is ${fmt(r.drainDocsPerSec, 1)} docs/s of headroom to drain a backlog.`}
        </p>
      }
      controls={
        <>
          <NumberField label="App requests" unit="req/s" value={i.appRps} min={0} max={1000000} onChange={set("appRps")} />
          <NumberField label="Requests that write" unit="%" value={i.writePct} min={0} max={100} step={0.5} onChange={set("writePct")} />
          <NumberField label="Rows changed per write request" value={i.rowsPerWrite} min={0} max={1000} step={0.5} onChange={set("rowsPerWrite")} />
          <NumberField label="CDC events per row change" value={i.eventsPerRow} min={0} max={100} step={0.5} onChange={set("eventsPerRow")} hint="1 for one table; higher with multi-table writes or extra events per change." />
          <NumberField label="Average event size" unit="bytes" value={i.eventBytes} min={0} max={10000000} step={100} onChange={set("eventBytes")} hint="Before/after images enlarge events." />
          <NumberField label="Indexing capacity" unit="docs/s" value={i.indexDocsPerSec} min={0} max={1000000} step={10} onChange={set("indexDocsPerSec")} />
          <NumberField label="Search read load (optional)" unit="queries/s" value={i.searchQps} min={0} max={1000000} onChange={set("searchQps")} />
          <NumberField label="Indexing cost per query" unit="docs-equiv" value={i.docsPerQuery} min={0} max={1000} step={0.5} onChange={set("docsPerQuery")} hint="Assumption; measure your own." />
        </>
      }
    >
      <StatGrid>
        <Stat label="DB write requests/s" value={fmt(r.writeRequestsPerSec, 1)} note={`${fmt(r.rowChangesPerSec, 1)} row changes/s`} />
        <Stat label="CDC events/s" value={fmt(r.cdcEventsPerSec, 1)} note={`${fmt(r.amplification, 2)} per app request`} />
        <Stat label="Ingress bandwidth" value={bytes.value} unit={bytes.unit} note={`${bits.value} ${bits.unit}`} />
        <Stat label="Indexing demand" value={fmt(r.demandDocsPerSec, 1)} unit="docs/s" />
        <Stat label="Effective capacity" value={fmt(r.effectiveCapacityDocsPerSec, 1)} unit="docs/s" note={i.searchQps > 0 ? "after search load" : undefined} />
        <Stat label="Utilisation" value={Number.isFinite(r.utilisation) ? fmt(r.utilisation * 100, 0) : "∞"} unit="%" note={over ? "OVERLOADED" : "ok"} />
        <Stat label={over ? "Backlog growth" : "Drain rate"} value={fmt(over ? r.backlogGrowthDocsPerSec : r.drainDocsPerSec, 1)} unit="docs/s" />
      </StatGrid>
      <svg viewBox="0 0 400 40" width="100%" role="img" className="mt-4" aria-label={`Utilisation bar: ${Number.isFinite(r.utilisation) ? Math.round(r.utilisation * 100) : "unbounded"} percent of indexing capacity${over ? ", overloaded" : ""}`}>
        <rect x="1" y="8" width="360" height="16" fill="none" stroke="var(--lab)" />
        <rect x="1" y="8" width={Math.min(1, Number.isFinite(r.utilisation) ? r.utilisation : 1) * 360} height="16" fill={over ? "var(--signal)" : "var(--lab)"} />
        {over && <path d="M1 8 L361 24 M1 24 L361 8" stroke="var(--paper)" strokeWidth="1" opacity="0.6" />}
        <text x="1" y="38" fontSize="11" fill="var(--ink)">0%</text>
        <text x="361" y="38" fontSize="11" fill="var(--ink)" textAnchor="end">100% of capacity{over ? " (exceeded)" : ""}</text>
      </svg>
    </LabShell>
  );
}
