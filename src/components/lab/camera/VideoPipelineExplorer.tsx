"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { Slider, Stat, StatGrid } from "../controls";
import { latencyBudget } from "@/lib/calc/camera";

type Stage = { name: string; does: string; buffering: string; failures: string[]; ms: number; max: number };
const STAGES: Stage[] = [
  { name: "Sensor / ISP / encoder", does: "Sensor exposes frames, the image signal processor handles exposure, white balance and noise reduction, then the encoder compresses to H.264/H.265 with the configured GOP and bitrate.", buffering: "Exposure time and encoder look-ahead / rate-control buffer (a long GOP with B-frames adds reorder delay).", failures: ["Over-exposed or blurred frames from a slow shutter", "Bitrate too low, so blocking", "Encoder overloaded and frames dropped at the source"], ms: 60, max: 300 },
  { name: "RTSP session", does: "Client sends DESCRIBE (get the SDP: codecs, tracks), SETUP (negotiate transport, UDP or TCP-interleaved), then PLAY. The camera replies with RTSP status codes.", buffering: "Session setup is a one-off cost at connect time rather than steady-state latency; it delays the first picture.", failures: ["401 Unauthorized: credentials wrong or missing", "404 Not Found: wrong stream path", "461 Unsupported Transport: requested transport refused", "454 Session Not Found: session timed out or keep-alive missed"], ms: 40, max: 500 },
  { name: "RTP packets", does: "Encoded frames are split into RTP packets (sequence numbers + timestamps) and sent over UDP, or interleaved in the RTSP TCP connection.", buffering: "Network transit and queueing; TCP adds head-of-line blocking after a loss, UDP drops instead.", failures: ["Packet loss over UDP: corrupted frames until the next I-frame", "Firewall/NAT blocks RTP ports", "Bursty congestion on shared links"], ms: 30, max: 400 },
  { name: "Jitter buffer", does: "Reorders packets by sequence number and smooths arrival jitter before frames are reassembled.", buffering: "Deliberate delay, the biggest tunable: bigger buffer = smoother but later, smaller = lower latency but more glitches.", failures: ["Buffer too small: late packets discarded", "Buffer too large: visible latency", "Sequence gaps leave incomplete frames"], ms: 100, max: 1000 },
  { name: "Demux", does: "Reassembles RTP payloads into complete access units (NAL units), picks out SPS/PPS parameter sets and tracks timestamps.", buffering: "Waits for a complete frame; may wait for a keyframe before starting.", failures: ["Missing SPS/PPS so the stream cannot start", "Timestamp discontinuities", "Unsupported payload format"], ms: 10, max: 200 },
  { name: "Decode", does: "Decoder turns compressed frames into raw pixels (software or hardware, e.g. a GPU decoder).", buffering: "Frame reorder (B-frames) and decoder queue depth.", failures: ["Unsupported codec profile/level", "Decoder cannot keep up, so the queue grows", "Reference loss makes corrupted output"], ms: 40, max: 500 },
  { name: "Frame extraction", does: "Selects frames for analytics: converts colour format, resizes, optionally skips frames to a target analytics FPS.", buffering: "Batching frames for the model; frame skipping trades latency for load.", failures: ["Colour-space or resize mistakes", "Wrong skip policy loses the one sharp frame", "Queue backlog when downstream is slow"], ms: 20, max: 300 },
  { name: "AI inference", does: "The detector/recogniser runs on each frame (or a batch) and emits boxes, labels or plate text.", buffering: "Batch accumulation plus model run time; queue wait when inference is slower than the frame arrival rate.", failures: ["Model slower than the incoming frame rate (backlog)", "Input too small or too blurry for the model", "GPU memory exhaustion"], ms: 50, max: 500 },
];
const DEFAULTS = STAGES.map((s) => s.ms);

export function VideoPipelineExplorer() {
  const [ms, setMs] = useState<number[]>(DEFAULTS);
  const [sel, setSel] = useState(0);
  const b = latencyBudget(ms);
  const st = STAGES[sel] ?? STAGES[0];
  const dom = STAGES[b.dominantIndex];
  if (!st || !dom) return null;
  return (
    <LabShell
      id="lab-camera-pipeline" label="Lab 3.D" title="Video pipeline explorer" kind="explorer"
      objective="Follow a frame from sensor to AI result, see where delay accumulates, and know what breaks at each stage."
      assumptions={[
        "Conceptual pipeline, not a live stream; no camera or network is involved.",
        "Millisecond values are editable illustrative placeholders, not measurements. Real values depend on camera, network, buffer settings, hardware and model.",
        "Stages are shown in a typical order; real systems may merge or skip stages (e.g. hardware decode straight into inference).",
        "RTSP status codes listed (401, 404, 454, 461) are standard RTSP response codes; cameras may reply differently or close the connection.",
      ]}
      onReset={() => { setMs(DEFAULTS); setSel(0); }}
      summary={
        <p>
          Illustrative end-to-end latency is {b.totalMs} ms. Largest contributor: {dom.name} ({b.ms[b.dominantIndex]} ms, {b.dominantSharePct.toFixed(0)}%). Selected stage: {st.name}. Reducing latency usually means shrinking the jitter buffer first, at the cost of more glitches on a lossy network.
        </p>
      }
      controls={<>
        <p className="text-[0.8rem] opacity-80">Per-stage delay (illustrative, ms)</p>
        {STAGES.map((s, i) => (
          <Slider key={s.name} label={s.name} unit="ms" value={ms[i] ?? 0} min={0} max={s.max} step={5} onChange={(v) => setMs((p) => p.map((x, j) => (j === i ? v : x)))} />
        ))}
      </>}
    >
      <nav aria-label="Pipeline stages"><ol className="flex flex-wrap gap-1">
        {STAGES.map((s, i) => (
          <li key={s.name} className="flex items-center gap-1">
            <button type="button" className="btn lab-btn" aria-pressed={i === sel} onClick={() => setSel(i)}>{i + 1}. {s.name}</button>
            {i < STAGES.length - 1 && <span aria-hidden="true">→</span>}
          </li>
        ))}
      </ol></nav>
      <div className="mt-3 border border-lab p-3">
        <h4 className="font-semibold">{sel + 1}. {st.name}</h4>
        <p className="mt-1"><span className="font-medium">What it does.</span> {st.does}</p>
        <p className="mt-1"><span className="font-medium">Where latency builds up.</span> {st.buffering}</p>
        <p className="mt-1 font-medium">Failure modes</p>
        <ul className="list-disc pl-5">{st.failures.map((f) => <li key={f}>{f}</li>)}</ul>
      </div>
      <div className="mt-4">
        <p className="font-medium">Latency budget (illustrative)</p>
        <svg viewBox="0 0 400 34" style={{ width: "100%" }} role="img" aria-label={`Stacked latency bar totalling ${b.totalMs} milliseconds; largest stage ${dom.name}`}>
          {b.ms.map((v, i) => {
            const x0 = b.totalMs ? ((b.cumulativeMs[i] ?? 0) - v) / b.totalMs * 400 : 0, w = b.totalMs ? v / b.totalMs * 400 : 0;
            return <g key={i}><rect x={x0} y={2} width={w} height={22} fill={i === sel ? "var(--lab)" : "var(--paper-3)"} stroke="var(--ink)" strokeWidth="0.75" />
              {w > 14 && <text x={x0 + w / 2} y={17} textAnchor="middle" fontSize="10" fill={i === sel ? "var(--paper)" : "var(--ink)"}>{i + 1}</text>}</g>;
          })}
        </svg>
        <div className="overflow-x-auto"><table className="num w-full text-[0.8rem]"><caption className="sr-only">Latency per stage and cumulative</caption>
          <thead><tr><th className="text-left">Stage</th><th className="text-right">ms</th><th className="text-right">Cumulative ms</th></tr></thead>
          <tbody>{STAGES.map((s, i) => <tr key={s.name} className="border-t border-lab"><td>{i + 1}. {s.name}{i === b.dominantIndex ? " (largest)" : ""}</td><td className="text-right">{b.ms[i]}</td><td className="text-right">{b.cumulativeMs[i]}</td></tr>)}</tbody></table></div>
      </div>
      <StatGrid><Stat label="Total (illustrative)" value={String(b.totalMs)} unit="ms" /><Stat label="Largest stage" value={dom.name} note={`${b.dominantSharePct.toFixed(0)}% of total`} /></StatGrid>
    </LabShell>
  );
}
