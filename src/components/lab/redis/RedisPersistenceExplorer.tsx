"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { NumberField, Segmented, Slider, Stat, StatGrid } from "../controls";
import { OS_FLUSH_SEC, TIMELINE_SEC, persistenceView, type FsyncPolicy, type PersistMode } from "@/lib/calc/redis";

const D = { rate: 1000, mode: "aof" as PersistMode, fsync: "everysec" as FsyncPolicy, snapSec: 10, snapChanges: 10000, crash: 37.5, dataset: 8 };
const MODES = [{ value: "rdb", label: "RDB" }, { value: "aof", label: "AOF" }, { value: "hybrid", label: "AOF + RDB" }] as const;
const FSYNCS = [{ value: "always", label: "always" }, { value: "everysec", label: "everysec" }, { value: "no", label: "no" }] as const;
const fmt = (n: number) => n.toLocaleString("en-US");
const X0 = 24, W = 552;
const x = (t: number) => X0 + (t / TIMELINE_SEC) * W;
const bar = (n: number) => "■".repeat(n) + "□".repeat(5 - n);

export function RedisPersistenceExplorer() {
  const [rate, setRate] = useState(D.rate);
  const [mode, setMode] = useState<PersistMode>(D.mode);
  const [fsync, setFsync] = useState<FsyncPolicy>(D.fsync);
  const [snapSec, setSnapSec] = useState(D.snapSec);
  const [snapChanges, setSnapChanges] = useState(D.snapChanges);
  const [crash, setCrash] = useState(D.crash);
  const [dataset, setDataset] = useState(D.dataset);
  const reset = () => { setRate(D.rate); setMode(D.mode); setFsync(D.fsync); setSnapSec(D.snapSec); setSnapChanges(D.snapChanges); setCrash(D.crash); setDataset(D.dataset); };

  const v = persistenceView({ writesPerSec: rate, mode, fsync, snapshotSeconds: snapSec, snapshotChanges: snapChanges, crashSec: crash, datasetGB: dataset });
  const ticks = Math.min(120, v.acked);
  const policy = v.usesAof ? `AOF appendfsync ${fsync}` : "RDB snapshots only";

  return (
    <LabShell
      id="lab-redis-persist" label="Lab" title="Redis persistence explorer" kind="explorer"
      objective="See how much acknowledged data a crash can cost under RDB, AOF (always / everysec / no) and the hybrid setup, and what each choice costs you."
      assumptions={[
        "Writes arrive at a perfectly uniform rate; 'acknowledged' means Redis replied OK to the client.",
        "The crash is a power loss or OS crash. A bare Redis process kill would lose nothing already passed to the kernel with AOF, even under appendfsync no.",
        "An fsync or snapshot landing exactly on the crash instant is counted as not yet done (conservative).",
        `appendfsync always is shown as ~0 loss; real durability still depends on disk write caches, virtualised storage and filesystem behaviour. everysec can reach ~2 s in edge cases; 'no' follows the OS flush (~${OS_FLUSH_SEC} s on typical Linux, kernel dependent).`,
        "RDB window = max(save seconds, changes / write rate); snapshot duration itself is ignored. In AOF-only mode the save rules are ignored; in AOF + RDB, restart prefers the AOF.",
        "Cost bars are qualitative ordinals (1 to 5), not measurements: real numbers depend on disk, kernel, value sizes and pipelining.",
        "AOF rewrite (BGREWRITEAOF) compacts the log. Redis 7+ uses a multi-part AOF: a base file (RDB or AOF format), incremental files and a manifest. Rewrites fork like snapshots do.",
        "Replication is outside this model: with async replication a failover can lose acknowledged writes, and WAIT reduces but does not eliminate that window.",
      ]}
      onReset={reset}
      summary={
        <p>
          {policy} at {fmt(v.writesPerSec)} writes/s, crash at {v.crashSec} s: {fmt(v.acked)} writes acknowledged, {fmt(v.lost)} lost
          {v.usesAof && fsync === "always" ? " (about 0 by design, modulo disk and OS caveats)" : ""}. Last durable point: {v.durableSec} s. Worst case for this policy is {v.worstWindowSec === 0 ? "about 0 s" : `${v.worstWindowSec} s`} of writes (about {fmt(v.worstWindowWrites)}). {v.windowNote} Recovery: {v.recoverySource}
        </p>
      }
      controls={
        <>
          <NumberField label="Write rate" unit="ops/s" value={rate} min={0} max={1000000} step={100} onChange={setRate} />
          <Segmented label="Persistence mode" value={mode} options={MODES} onChange={setMode} />
          <Segmented label="appendfsync policy" value={fsync} options={FSYNCS} onChange={setFsync} />
          {!v.usesAof && <p className="text-[0.78rem] opacity-80">appendfsync applies only when AOF is on.</p>}
          <Slider label="Snapshot: save after" unit="s" value={snapSec} min={1} max={60} onChange={setSnapSec} hint="save N seconds ... " />
          <NumberField label="Snapshot: and at least" unit="changes" value={snapChanges} min={1} max={10000000} step={100} onChange={setSnapChanges} />
          <Slider label="Crash time" unit="s" value={crash} min={0} max={TIMELINE_SEC} step={0.5} onChange={setCrash} />
          <NumberField label="Dataset size" unit="GB, decimal" value={dataset} min={0} max={10000} onChange={setDataset} />
        </>
      }
    >
      <svg viewBox="0 0 600 150" width="100%" role="img"
        aria-label={`Timeline 0 to ${TIMELINE_SEC} s. Crash at ${v.crashSec} s. Last durable point at ${v.durableSec} s. ${fmt(v.lost)} of ${fmt(v.acked)} acknowledged writes lost.`}>
        <line x1={X0} y1="90" x2={X0 + W} y2="90" stroke="var(--ink)" />
        {[0, 10, 20, 30, 40, 50, 60].map((t) => (
          <g key={t}><line x1={x(t)} y1="90" x2={x(t)} y2="95" stroke="var(--ink)" /><text x={x(t)} y="108" fontSize="10" textAnchor="middle" fill="var(--ink)">{t}s</text></g>
        ))}
        {v.lost > 0 && <rect x={x(v.durableSec)} y="30" width={Math.max(0, x(v.crashSec) - x(v.durableSec))} height="60" fill="var(--signal)" opacity="0.18" />}
        {Array.from({ length: ticks }, (_, i) => {
          const t = ((i + 0.5) / ticks) * v.crashSec;
          const lost = t > v.durableSec;
          return <line key={i} x1={x(t)} x2={x(t)} y1={lost ? 62 : 74} y2="90" stroke={lost ? "var(--signal)" : "var(--ink)"} strokeWidth={lost ? 1.5 : 1} />;
        })}
        {v.fsyncTimes.map((t) => <path key={`f${t}`} d={`M${x(t) - 4} 84 h8 l-4 -9 z`} fill="var(--lab)" opacity={t < v.crashSec ? 1 : 0.35} />)}
        {v.snapshotTimes.map((t) => <rect key={`s${t}`} x={x(t) - 4} y="116" width="8" height="8" fill="var(--paper)" stroke="var(--lab)" strokeWidth="1.5" opacity={t < v.crashSec ? 1 : 0.35} />)}
        <line x1={x(v.crashSec)} x2={x(v.crashSec)} y1="20" y2="130" stroke="var(--signal)" strokeWidth="2" strokeDasharray="5 3" />
        <text x={Math.min(x(v.crashSec) + 4, 540)} y="26" fontSize="11" fill="var(--ink)">CRASH {v.crashSec}s</text>
        <text x={X0} y="144" fontSize="10" fill="var(--ink)">
          ▲ fsync {v.fsyncEveryWrite ? "(every write, not drawn)" : v.fsyncTimes.length ? "" : "(n/a)"}   □ RDB snapshot / rewrite point   | tall red tick = lost write (ticks subsampled to 120)
        </text>
      </svg>
      <StatGrid>
        <Stat label="Acked writes lost" value={fmt(v.lost)} note={`of ${fmt(v.acked)} acked`} />
        <Stat label="Worst-case window" value={v.worstWindowSec === 0 ? "≈ 0" : String(v.worstWindowSec)} unit="s" note={v.usesAof ? "policy dependent" : `snapshot every ${v.snapshotPeriodSec.toFixed(1)} s`} />
        <Stat label="Write cost (qualitative)" value={bar(v.latencyIndex)} note="illustrative ordinal, not measured" />
      </StatGrid>
      <p className="mt-3 text-[0.85rem]"><span className="font-semibold">Write latency / throughput cost.</span> {v.costText}</p>
      <p className="mt-2 text-[0.85rem]" role={v.cowRisk === "low" ? undefined : "note"}>
        <span className="font-semibold">Fork and copy-on-write ({v.cowRisk} risk at this write rate).</span>{" "}
        Snapshots and AOF rewrites fork a child; pages the parent modifies while the child runs are copied. Worst case the process needs up to about {v.cowPeakExtraGB} GB extra on a {dataset} GB dataset (decimal GB), so leave headroom and watch for the kernel OOM killer.
      </p>
    </LabShell>
  );
}
