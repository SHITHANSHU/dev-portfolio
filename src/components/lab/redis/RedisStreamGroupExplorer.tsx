"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { NumberField, Segmented, Slider, Stat, StatGrid } from "../controls";
import { CONSUMER_RATE, PRODUCE_SEC, STREAM_NODE_ENTRIES, fmtBytesDecimal, streamEntryId, streamGroupView, type TrimMode } from "@/lib/calc/redis";

const D = { entries: 400, cpg: 3, groups: 2, trim: "approx" as TrimMode, maxlen: 150, skew: 40, bpe: 100 };
const TRIMS = [{ value: "none", label: "No trim" }, { value: "exact", label: "MAXLEN" }, { value: "approx", label: "MAXLEN ~" }] as const;
const W = 560;

export function RedisStreamGroupExplorer() {
  const [entries, setEntries] = useState(D.entries);
  const [cpg, setCpg] = useState(D.cpg);
  const [groups, setGroups] = useState(D.groups);
  const [trim, setTrim] = useState<TrimMode>(D.trim);
  const [maxlen, setMaxlen] = useState(D.maxlen);
  const [skew, setSkew] = useState(D.skew);
  const [bpe, setBpe] = useState(D.bpe);
  const reset = () => { setEntries(D.entries); setCpg(D.cpg); setGroups(D.groups); setTrim(D.trim); setMaxlen(D.maxlen); setSkew(D.skew); setBpe(D.bpe); };

  const v = streamGroupView({ entries, consumersPerGroup: cpg, groups, trimMode: trim, maxlen, skewPct: skew, bytesPerEntry: bpe });
  const px = (i: number) => 4 + (v.entries === 0 ? 0 : (i / v.entries) * W);
  const rowH = 30;
  const h = 40 + v.groups.length * rowH;

  return (
    <LabShell
      id="lab-redis-stream-groups" label="Lab" title="Redis Stream consumer group explorer" kind="explorer"
      objective="See that a consumer group splits entries across its consumers, that each group reads the whole stream independently, and what MAXLEN and MAXLEN ~ do to retention and memory."
      assumptions={[
        `Entry IDs are ms-seq; entries are synthetic, three per millisecond, so the sequence part counts 0, 1, 2. Production rate is ${entries} entries over ${PRODUCE_SEC} s; one consumer at speed 1.0 handles ${CONSUMER_RATE} entries/s (illustrative, not measured).`,
        "Consumers pull work when free, so faster consumers get proportionally more entries; entries are split by largest remainder. Skew sets the slowest consumer's speed to (100 - skew)% of the fastest.",
        "Each group after the first has one fewer consumer than the previous (minimum 1), so groups lag independently. Lag = entries added but not yet delivered to the group, measured at the end of the production window.",
        `MAXLEN trims exactly. MAXLEN ~ only removes whole macro-nodes (default stream-node-max-entries = ${STREAM_NODE_ENTRIES}), so it keeps at least maxlen entries and often more; assumes the oldest nodes are full.`,
        `Memory is entries retained x ${bpe} B, an illustrative assumption in decimal units (kB = 1000 B); real size depends on field sizes, the radix tree and listpack overhead.`,
        "Trimming ignores consumer groups: entries trimmed before a group read them are gone for that group. Async replication can lose acknowledged writes on failover; WAIT reduces but does not eliminate that.",
      ]}
      onReset={reset}
      summary={
        <p>
          {v.entries} entries ({v.firstRetainedId} to {v.lastId} retained), {v.retained} kept after {trim === "none" ? "no trimming" : trim === "exact" ? "exact MAXLEN" : "approximate MAXLEN ~"}
          {v.overshoot > 0 ? `, ${v.overshoot} more than maxlen because whole nodes are dropped` : ""}; about {fmtBytesDecimal(v.memoryBytes)} (untrimmed {fmtBytesDecimal(v.memoryUntrimmedBytes)}).
          {" "}{v.groups.map((g) => `${g.name}: ${g.delivered} delivered across ${g.consumers.length} consumer${g.consumers.length === 1 ? "" : "s"}, lag ${g.lag}${g.lostToTrim > 0 ? `, ${g.lostToTrim} trimmed before read` : ""}`).join("; ")}.
          {" "}Within a group each entry goes to exactly one consumer; every group sees the same entries.
        </p>
      }
      controls={
        <>
          <Slider label="Entries" value={entries} min={0} max={1000} step={10} onChange={setEntries} />
          <Slider label="Consumers per group" value={cpg} min={1} max={6} onChange={setCpg} hint="Group 1 size; later groups get one fewer." />
          <Slider label="Consumer groups" value={groups} min={1} max={3} onChange={setGroups} />
          <Segmented label="Trim on XADD" value={trim} options={TRIMS} onChange={setTrim} />
          <Slider label="maxlen" unit="entries" value={maxlen} min={1} max={1000} step={1} onChange={setMaxlen} />
          <Slider label="Consumer speed skew" unit="%" value={skew} min={0} max={90} step={5} onChange={setSkew} />
          <NumberField label="Assumed bytes per entry" unit="B" value={bpe} min={1} max={1000000} step={10} onChange={setBpe} />
        </>
      }
    >
      <svg viewBox={`0 0 ${W + 8} ${h}`} width="100%" role="img"
        aria-label={`Stream of ${v.entries} entries: ${v.removed} trimmed, ${v.retained} retained. ${v.groups.map((g) => `${g.name} cursor after entry ${g.delivered}`).join("; ")}.`}>
        <defs><pattern id="rs-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted)" strokeWidth="2" /></pattern></defs>
        <text x="4" y="12" fontSize="10" fill="var(--ink)">hatched = trimmed ({v.removed}) · open = retained ({v.retained}) · filled = delivered to the group</text>
        {v.groups.map((g, gi) => {
          const y = 22 + gi * rowH;
          return (
            <g key={g.name}>
              <rect x="4" y={y} width={W} height="18" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1" />
              {v.removed > 0 && <rect x="4" y={y} width={px(v.removed) - 4} height="18" fill="url(#rs-hatch)" stroke="var(--ink)" />}
              <rect x={px(Math.max(v.removed, 0))} y={y} width={Math.max(0, px(Math.max(g.delivered, v.removed)) - px(v.removed))} height="18" fill="var(--lab-soft)" />
              <line x1={px(g.delivered)} x2={px(g.delivered)} y1={y - 3} y2={y + 21} stroke="var(--lab)" strokeWidth="2" />
              <text x="8" y={y + 13} fontSize="10" fill="var(--ink)">{g.name} cursor {g.delivered}</text>
            </g>
          );
        })}
      </svg>
      <StatGrid>
        <Stat label="Retained entries" value={String(v.retained)} note={`oldest ${v.firstRetainedId}`} />
        <Stat label="Memory (estimate)" value={fmtBytesDecimal(v.memoryBytes)} note={`${bpe} B/entry assumed`} />
        {v.groups.map((g) => <Stat key={g.name} label={`Lag ${g.name}`} value={String(g.lag)} unit="entries" note={g.lostToTrim > 0 ? `${g.lostToTrim} trimmed before read` : undefined} />)}
      </StatGrid>
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-[0.8rem] num">
          <caption className="text-left font-medium pb-1">Entries per consumer (first group entry ID {streamEntryId(0)})</caption>
          <thead><tr className="border-b border-lab text-left"><th scope="col" className="pr-3">Group</th><th scope="col" className="pr-3">Consumer</th><th scope="col" className="pr-3">Speed</th><th scope="col">Entries</th></tr></thead>
          <tbody>
            {v.groups.flatMap((g) => g.consumers.map((c) => (
              <tr key={c.name} className="border-b border-lab"><th scope="row" className="pr-3 font-normal">{g.name}</th><td className="pr-3">{c.name}</td><td className="pr-3">{c.speed.toFixed(2)}x</td><td>{c.entries}</td></tr>
            )))}
          </tbody>
        </table>
      </div>
    </LabShell>
  );
}
