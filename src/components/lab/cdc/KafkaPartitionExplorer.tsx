"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { Slider } from "../controls";
import { partitionView, remappedKeys } from "@/lib/calc/cdc";

const KEYS = Array.from({ length: 24 }, (_, i) => `order:${1001 + i}`);
const D = { partitions: 4, consumers: 6, prev: 4 };

export function KafkaPartitionExplorer() {
  const [partitions, setPartitions] = useState(D.partitions);
  const [consumers, setConsumers] = useState(D.consumers);
  const [baseline, setBaseline] = useState(D.prev);
  const v = partitionView(KEYS, partitions, consumers);
  const moved = remappedKeys(KEYS, baseline, partitions);
  const reset = () => { setPartitions(D.partitions); setConsumers(D.consumers); setBaseline(D.prev); };
  const rowH = 34;
  const h = Math.max(consumers, 1) * rowH + 8;

  return (
    <LabShell
      id="lab-kafka-part" label="Lab" title="Kafka partition and consumer explorer" kind="explorer"
      objective="See why consumer parallelism is capped by partition count, why ordering holds only per key, and why changing partition count reshuffles keys."
      assumptions={[
        "Key hashing uses FNV-1a (32-bit) as a deterministic stand-in. Real Kafka's default partitioner uses murmur2, so exact key placements differ; the behaviour is the same.",
        "Consumer assignment is simple round-robin; real group assignors (range, sticky, cooperative) differ and rebalance on membership changes.",
        "24 synthetic order keys; one consumer group; ordering is guaranteed only within one partition.",
        "'Baseline partitions' stands for the count the topic had before you changed it.",
      ]}
      onReset={reset}
      summary={
        <p>
          {partitions} partitions, {consumers} consumers: {v.activeConsumers} consumer{v.activeConsumers === 1 ? " is" : "s are"} working
          {v.idleConsumers.length > 0 ? `, ${v.idleConsumers.length} idle (consumers ${v.idleConsumers.map((i) => i + 1).join(", ")}), because parallelism is at most the partition count (${v.parallelism}). ` : ". "}
          Ordering holds per key, not across the topic. Going from {baseline} to {partitions} partitions moves {moved.length} of {KEYS.length} keys to a different partition{moved.length > 0 ? ", so a key's older and newer events can land on different partitions and consumers during the change." : "."}
        </p>
      }
      controls={
        <>
          <Slider label="Partitions" value={partitions} min={1} max={12} onChange={setPartitions} />
          <Slider label="Consumers in group" value={consumers} min={1} max={12} onChange={setConsumers} />
          <Slider label="Baseline partitions (before change)" value={baseline} min={1} max={12} onChange={setBaseline} hint="Compare mapping at this count against the current one." />
        </>
      }
    >
      <svg viewBox={`0 0 520 ${h}`} width="100%" role="img" aria-label={`Consumer to partition assignment: ${v.assignment.map((a, i) => `consumer ${i + 1} reads ${a.length ? "partition " + a.join(", ") : "nothing (idle)"}`).join("; ")}`}>
        {v.assignment.map((parts, ci) => {
          const idle = parts.length === 0;
          const y = 4 + ci * rowH;
          return (
            <g key={ci}>
              <rect x="1" y={y} width="110" height={rowH - 6} fill={idle ? "none" : "var(--lab-soft)"} stroke={idle ? "var(--signal)" : "var(--lab)"} strokeDasharray={idle ? "4 3" : undefined} strokeWidth="1.5" />
              <text x="8" y={y + 18} fontSize="12" fill="var(--ink)">C{ci + 1}{idle ? " IDLE" : ""}</text>
              {parts.map((p, k) => (
                <g key={p}>
                  <line x1="111" y1={y + 14} x2={130 + k * 54} y2={y + 14} stroke="var(--lab)" />
                  <rect x={130 + k * 54} y={y} width="48" height={rowH - 6} fill="var(--paper)" stroke="var(--lab)" strokeWidth="1.5" />
                  <text x={136 + k * 54} y={y + 18} fontSize="12" fill="var(--ink)" fontFamily="var(--font-mono)">P{p}</text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-[0.8rem] num">
          <caption className="text-left font-medium pb-1">Keys per partition at {partitions} partitions (→ = moved vs {baseline} partitions)</caption>
          <thead><tr className="border-b border-lab text-left"><th scope="col" className="pr-3">Partition</th><th scope="col" className="pr-3">Consumer</th><th scope="col">Keys</th></tr></thead>
          <tbody>
            {Array.from({ length: v.partitions }, (_, p) => {
              const ks = KEYS.filter((k) => v.keyToPartition[k] === p);
              const owner = v.assignment.findIndex((a) => a.includes(p));
              return (
                <tr key={p} className="border-b border-lab align-top">
                  <th scope="row" className="pr-3 font-normal">P{p}</th>
                  <td className="pr-3">C{owner + 1}</td>
                  <td className="break-words">{ks.length === 0 ? "none" : ks.map((k) => `${k.slice(6)}${moved.includes(k) ? "→" : ""}`).join(" ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </LabShell>
  );
}
