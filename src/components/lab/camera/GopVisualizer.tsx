"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { Segmented, Slider, Stat, StatGrid } from "../controls";
import { FRAME_SIZE_WEIGHT, buildGop, decodability, gopStats, seekDecodeCount } from "@/lib/calc/camera";

const D = { len: 12, b: 2, seek: 6 };
const PITCH = 32, W = 26, BASE = 150;

export function GopVisualizer() {
  const [len, setLen] = useState(D.len);
  const [b, setB] = useState(D.b);
  const [seek, setSeek] = useState(D.seek);
  const [dropped, setDropped] = useState<number[]>([]);
  const frames = buildGop(len, b);
  const drops = new Set(dropped.filter((i) => i < frames.length));
  const ok = decodability(frames, drops);
  const lost = frames.filter((f, i) => !ok[i] && !drops.has(f.index)).length;
  const stats = gopStats(frames);
  const target = Math.min(seek, frames.length - 1);
  const seekCost = seekDecodeCount(frames, target);
  const toggle = (i: number) => setDropped((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  const reset = () => { setLen(D.len); setB(D.b); setSeek(D.seek); setDropped([]); };
  const x = (i: number) => 10 + i * PITCH + W / 2;
  const h = (t: "I" | "P" | "B") => 12 + FRAME_SIZE_WEIGHT[t] * 3.2;

  return (
    <LabShell
      id="lab-camera-gop" label="Lab 3.C" title="GOP visualizer" kind="explorer"
      objective="Understand why one lost packet or frame damages every frame that depends on it until the next I-frame, and why seeking costs more deeper into a GOP."
      assumptions={[
        "Simplified closed-GOP model: I at the start, P every (B+1) frames, B frames reference the previous and next anchor and are not used as references. Trailing frames with no next anchor become P.",
        "Real encoders vary: open vs closed GOPs, adaptive GOP length, scene-cut I-frames, B-pyramids/reference B-frames, multiple reference frames, and slice-level concealment.",
        "Frame heights show relative size I > P > B using illustrative weights 10 : 3 : 1; real ratios depend on content and encoder.",
        "A dropped frame stands for any lost packet that makes the frame undecodable. Concealment is ignored, and the next GOP is not shown (it would recover at its I-frame).",
        "Seek cost = frames that must be decoded to display the chosen frame, starting from this GOP's I-frame. Display order is shown, not decode order.",
      ]}
      onReset={reset}
      summary={
        <p>
          GOP of {frames.length} frames with {b} B-frame(s) between anchors. {drops.size === 0 ? "No frames dropped: click a frame to simulate its loss." : `${drops.size} frame(s) lost, making ${lost} more undecodable (${drops.size + lost} of ${frames.length} unusable) until the next I-frame.`}{" "}
          Displaying frame {target} requires decoding {seekCost} frame(s); worst case in this GOP is {stats.worstSeekFrames}.
        </p>
      }
      controls={<>
        <Slider label="GOP length" unit="frames" value={len} min={2} max={30} onChange={setLen} />
        <Segmented label="B-frames between anchors" value={b} options={[0, 1, 2, 3].map((n) => ({ value: n, label: String(n) }))} onChange={setB} />
        <Slider label="Seek to frame" value={target} min={0} max={frames.length - 1} onChange={setSeek} />
        <button type="button" className="btn lab-btn" onClick={() => setDropped([])} disabled={dropped.length === 0}>Clear dropped frames</button>
      </>}
    >
      <p className="text-[0.8rem] mb-1">Click (or press Enter/Space on) a frame to drop it. Arrows point from a frame to the frame it needs.</p>
      <div className="overflow-x-auto border border-lab">
        <svg viewBox={`0 0 ${20 + frames.length * PITCH} 200`} style={{ width: "100%", minWidth: Math.min(720, 20 + frames.length * PITCH) }} role="group" aria-label="GOP frame sequence in display order">
          <defs>
            <marker id="gop-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="var(--ink-2)" /></marker>
            <pattern id="gop-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="var(--paper)" /><line x1="0" y1="0" x2="0" y2="5" stroke="var(--signal)" strokeWidth="2" /></pattern>
          </defs>
          {frames.flatMap((f) => f.refs.map((r) => {
            const x1 = x(f.index), x2 = x(r), top = BASE - h(f.type), top2 = BASE - h(frames[r]?.type ?? "P"), peak = Math.max(20, top - 14 - Math.abs(f.index - r) * 5);
            return <path key={`${f.index}-${r}`} d={`M${x1},${top} Q${(x1 + x2) / 2},${peak - 10} ${x2},${top2 - 2}`} fill="none" stroke="var(--ink-2)" strokeWidth="1" strokeDasharray={f.type === "B" ? "3 2" : undefined} markerEnd="url(#gop-arrow)" opacity="0.8" />;
          }))}
          {frames.map((f, i) => {
            const isDrop = drops.has(i), bad = !ok[i], ht = h(f.type);
            const state = isDrop ? "dropped" : bad ? "undecodable" : "decodable";
            return (
              <g key={i} role="button" tabIndex={0} aria-pressed={isDrop} aria-label={`Frame ${i}, ${f.type}-frame, ${state}. Toggle drop.`} style={{ cursor: "pointer" }}
                onClick={() => toggle(i)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(i); } }}>
                <rect x={x(i) - W / 2} y={BASE - ht} width={W} height={ht} fill={bad ? "url(#gop-hatch)" : "var(--lab)"} stroke={isDrop ? "var(--signal)" : "var(--ink)"} strokeWidth={isDrop ? 2.5 : 1} />
                <text x={x(i)} y={BASE - ht / 2 + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={bad ? "var(--ink)" : "var(--paper)"}>{f.type}</text>
                <text x={x(i)} y={BASE + 14} textAnchor="middle" fontSize="9" fill="var(--muted)">{i}</text>
                {bad && <text x={x(i)} y={BASE + 27} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--signal)">{isDrop ? "lost" : "✕"}</text>}
                {i === target && <path d={`M${x(i) - 5},${BASE + 34} L${x(i) + 5},${BASE + 34} L${x(i)},${BASE + 29} z`} fill="var(--ink)" />}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-1 text-[0.78rem] opacity-80">Key: filled = decodable; hatched with ✕ = undecodable; &quot;lost&quot; = dropped; dashed arrows = B-frame references; triangle = seek target; box height = illustrative relative size.</p>
      <StatGrid>
        <Stat label="Frames unusable" value={`${drops.size + lost} / ${frames.length}`} note={drops.size ? "until the next I-frame" : "click a frame"} />
        <Stat label={`Seek cost to frame ${target}`} value={String(seekCost)} unit="frames decoded" />
        <Stat label="Worst / average seek" value={`${stats.worstSeekFrames} / ${stats.avgSeekFrames.toFixed(1)}`} unit="frames" />
        <Stat label="I-frame share of GOP bytes" value={(stats.iShare * 100).toFixed(0)} unit="% (illustrative)" />
      </StatGrid>
    </LabShell>
  );
}
