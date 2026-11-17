"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { Segmented, Slider, Stat, StatGrid } from "../controls";
import { usePlayer } from "../cdc/usePlayer";
import { REINDEX_DEFAULTS, REINDEX_TICKS, SNAPSHOT_DOCS, reindexOutcome, simulateReindex, type ReindexStrategy } from "@/lib/calc/elasticsearch";

const D = REINDEX_DEFAULTS;
const STRATEGIES = [
  { value: "swapRightAfter", label: "Swap right after copy" },
  { value: "catchUp", label: "Catch-up by updated_at, then swap" },
  { value: "pauseWrites", label: "Pause writes, catch up, swap" },
  { value: "cdcReplay", label: "Replay change log (CDC)" },
] as const;
const STRATEGY_TEXT: Record<ReindexStrategy, string> = {
  swapRightAfter: "swapping right after the snapshot copy",
  catchUp: "catch-up passes by updated_at before the swap",
  pauseWrites: "pausing writes for the final catch-up",
  cdcReplay: "replaying the change log into v2",
};

const W = 520, BX = 150, BW = 360, CELL = 16.4;
const bar = (f: number, shift = 0) => ({ transform: `translateX(${shift}px) scaleX(${Math.max(0, Math.min(1, f))})`, transformOrigin: "left", transformBox: "fill-box" as const, transition: "transform .5s ease" });

export function AliasReindexPlayground() {
  const [writes, setWrites] = useState(D.writesPerTick);
  const [deletes, setDeletes] = useState(D.deletesPerTick);
  const [copy, setCopy] = useState(D.copyPerTick);
  const [strategy, setStrategy] = useState<ReindexStrategy>(D.strategy);
  const player = usePlayer(REINDEX_TICKS + 1, 800);

  const params = { writesPerTick: writes, deletesPerTick: deletes, copyPerTick: copy, strategy };
  const s = simulateReindex(params, player.step);
  const o = reindexOutcome(s);
  const scale = SNAPSHOT_DOCS + writes * REINDEX_TICKS + 20;
  const x = (n: number) => (n / scale) * BW;
  const swapped = s.swapTick !== null;
  const pauseStart = (s.copyDoneTick ?? 0) + 1;
  const status = o.consistent ? "consistent" : swapped ? "diverged" : s.tick === 0 ? "not started" : "in progress";
  const reset = () => { player.reset(); setWrites(D.writesPerTick); setDeletes(D.deletesPerTick); setCopy(D.copyPerTick); setStrategy(D.strategy); };

  return (
    <LabShell
      id="lab-es-reindex" label="Lab 3" title="Alias reindex playground" kind="simulation"
      objective="Reindex an index behind an alias while writes keep arriving, and see which swap strategy loses writes, misses deletes, or stays consistent."
      assumptions={[
        `Counts, not documents: v1 starts with ${SNAPSHOT_DOCS} documents, a snapshot is taken at T0, and each tick adds writes (inserts or updates, one document version each) and deletes of snapshot documents.`,
        "The copy reads the snapshot, so every delete after T0 is copied into v2 anyway and stays there unless the strategy removes it. Catch-up by updated_at sees writes but not deletes.",
        "Pause strategy: writes queue at the client from the end of the copy until the swap, then land on v2. Its pause window also reconciles deletes (for example by comparing ids or applying tombstones), at the same rate as the copy.",
        "CDC replay assumes ordered change events and external versioning, so replay applies writes and deletes in order and cannot overwrite a newer version. The consumer keeps both indices fed until the swap.",
        "Catch-up and replay swap when at most one tick of work is pending; the last few documents are then copied by a final pass, assumed never to overwrite a newer post-swap write (true only with versions from the source of truth).",
        "Every writer sets updated_at, deletes are hard deletes, and the reindex itself never fails. Ticks are abstract time. Thirty ticks maximum.",
      ]}
      onReset={reset}
      summary={
        <p>
          Tick {s.tick} of {REINDEX_TICKS}, {STRATEGY_TEXT[strategy]}. {s.tick === 0 ? "Press Step or Play to start the copy." : swapped ? `The alias moved to v2 at tick ${s.swapTick}. ${o.missingWrites} writes are missing from v2 and ${o.resurrectedDeletes} deleted documents are present in v2; writes were paused for ${o.pauseTicks} ticks. Result: ${status}.` : s.phase === "paused" ? `Writes are paused and ${s.queued} operations are queued at the client while the final catch-up runs.` : s.copyDoneTick === null ? `Copied ${s.copied} of ${SNAPSHOT_DOCS} snapshot documents; ${o.missingWrites} writes and ${o.resurrectedDeletes} deletes so far are not reflected in v2.` : `Snapshot copied; ${o.missingWrites} writes still need to reach v2. The alias still points at v1.`}
        </p>
      }
      controls={
        <>
          <Segmented label="Swap strategy" value={strategy} options={STRATEGIES} onChange={setStrategy} />
          <Slider label="Writes" unit="per tick" value={writes} min={0} max={40} onChange={setWrites} />
          <Slider label="Deletes" unit="per tick" value={deletes} min={0} max={10} onChange={setDeletes} />
          <Slider label="Copy rate" unit="docs / tick" value={copy} min={20} max={200} step={10} onChange={setCopy} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn lab-btn" onClick={player.toggle}>{player.playing ? "Pause" : "Play"}</button>
            <button type="button" className="btn lab-btn" onClick={player.next} disabled={player.step >= REINDEX_TICKS}>Step</button>
            <button type="button" className="btn lab-btn" onClick={player.reset}>Rewind</button>
          </div>
          <p className="text-[0.78rem] opacity-80">Play runs at most {REINDEX_TICKS} ticks and never starts by itself.{player.reduced ? " Reduced motion is on: the alias jumps instead of sliding." : ""}</p>
        </>
      }
    >
      <div className="space-y-4">
        <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Reindex diagram, scrolls sideways on narrow screens">
          <svg viewBox={`0 0 ${W} 200`} width="100%" role="img" style={{ minWidth: 460 }} aria-label={`Tick ${s.tick}. Alias points at ${swapped ? "v2" : "v1"}. v1 holds ${s.v1Count} documents, v2 holds ${s.v2Count}. ${o.missingWrites} writes missing from v2, ${o.resurrectedDeletes} deleted documents present in v2. Status ${status}.`}>
          <defs>
            <pattern id="es-hatch-miss" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--paper)" /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--signal)" strokeWidth="3" /></pattern>
            <pattern id="es-hatch-res" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="var(--paper)" /><circle cx="3" cy="3" r="1.6" fill="var(--signal)" /></pattern>
          </defs>
          <text x={BX} y="14" fontSize="12" fill="var(--ink)">orders-v1 · {s.v1Count} docs{o.missingWrites > 0 ? ` · ${o.missingWrites} missing in v2` : ""}</text>
          <rect x={BX} y="20" width={BW} height="24" fill="var(--paper-2)" stroke="var(--rule)" />
          <rect x={BX} y="20" width={BW} height="24" fill="var(--lab)" opacity={swapped ? 0.45 : 0.9} style={bar(s.v1Count / scale)} />
          <rect x={BX} y="20" width={BW} height="24" fill="url(#es-hatch-miss)" stroke="var(--signal)" style={bar(o.missingWrites / scale, x(s.v1Count - o.missingWrites))} opacity={o.missingWrites > 0 ? 1 : 0} />

          <text x={BX} y="84" fontSize="12" fill="var(--ink)">orders-v2 · {s.v2Count} docs · copied {s.copied}/{SNAPSHOT_DOCS}{o.resurrectedDeletes > 0 ? ` · ${o.resurrectedDeletes} resurrected` : ""}</text>
          <rect x={BX} y="90" width={BW} height="24" fill="var(--paper-2)" stroke="var(--rule)" />
          <rect x={BX} y="90" width={BW} height="24" fill="var(--lab)" opacity={swapped ? 0.9 : 0.6} style={bar(s.v2Count / scale)} />
          <rect x={BX} y="90" width={BW} height="24" fill="url(#es-hatch-res)" stroke="var(--signal)" style={bar(o.resurrectedDeletes / scale, x(Math.max(0, s.v2Count - o.resurrectedDeletes)))} opacity={o.resurrectedDeletes > 0 ? 1 : 0} />

          <g style={{ transform: `translateY(${swapped ? 70 : 0}px)`, transition: "transform .7s ease" }}>
            <rect x="6" y="20" width="96" height="24" fill="var(--paper)" stroke="var(--ink)" />
            <text x="54" y="36" fontSize="12" textAnchor="middle" fill="var(--ink)">alias orders</text>
            <path d="M102 32 H146 M138 26 L146 32 L138 38" stroke="var(--ink)" fill="none" strokeWidth="2" />
          </g>

          <text x="10" y="142" fontSize="11" fill="var(--ink)">timeline · tick 0 to {REINDEX_TICKS}</text>
          {Array.from({ length: REINDEX_TICKS + 1 }, (_, i) => {
            const isPaused = strategy === "pauseWrites" && o.pauseTicks > 0 && i >= pauseStart && i < pauseStart + o.pauseTicks;
            return (
              <g key={i}>
                <rect x={6 + i * CELL} y="148" width={CELL - 2} height="16" fill={isPaused ? "url(#es-hatch-miss)" : i <= s.tick ? "var(--lab)" : "var(--paper-2)"} stroke={isPaused ? "var(--signal)" : "var(--rule)"} style={{ transition: "fill .3s ease" }} />
                {s.swapTick === i && <text x={6 + i * CELL + (CELL - 2) / 2} y="180" fontSize="12" textAnchor="middle" fill="var(--ink)">▲</text>}
              </g>
            );
          })}
          <text x="10" y="196" fontSize="11" fill="var(--ink)">{swapped ? `▲ swap at tick ${s.swapTick}` : "no swap yet"}{o.pauseTicks > 0 ? ` · hatched cells: writes paused (${o.pauseTicks})` : ""}</text>
        </svg>
        </div>
        <p className="text-[0.78rem] opacity-80">Hatched stripes on v1: writes that never reached v2. Dotted segment on v2: documents deleted in v1 that are still in v2.</p>
        <StatGrid>
          <Stat label="Swap tick" value={o.swapTick === null ? "–" : String(o.swapTick)} />
          <Stat label="Missing writes in v2" value={String(o.missingWrites)} />
          <Stat label="Resurrected deletes" value={String(o.resurrectedDeletes)} />
          <Stat label="Write pause" value={String(o.pauseTicks)} unit="ticks" />
          <Stat label="Final consistent" value={o.consistent ? "yes" : swapped ? "no" : "not yet"} />
        </StatGrid>
        <div>
          <h4 className="font-semibold mb-1">Event log</h4>
          <ol className="max-h-44 overflow-y-auto border border-lab bg-paper p-2 font-mono text-[0.72rem] space-y-1" tabIndex={0} aria-label="Reindex simulation events">
            {[...s.events].reverse().map((e, i) => <li key={`${s.events.length - i}-${e}`}>{e}</li>)}
          </ol>
        </div>
      </div>
    </LabShell>
  );
}
