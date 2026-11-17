"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { NumberField, Segmented, Slider, Stat, StatGrid } from "../controls";
import {
  MAX_SHARDS_PER_NODE, SHARD_BAND_MAX_GB, SHARD_BAND_MIN_GB, SIZING_DEFAULTS, STRIP_MAX, WATERMARK_FLOOD, WATERMARK_HIGH, WATERMARK_LOW,
  shardSizing, type SearchScope, type SizingInput, type SizingLayout, type SizingLimit,
} from "@/lib/calc/elasticsearch";

const D = SIZING_DEFAULTS;
const LAYOUTS = [
  { value: "rollover", label: "Rollover by size" },
  { value: "daily", label: "Daily indices" },
] as const;
const SCOPES = [
  { value: "day", label: "Last day" },
  { value: "retention", label: "Full retention" },
] as const;
const LIMIT_TEXT: Record<SizingLimit, string> = {
  none: "no limit hit",
  shardSizeLarge: "shards too large",
  shardSizeSmall: "shards too small",
  diskWatermark: "disk watermark",
  shardsPerNode: "shards per node",
};
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const days = (d: number) => (d >= 10 ? d.toFixed(0) : d.toFixed(2).replace(/\.?0+$/, ""));
const GAUGE = { x: 150, w: 360 };
const bar = (f: number) => ({ transform: `scaleX(${Math.max(0, Math.min(1, f))})`, transformOrigin: "left", transformBox: "fill-box" as const, transition: "transform .5s ease, fill .5s ease" });

export function ShardSizingCalculator() {
  const [ingest, setIngest] = useState(D.ingestGBPerDay);
  const [retention, setRetention] = useState(D.retentionDays);
  const [replicas, setReplicas] = useState(D.replicas);
  const [target, setTarget] = useState(D.targetShardGB);
  const [primaries, setPrimaries] = useState(D.primaries);
  const [nodes, setNodes] = useState(D.nodes);
  const [disk, setDisk] = useState(D.diskPerNodeGB);
  const [layout, setLayout] = useState<SizingLayout>(D.layout);
  const [searches, setSearches] = useState(D.searchesPerSec);
  const [scope, setScope] = useState<SearchScope>(D.scope);

  const input: SizingInput = { ingestGBPerDay: ingest, retentionDays: retention, replicas, targetShardGB: target, primaries, nodes, diskPerNodeGB: disk, layout, searchesPerSec: searches, scope };
  const v = shardSizing(input);
  const reset = () => { setIngest(D.ingestGBPerDay); setRetention(D.retentionDays); setReplicas(D.replicas); setTarget(D.targetShardGB); setPrimaries(D.primaries); setNodes(D.nodes); setDisk(D.diskPerNodeGB); setLayout(D.layout); setSearches(D.searchesPerSec); setScope(D.scope); };

  const sizeState = v.primaryShardGB > SHARD_BAND_MAX_GB ? "large" : ingest > 0 && v.primaryShardGB < SHARD_BAND_MIN_GB ? "small" : "in band";
  const W = 520, H = 250;
  const sizeScale = 100; // GB at full width
  const sx = (gb: number) => GAUGE.x + (Math.min(gb, sizeScale) / sizeScale) * GAUGE.w;
  const diskMax = Math.max(1.2, v.diskUtil);
  const dx = (f: number) => GAUGE.x + (f / diskMax) * GAUGE.w;
  const spnMax = Math.max(MAX_SHARDS_PER_NODE * 1.2, v.shardsPerNode);
  const reqMax = Math.max(1000, v.shardRequestsPerSec);
  const stripW = (W - 20) / STRIP_MAX;
  const stripBad = sizeState !== "in band";
  const diskBad = v.diskUtil > WATERMARK_LOW;
  const spnBad = v.shardsPerNode > MAX_SHARDS_PER_NODE;

  return (
    <LabShell
      id="lab-es-sizing" label="Lab 1" title="Shard sizing calculator" kind="calculator"
      objective="Turn ingest rate, retention and a target shard size into rollover period, shard count, shards per node and disk use, and see which limit you hit first."
      assumptions={[
        "Constant ingest. 1 GB = 10^9 bytes (decimal), the same unit for ingest, shard size and disk.",
        "Primary data size equals on-disk size: compression, merge overhead, doc values and translog are ignored. Replicas are the same size as primaries.",
        "Allocation is perfectly even across data nodes; there are no tiers, awareness zones or per-index shard caps.",
        `The ${WATERMARK_LOW * 100}/${WATERMARK_HIGH * 100}/${WATERMARK_FLOOD * 100}% disk watermarks and the ${MAX_SHARDS_PER_NODE} shards per node limit are the defaults I know from Elasticsearch 8.x; on large disks recent 8.x releases cap the free space a watermark demands (max_headroom), so real thresholds can sit higher. Check your version and settings.`,
        `${SHARD_BAND_MIN_GB} to ${SHARD_BAND_MAX_GB} GB is Elastic's sizing guidance for time series data, not a hard rule. Rollover by size fills the target size per primary, capped at the retention window.`,
        "A search covers every shard of every index in scope: no routing, no can-match shard skipping, one copy per shard. The request rate is shard-level requests, not latency.",
        "Last day counts ceil(1 / rollover days) indices; a rolling 24-hour window usually straddles one more index than that.",
        "All numbers are arithmetic on the inputs. They are not measurements of any cluster.",
      ]}
      onReset={reset}
      summary={
        <p>
          {layout === "daily" ? "Daily indices" : `Rolling over by size every ${days(v.rolloverDays)} days`}: {fmt(v.indicesRetained)} indices retained, {fmt(v.totalShards)} shards in total
          ({v.shardsPerNode.toFixed(1)} per node), primary shards of {v.primaryShardGB.toFixed(v.primaryShardGB < 10 ? 2 : 1)} GB ({sizeState}). Disk is {(v.diskUtil * 100).toFixed(0)}% full
          across {nodes} nodes; {fmt(v.nodesForDisk)} nodes keep it under {WATERMARK_LOW * 100}%. A search touches {fmt(v.shardsQueriedPerSearch)} shards, so {searches} searches/s become {fmt(v.shardRequestsPerSec)} shard requests/s.
          {" "}First limit hit: {LIMIT_TEXT[v.firstLimit]}.{v.warnings.length ? ` ${v.warnings.map((w) => w.text).join(" ")}` : ""}
        </p>
      }
      controls={
        <>
          <Segmented label="Index layout" value={layout} options={LAYOUTS} onChange={setLayout} />
          <NumberField label="Ingest" unit="GB/day" value={ingest} min={0.1} max={5000} step={0.1} onChange={setIngest} />
          <Slider label="Retention" unit="days" value={retention} min={1} max={365} onChange={setRetention} />
          <Slider label="Replicas" value={replicas} min={0} max={3} onChange={setReplicas} />
          <Slider label="Target primary shard size" unit="GB" value={target} min={1} max={100} onChange={setTarget} hint={layout === "daily" ? "Ignored for daily indices." : "Rollover threshold, max_primary_shard_size."} />
          <Slider label="Primaries per index" value={primaries} min={1} max={64} onChange={setPrimaries} />
          <NumberField label="Data nodes" value={nodes} min={1} max={200} onChange={setNodes} />
          <NumberField label="Usable disk per node" unit="GB" value={disk} min={100} max={20000} step={100} onChange={setDisk} />
          <NumberField label="Searches" unit="per second" value={searches} min={0} max={5000} onChange={setSearches} />
          <Segmented label="Search covers" value={scope} options={SCOPES} onChange={setScope} />
        </>
      }
    >
      <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Sizing diagram, scrolls sideways on narrow screens">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Sizing. ${v.indicesRetained} indices of ${v.primaryShardGB.toFixed(1)} GB primary shards, ${sizeState}. Disk ${(v.diskUtil * 100).toFixed(0)} percent. ${v.shardsPerNode.toFixed(0)} shards per node of ${MAX_SHARDS_PER_NODE}. ${fmt(v.shardRequestsPerSec)} shard requests per second.`} style={{ minWidth: 460 }}>
        <text x="10" y="14" fontSize="12" fill="var(--ink)">Retained indices ({fmt(v.indicesRetained)}{v.indicesRetained > STRIP_MAX ? `, first ${STRIP_MAX} drawn` : ""})</text>
        {Array.from({ length: v.stripCount }, (_, i) => (
          <rect key={i} x={10 + i * stripW} y="22" width={Math.max(1, stripW - 1.5)} height="22" fill={stripBad ? "var(--signal)" : "var(--lab)"} opacity={stripBad ? 0.55 : 0.8} style={{ transition: "fill .5s ease" }} />
        ))}
        <text x="10" y="62" fontSize="12" fill="var(--ink)">Primary shard size: {v.primaryShardGB.toFixed(v.primaryShardGB < 10 ? 2 : 1)} GB · {sizeState}</text>
        <rect x={GAUGE.x} y="70" width={GAUGE.w} height="16" fill="var(--paper-2)" stroke="var(--rule)" />
        <rect x={sx(SHARD_BAND_MIN_GB)} y="70" width={sx(SHARD_BAND_MAX_GB) - sx(SHARD_BAND_MIN_GB)} height="16" fill="var(--lab)" opacity="0.22" />
        <rect x={GAUGE.x} y="74" width={GAUGE.w} height="8" fill={sizeState === "in band" ? "var(--lab)" : "var(--signal)"} style={bar(v.primaryShardGB / sizeScale)} />
        <text x={sx(SHARD_BAND_MIN_GB)} y="100" fontSize="11" textAnchor="middle" fill="var(--muted)">10</text>
        <text x={sx(SHARD_BAND_MAX_GB)} y="100" fontSize="11" textAnchor="middle" fill="var(--muted)">50 GB band</text>
        <text x="10" y="82" fontSize="11" fill="var(--ink)">size</text>

        <text x="10" y="132" fontSize="11" fill="var(--ink)">disk used</text>
        <rect x={GAUGE.x} y="120" width={GAUGE.w} height="16" fill="var(--paper-2)" stroke="var(--rule)" />
        <rect x={GAUGE.x} y="124" width={GAUGE.w} height="8" fill={diskBad ? "var(--signal)" : "var(--lab)"} style={bar(v.diskUtil / diskMax)} />
        {[WATERMARK_LOW, WATERMARK_HIGH, WATERMARK_FLOOD].map((f) => <line key={f} x1={dx(f)} x2={dx(f)} y1="116" y2="140" stroke="var(--ink)" strokeDasharray="3 2" />)}
        <text x={dx(WATERMARK_LOW)} y="152" fontSize="11" textAnchor="end" fill="var(--muted)">85</text>
        <text x={dx(WATERMARK_HIGH)} y="152" fontSize="11" textAnchor="middle" fill="var(--muted)">90</text>
        <text x={dx(WATERMARK_FLOOD)} y="152" fontSize="11" textAnchor="start" fill="var(--muted)">95%</text>
        <text x="10" y="146" fontSize="11" fill="var(--ink)">{(v.diskUtil * 100).toFixed(0)}%{diskBad ? " over" : ""}</text>

        <text x="10" y="182" fontSize="11" fill="var(--ink)">shards/node</text>
        <rect x={GAUGE.x} y="170" width={GAUGE.w} height="16" fill="var(--paper-2)" stroke="var(--rule)" />
        <rect x={GAUGE.x} y="174" width={GAUGE.w} height="8" fill={spnBad ? "var(--signal)" : "var(--lab)"} style={bar(v.shardsPerNode / spnMax)} />
        <line x1={GAUGE.x + (MAX_SHARDS_PER_NODE / spnMax) * GAUGE.w} x2={GAUGE.x + (MAX_SHARDS_PER_NODE / spnMax) * GAUGE.w} y1="166" y2="190" stroke="var(--ink)" strokeDasharray="3 2" />
        <text x="10" y="196" fontSize="11" fill="var(--ink)">{v.shardsPerNode.toFixed(0)}{spnBad ? " over" : ""}</text>
        <text x={GAUGE.x + (MAX_SHARDS_PER_NODE / spnMax) * GAUGE.w} y="202" fontSize="11" textAnchor="end" fill="var(--muted)">limit 1,000</text>

        <text x="10" y="232" fontSize="11" fill="var(--ink)">shard req/s</text>
        <rect x={GAUGE.x} y="220" width={GAUGE.w} height="16" fill="var(--paper-2)" stroke="var(--rule)" />
        <rect x={GAUGE.x} y="224" width={GAUGE.w} height="8" fill="var(--lab)" style={bar(v.shardRequestsPerSec / reqMax)} />
        <text x={W - 4} y="248" fontSize="11" textAnchor="end" fill="var(--muted)">{fmt(v.shardRequestsPerSec)} of scale {fmt(reqMax)}</text>
      </svg>
        </div>
      <StatGrid>
        <Stat label="Rollover period" value={days(v.rolloverDays)} unit="days" />
        <Stat label="Indices retained" value={fmt(v.indicesRetained)} />
        <Stat label="Primary shard" value={v.primaryShardGB.toFixed(v.primaryShardGB < 10 ? 2 : 1)} unit="GB" note={sizeState} />
        <Stat label="Total shards" value={fmt(v.totalShards)} />
        <Stat label="Shards per node" value={v.shardsPerNode.toFixed(1)} note={`limit ${MAX_SHARDS_PER_NODE}`} />
        <Stat label="Disk used" value={(v.diskUtil * 100).toFixed(0)} unit="%" note={`${fmt(v.storedGB)} GB stored`} />
        <Stat label="Nodes for disk" value={fmt(v.nodesForDisk)} note="under 85%" />
        <Stat label="Shard requests" value={fmt(v.shardRequestsPerSec)} unit="/s" note={`${fmt(v.shardsQueriedPerSearch)} per search`} />
        <Stat label="First limit hit" value={LIMIT_TEXT[v.firstLimit]} />
      </StatGrid>
    </LabShell>
  );
}
