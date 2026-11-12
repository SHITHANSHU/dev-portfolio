"use client";
import { useMemo, useState } from "react";
import { LabShell } from "../LabShell";
import { NumberField, Segmented, Slider, Stat, StatGrid } from "../controls";
import { MONGO_PRESETS, buildDataset, explainQuery, formatBytesDecimal, storageEstimate, type IndexChoice } from "../../../lib/calc/iot";

const D = { preset: "latest", index: "none" as IndexChoice, devices: 50, readings: 200, days: 30, rate: 1 / 60 };

export function MongoDataExplorer() {
  const [preset, setPreset] = useState(D.preset);
  const [index, setIndex] = useState<IndexChoice>(D.index);
  const [devices, setDevices] = useState(D.devices);
  const [readings, setReadings] = useState(D.readings);
  const [days, setDays] = useState(D.days);
  const [rate, setRate] = useState(D.rate);
  const ds = useMemo(() => buildDataset(devices, readings, 60), [devices, readings]);
  const p = MONGO_PRESETS.find((x) => x.id === preset) ?? MONGO_PRESETS[0];
  const q = p?.build(ds);
  const ex = q ? explainQuery(ds, q, index) : null;
  const total = ds.deviceId.length;
  const st = storageEstimate({ devices: 10000, readingsPerDevicePerSec: rate, retentionDays: days, docBytes: 150, indexEntryBytes: 40, bucketedBytesPerReading: 20, bucketSec: 3600 });
  const maxB = Math.max(1, st.perReadingTotalBytes, st.bucketedTotalBytes);

  return (
    <LabShell
      id="iot-mongo" label="Lab 5.E" title="MongoDB-style data explorer" kind="explorer"
      objective="Understand how an index or time-series bucketing changes documents examined versus returned, and what retention costs in storage."
      assumptions={[
        "A labelled model on synthetic readings, not a real MongoDB server: nothing is stored or queried remotely, and numbers are not benchmarks.",
        "Docs examined: COLLSCAN reads every document; a {deviceId, ts} index reads only matching keys; the bucket model reads whole (device, hour) bucket documents.",
        "The {deviceId, ts} index cannot give tight bounds to a query without deviceId, so it falls back to a collection scan.",
        "Storage uses assumed sizes (150 B per document, 40 B per index entry, 20 B per reading in a bucket) for 10,000 devices; all illustrative. Decimal units: 1 GB = 1,000,000,000 B.",
      ]}
      onReset={() => { setPreset(D.preset); setIndex(D.index); setDevices(D.devices); setReadings(D.readings); setDays(D.days); setRate(D.rate); }}
      summary={ex && <p>Query &ldquo;{p?.label}&rdquo; on {total.toLocaleString("en-US")} synthetic readings with {index === "none" ? "no index" : index === "device-ts" ? "a {deviceId, ts} index" : "time-series buckets"}: {ex.stage} examined {ex.docsExamined.toLocaleString("en-US")} {ex.unit} to return {ex.nReturned} {q?.op === "aggregate" ? "group(s)" : "document(s)"} ({ex.matchingReadings} matching readings). Retention {days} days at 10,000 devices: about {formatBytesDecimal(st.perReadingTotalBytes)} as one document per reading versus {formatBytesDecimal(st.bucketedTotalBytes)} bucketed (model).</p>}
      controls={
        <>
          <Segmented label="Query preset" value={preset} options={MONGO_PRESETS.map((x) => ({ value: x.id, label: x.label }))} onChange={setPreset} />
          <Segmented label="Index choice" value={index} options={[{ value: "none", label: "None" }, { value: "device-ts", label: "Compound deviceId+ts" }, { value: "bucket", label: "Time-series bucket" }]} onChange={setIndex} />
          <Slider label="Devices" value={devices} min={1} max={100} onChange={setDevices} />
          <Slider label="Readings per device" value={readings} min={10} max={1000} step={10} onChange={setReadings} />
          <NumberField label="Retention" unit="days" value={days} min={1} max={3650} onChange={setDays} />
          <Slider label="Reading rate per device" unit="/s" value={rate} min={0.01} max={1} step={0.01} onChange={setRate} format={(v) => v.toFixed(2)} />
        </>
      }
    >
      {ex && q && (
        <>
          <p className="font-mono text-[0.8rem] num">{q.op === "aggregate" ? "db.readings.aggregate" : "db.readings.find"}({`{ ${q.deviceId === null ? "" : `deviceId: ${q.deviceId}, `}ts: [${q.fromSec}, ${q.toSec}) }`}){q.limit ? `.sort({ ts: -1 }).limit(${q.limit})` : ""}</p>
          <StatGrid>
            <Stat label="Plan stage" value={ex.stage} />
            <Stat label="Docs examined" value={ex.docsExamined.toLocaleString("en-US")} note={ex.unit} />
            <Stat label="Returned" value={String(ex.nReturned)} />
            <Stat label="Keys examined" value={String(ex.keysExamined)} />
            <Stat label="In-memory sort" value={ex.inMemorySort ? "yes" : "no"} />
          </StatGrid>
          <p className="text-[0.85rem] mt-2">{ex.note}</p>
          <svg viewBox="0 0 300 40" width="100%" role="img" aria-label={`Examined ${ex.docsExamined} of ${total}; returned ${ex.nReturned}`} className="mt-2">
            <rect x="0" y="2" width="300" height="14" fill="none" stroke="var(--muted)" />
            <rect x="0" y="2" width={Math.min(300, (ex.docsExamined / total) * 300)} height="14" fill="var(--lab)" />
            <rect x="0" y="22" width="300" height="14" fill="none" stroke="var(--muted)" />
            <rect x="0" y="22" width={Math.max(1, Math.min(300, (ex.nReturned / total) * 300))} height="14" fill="var(--signal)" />
          </svg>
          <p className="text-[0.75rem] opacity-80">Top bar: examined. Bottom bar: returned. Both relative to {total.toLocaleString("en-US")} readings.</p>
        </>
      )}
      <h4 className="font-semibold mt-4 text-[0.9rem]">Retention storage estimate (model, 10,000 devices)</h4>
      <div className="overflow-x-auto">
        <table className="w-full num text-[0.82rem]">
          <caption className="sr-only">Storage estimate, decimal units</caption>
          <thead><tr className="text-left"><th scope="col">Layout</th><th scope="col">Data</th><th scope="col">Index</th><th scope="col">Total</th></tr></thead>
          <tbody>
            <tr className="border-t border-lab"><th scope="row" className="text-left">One document per reading</th><td>{formatBytesDecimal(st.perReadingBytes)}</td><td>{formatBytesDecimal(st.perReadingIndexBytes)}</td><td>{formatBytesDecimal(st.perReadingTotalBytes)}</td></tr>
            <tr className="border-t border-lab"><th scope="row" className="text-left">Hourly buckets</th><td>{formatBytesDecimal(st.bucketedBytes)}</td><td>{formatBytesDecimal(st.bucketedIndexBytes)}</td><td>{formatBytesDecimal(st.bucketedTotalBytes)}</td></tr>
          </tbody>
        </table>
      </div>
      <svg viewBox="0 0 300 30" width="100%" role="img" aria-label={`Per-reading total ${formatBytesDecimal(st.perReadingTotalBytes)}, bucketed ${formatBytesDecimal(st.bucketedTotalBytes)}`}>
        <rect x="0" y="2" width={(st.perReadingTotalBytes / maxB) * 300} height="11" fill="var(--lab)" />
        <rect x="0" y="17" width={Math.max(1, (st.bucketedTotalBytes / maxB) * 300)} height="11" fill="none" stroke="var(--ink)" strokeDasharray="4 2" />
      </svg>
    </LabShell>
  );
}
