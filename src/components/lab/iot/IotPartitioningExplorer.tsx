"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { Segmented, Slider, Stat, StatGrid } from "../controls";
import { HOT_SKEW_RATIO, partitionLoad, type KeyStrategy } from "../../../lib/calc/iot";

const D = { devices: 200, partitions: 8, msgsPerDevice: 20, strategy: "deviceId" as KeyStrategy };

export function IotPartitioningExplorer() {
  const [devices, setDevices] = useState(D.devices);
  const [partitions, setPartitions] = useState(D.partitions);
  const [per, setPer] = useState(D.msgsPerDevice);
  const [strategy, setStrategy] = useState<KeyStrategy>(D.strategy);
  const r = partitionLoad({ devices, partitions, msgsPerDevice: per, strategy, seed: 5 });
  const W = 360, rowH = 18, H = partitions * rowH + 4;

  return (
    <LabShell
      id="iot-partitioning" label="Lab 5.C" title="Partitioning explorer" kind="explorer"
      objective="See how the choice of message key spreads (or concentrates) device traffic across Kafka partitions."
      assumptions={[
        "Synthetic fleet; every device sends the same number of messages. No real Kafka is involved.",
        "Partition = hash(key) mod partitions using FNV-1a as a deterministic stand-in; real Kafka's default partitioner uses murmur2, so exact placement differs.",
        "Random strategy models a null key spread evenly (sticky/round-robin behaviour is simplified).",
        `Region-skewed assigns devices to 5 regions with illustrative weights; a partition is flagged hot when max/mean >= ${HOT_SKEW_RATIO}.`,
      ]}
      onReset={() => { setDevices(D.devices); setPartitions(D.partitions); setPer(D.msgsPerDevice); setStrategy(D.strategy); }}
      summary={<p>{r.total} messages over {partitions} partitions: busiest has {r.max}, mean {r.mean.toFixed(1)}, skew ratio {r.skewRatio.toFixed(2)}. {r.hotPartition === null ? "No hot partition." : `Partition ${r.hotPartition} is hot.`} {r.emptyPartitions} empty. {r.orderingNote}</p>}
      controls={
        <>
          <Segmented label="Key strategy" value={strategy} options={[{ value: "deviceId", label: "deviceId" }, { value: "random", label: "random" }, { value: "constant", label: "constant" }, { value: "region-skewed", label: "region-skewed" }]} onChange={setStrategy} />
          <Slider label="Devices" value={devices} min={1} max={2000} onChange={setDevices} />
          <Slider label="Partitions" value={partitions} min={1} max={32} onChange={setPartitions} />
          <Slider label="Messages per device" value={per} min={1} max={100} onChange={setPer} />
        </>
      }
    >
      <StatGrid>
        <Stat label="Skew ratio" value={r.skewRatio.toFixed(2)} note="max / mean" />
        <Stat label="Hot partition" value={r.hotPartition === null ? "none" : `P${r.hotPartition}`} />
        <Stat label="Empty partitions" value={String(r.emptyPartitions)} />
        <Stat label="Distinct keys" value={String(r.distinctKeys)} />
      </StatGrid>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Messages per partition; skew ratio ${r.skewRatio.toFixed(2)}`} className="mt-3">
        {r.counts.map((c, i) => {
          const hot = r.hotPartition === i;
          return (
            <g key={i} transform={`translate(0 ${i * rowH + 2})`}>
              <text x="0" y="11" fontSize="10" fill="currentColor">P{i}</text>
              <rect x="28" y="1" width={Math.max(0, (c / Math.max(1, r.max)) * (W - 90))} height="12" fill={hot ? "var(--signal)" : "var(--lab)"} stroke={hot ? "var(--ink)" : "none"} strokeDasharray={hot ? "3 2" : undefined} />
              <text x={W - 58} y="11" fontSize="10" fill="currentColor">{c}{hot ? " HOT" : ""}</text>
            </g>
          );
        })}
      </svg>
      <details className="mt-2"><summary className="cursor-pointer min-h-8">Table of counts</summary>
        <div className="overflow-x-auto"><table className="num text-[0.82rem]"><caption className="sr-only">Messages per partition</caption>
          <thead><tr><th scope="col">Partition</th><th scope="col">Messages</th></tr></thead>
          <tbody>{r.counts.map((c, i) => <tr key={i}><th scope="row">P{i}</th><td>{c}</td></tr>)}</tbody></table></div>
      </details>
    </LabShell>
  );
}
