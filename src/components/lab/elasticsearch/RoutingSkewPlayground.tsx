"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { Segmented, Slider, Stat, StatGrid } from "../controls";
import { usePlayer } from "../cdc/usePlayer";
import {
  NODES, ROUTING_DEFAULTS, ROUTING_TICKS, describeTick, effectivePartition, shardNode, shardsSearchedForTenant, simulateRouting, tenantName,
  type RoutingMode,
} from "@/lib/calc/elasticsearch";

const D = ROUTING_DEFAULTS;
const MODES = [
  { value: "id", label: "_id (default)" },
  { value: "tenant", label: "tenant_id" },
  { value: "partition", label: "tenant_id + partition" },
] as const;
const PRIMARIES = [
  { value: 3, label: "3" },
  { value: 6, label: "6" },
  { value: 12, label: "12" },
] as const;

const W = 520, ROW = 74, BAR_X = 170, BAR_W = 280;
const BULK = { x: 8, y: 92 };

export function RoutingSkewPlayground() {
  const [mode, setMode] = useState<RoutingMode>(D.mode);
  const [partition, setPartition] = useState(D.partitionSize);
  const [skew, setSkew] = useState(D.skew);
  const [capacity, setCapacity] = useState(D.nodeCapacityPerTick);
  const [primaries, setPrimaries] = useState(D.primaries);
  const player = usePlayer(ROUTING_TICKS + 1, 700);

  const params = { mode, partitionSize: partition, skew, nodeCapacityPerTick: capacity, primaries };
  const s = simulateRouting(params, player.step);
  const final = simulateRouting(params, ROUTING_TICKS);
  const scale = Math.max(1, ...final.routed);
  const p = effectivePartition(partition, primaries);
  const searched = shardsSearchedForTenant(mode, primaries, partition);
  const searchedText = mode === "tenant" ? "1 shard" : mode === "partition" ? `${searched} shards` : `all ${primaries} shards`;
  const hot = s.tick > 0 ? s.hotShard : -1;
  const lastEvent = s.events[s.events.length - 1];
  const H = ROW * NODES + 6;
  const reset = () => { player.reset(); setMode(D.mode); setPartition(D.partitionSize); setSkew(D.skew); setCapacity(D.nodeCapacityPerTick); setPrimaries(D.primaries); };

  // Dot slot within its shard this tick, for placement.
  const seen: Record<number, number> = {};
  const dots = s.lastBatch.map((d) => {
    const j = seen[d.shard] ?? 0;
    seen[d.shard] = j + 1;
    return { ...d, j };
  });
  const barY = (shard: number) => 8 + shardNode(shard) * ROW + 22 + Math.floor(shard / NODES) * 15;
  const modeText = mode === "id" ? "Default routing hashes the document id, so documents spread almost evenly" : mode === "tenant" ? "Routing by tenant puts every document of a tenant on one shard, so the biggest tenant sets the hot shard" : `Routing partitions spread each tenant over ${p} shards, trading a flatter write load for ${p}-shard searches`;

  return (
    <LabShell
      id="lab-es-routing" label="Lab 2" title="Routing and hot-shard playground" kind="simulation"
      objective="Index a skewed multi-tenant stream with default _id routing, tenant routing or routing partitions, and watch which shard and node become hot and how many shards a tenant search touches."
      assumptions={[
        `${primaries} primaries on ${NODES} data nodes, placed round-robin (shard n on node n mod ${NODES}). Replicas are omitted; in real clusters every replica repeats the indexing work on another node.`,
        "12 synthetic tenants with Zipf-shaped sizes (the skew slider is the exponent; 0 is uniform). 24 documents arrive per tick from a seeded generator, so a run is repeatable.",
        "Each node accepts at most the write capacity per tick; the rest are rejected as HTTP 429 and not indexed. The queue is not carried between ticks and clients do not retry.",
        "The hash is FNV-1a, a stand-in for Elasticsearch's murmur3. The shard formula uses a routing factor of 1 (number_of_routing_shards equal to the primary count). Partition sizes are limited to between 2 and primaries - 1.",
        "Skew ratio is the busiest shard's routed documents divided by the mean over all shards. Real hot shards also come from expensive queries and uneven allocation, which this lab does not model.",
        "Forty ticks maximum. Synthetic data only; no connection to a real cluster.",
      ]}
      onReset={reset}
      summary={
        <p>
          Tick {s.tick} of {ROUTING_TICKS}. {modeText}.
          {" "}{s.tick === 0 ? "Press Step or Play to start indexing." : `Busiest shard is ${s.hotShard} at ${s.skewRatio.toFixed(2)} times the mean; ${s.rejectedTotal} documents rejected so far${s.rejectedTotal ? ` (node ${s.rejectedByNode.indexOf(Math.max(...s.rejectedByNode)) + 1} the most)` : ""}.`}
          {" "}A search for the biggest tenant touches {searchedText}; an unrouted search touches all {primaries}.
        </p>
      }
      controls={
        <>
          <Segmented label="Routing" value={mode} options={MODES} onChange={setMode} />
          {mode === "partition" ? <Slider label="routing_partition_size" value={partition} min={2} max={5} onChange={setPartition} hint={p !== partition ? `Capped at ${p}: must be below the primary count.` : undefined} /> : <p className="text-[0.78rem] opacity-80">routing_partition_size applies in the partition mode only.</p>}
          <Slider label="Tenant skew (Zipf exponent)" value={skew} min={0} max={2} step={0.1} onChange={setSkew} format={(x) => x.toFixed(1)} />
          <Slider label="Node write capacity" unit="docs / tick" value={capacity} min={6} max={24} onChange={setCapacity} />
          <Segmented label="Primaries (3 nodes)" value={primaries} options={PRIMARIES} onChange={setPrimaries} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn lab-btn" onClick={player.toggle}>{player.playing ? "Pause" : "Play"}</button>
            <button type="button" className="btn lab-btn" onClick={player.next} disabled={player.step >= ROUTING_TICKS}>Step</button>
            <button type="button" className="btn lab-btn" onClick={player.reset}>Rewind</button>
          </div>
          <p className="text-[0.78rem] opacity-80">Play runs at most {ROUTING_TICKS} ticks and never starts by itself.{player.reduced ? " Reduced motion is on: dots jump instead of gliding." : ""}</p>
        </>
      }
    >
      <div className="space-y-4">
        <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Routing diagram, scrolls sideways on narrow screens">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ minWidth: 460 }} aria-label={`Tick ${s.tick}. ${primaries} shards on ${NODES} nodes. Busiest shard ${s.tick ? s.hotShard : "none yet"}, skew ${s.skewRatio.toFixed(2)}. ${s.rejectedTotal} documents rejected.`}>
          <rect x={BULK.x} y={BULK.y} width="64" height="34" fill="var(--paper-2)" stroke="var(--ink)" />
          <text x={BULK.x + 32} y={BULK.y + 15} fontSize="12" textAnchor="middle" fill="var(--ink)">_bulk</text>
          <text x={BULK.x + 32} y={BULK.y + 28} fontSize="10" textAnchor="middle" fill="var(--muted)">24 / tick</text>
          {Array.from({ length: NODES }, (_, n) => {
            const y = 8 + n * ROW;
            const ev = lastEvent?.nodes[n];
            const overflow = (ev?.rejected ?? 0) > 0;
            return (
              <g key={n}>
                <rect x="84" y={y} width={W - 90} height={ROW - 6} fill="var(--paper)" stroke={overflow ? "var(--signal)" : "var(--rule)"} strokeWidth={overflow ? 2 : 1} style={{ transition: "stroke .4s ease" }} />
                <text x="92" y={y + 14} fontSize="12" fontWeight="600" fill="var(--ink)">node-{n + 1}</text>
                <text x={W - 10} y={y + 14} fontSize="11" textAnchor="end" fill={overflow ? "var(--signal)" : "var(--muted)"}>{ev ? `${ev.arrivals} in / cap ${capacity}${overflow ? ` · ${ev.rejected} rejected ×` : ""}` : `cap ${capacity} per tick`}</text>
              </g>
            );
          })}
          {Array.from({ length: primaries }, (_, sh) => {
            const y = barY(sh);
            const routed = s.routed[sh] ?? 0;
            const acc = s.accepted[sh] ?? 0;
            const isHot = sh === hot;
            const style = (f: number) => ({ transform: `scaleX(${Math.min(1, f)})`, transformOrigin: "left", transformBox: "fill-box" as const, transition: "transform .45s ease" });
            return (
              <g key={sh}>
                <text x="96" y={y + 9} fontSize="11" fill="var(--ink)" fontWeight={isHot ? 700 : 400}>s{sh}</text>
                <rect x={BAR_X} y={y} width={BAR_W} height="11" fill="var(--signal)" style={style(routed / scale)} />
                <rect x={BAR_X} y={y} width={BAR_W} height="11" fill="var(--lab)" style={style(acc / scale)} />
                <text x={BAR_X + BAR_W + 6} y={y + 9} fontSize="11" fill="var(--ink)">{routed}{routed > acc ? ` (${routed - acc} ×)` : ""}{isHot ? " ◀ busiest" : ""}</text>
              </g>
            );
          })}
          {Array.from({ length: 24 }, (_, k) => {
            const d = dots.find((x) => x.slot === k);
            const x = d ? 120 + (d.j % 8) * 6 : BULK.x + 70;
            const y = d ? barY(d.shard) + 6 : BULK.y + 17;
            return (
              <g key={k} style={{ transform: `translate(${x}px, ${y}px)`, transition: "transform .6s ease, opacity .3s ease" }} opacity={d ? 1 : 0.35}>
                <circle r="2.6" fill="var(--ink)" opacity={!d || d.accepted ? 1 : 0} />
                <text fontSize="11" textAnchor="middle" dominantBaseline="central" fill="var(--signal)" fontWeight="700" opacity={d && !d.accepted ? 1 : 0}>×</text>
              </g>
            );
          })}
        </svg>
        </div>
        <p className="text-[0.78rem] opacity-80">Bars: routed documents per shard. Filled part indexed, remainder (marked ×) rejected with 429. Dots: this tick&apos;s 24 documents; a × is a rejected one.</p>
        <StatGrid>
          <Stat label="Skew max / mean" value={s.tick ? s.skewRatio.toFixed(2) : "–"} note={s.tick ? `shard ${s.hotShard} busiest` : undefined} />
          <Stat label="Rejected (429)" value={String(s.rejectedTotal)} unit="docs" />
          <Stat label="Biggest tenant search" value={searchedText} note={s.tick ? `tenant ${tenantName(s.biggestTenant)}` : undefined} />
          <Stat label="Unrouted search" value={`all ${primaries}`} unit="shards" />
        </StatGrid>
        <div>
          <h4 className="font-semibold mb-1">Event log</h4>
          <ol className="max-h-44 overflow-y-auto border border-lab bg-paper p-2 font-mono text-[0.72rem] space-y-1" tabIndex={0} aria-label="Routing simulation events">
            {s.events.length === 0 ? <li>t0 · waiting. Press Step or Play.</li> : [...s.events].reverse().map((e) => <li key={e.tick}>{describeTick(e, capacity)}</li>)}
          </ol>
        </div>
      </div>
    </LabShell>
  );
}
