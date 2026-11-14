"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { NumberField, Segmented, Slider, Stat, StatGrid } from "../controls";
import { usePlayer } from "../cdc/usePlayer";
import { outputBufferTimeline, MIB, SLOW_DURATION_SEC, STALL_START_SEC, type WritePolicy } from "@/lib/calc/realtime";

const D = { rate: 2000, size: 1000, drain: 5000, slow: 50, stall: 0, policy: "headOfLine" as WritePolicy, qLimit: 1000, hard: 32, soft: 8, softSec: 60, gap: 2 };
const W = 600;
const H = 150;
const QH = 50;
const policyText: Record<WritePolicy, string> = {
  headOfLine: "shared in-order writes (head-of-line)",
  dropOldest: "per-client queue, drop oldest",
  keepLatest: "per-client queue, keep latest per key",
  disconnectSlow: "per-client queue, disconnect slow client",
};
const mib = (b: number) => `${(b / MIB).toFixed(1)} MiB`;
const n0 = (n: number) => Math.round(n).toLocaleString("en-US");

export function SlowSubscriberExplorer() {
  const [rate, setRate] = useState(D.rate);
  const [size, setSize] = useState(D.size);
  const [drain, setDrain] = useState(D.drain);
  const [slow, setSlow] = useState(D.slow);
  const [stall, setStall] = useState(D.stall);
  const [policy, setPolicy] = useState<WritePolicy>(D.policy);
  const [qLimit, setQLimit] = useState(D.qLimit);
  const [hard, setHard] = useState(D.hard);
  const [soft, setSoft] = useState(D.soft);
  const [softSec, setSoftSec] = useState(D.softSec);
  const [gap, setGap] = useState(D.gap);
  const pl = usePlayer(SLOW_DURATION_SEC, 150);

  const v = outputBufferTimeline({
    incomingMsgsPerSec: rate, msgBytes: size, podDrainMsgsPerSec: drain, slowClientMsgsPerSec: slow, stallSec: stall, policy, queueLimit: qLimit,
    hardMiB: hard, softMiB: soft, softSeconds: softSec, resubscribeGapSec: gap,
  });
  const step = pl.step;
  const reset = () => {
    setRate(D.rate); setSize(D.size); setDrain(D.drain); setSlow(D.slow); setStall(D.stall); setPolicy(D.policy); setQLimit(D.qLimit);
    setHard(D.hard); setSoft(D.soft); setSoftSec(D.softSec); setGap(D.gap); pl.reset();
  };

  const yMax = Math.max(v.hardBytes * 1.15, v.maxBufferBytes, 1);
  const x = (i: number) => (i / (SLOW_DURATION_SEC - 1)) * W;
  const y = (b: number) => H - (b / yMax) * H;
  const area = `M0,${H} ` + v.bufferBytes.map((b, i) => `L${x(i).toFixed(1)},${y(b).toFixed(1)}`).join(" ") + ` L${W},${H} Z`;
  const qMax = Math.max(1, ...v.slowQueueMsgs);
  const qLine = v.slowQueueMsgs.map((q, i) => `${x(i).toFixed(1)},${(QH - (q / qMax) * QH).toFixed(1)}`).join(" ");
  const reveal = x(step);
  const softNow = v.softOverSec[step] ?? 0;
  const aria = `Second ${step + 1} of ${SLOW_DURATION_SEC}. Output buffer ${mib(v.bufferBytes[step] ?? 0)}; soft limit ${mib(v.softBytes)}, hard limit ${mib(v.hardBytes)}. Slow client queue ${n0(v.slowQueueMsgs[step] ?? 0)} messages. ${v.disconnectSec !== null ? `Redis disconnects the pod at second ${v.disconnectSec}.` : "Redis never disconnects the pod."}`;

  return (
    <LabShell
      id="lab-realtime-slowsub" label="Lab 3" title="Slow subscriber explorer" kind="simulation"
      objective="See how one slow client or a stalled pod fills Redis's Pub/Sub output buffer until the server disconnects the pod, and how per-client bounded queues contain the damage."
      assumptions={[
        "One-second ticks over 120 s. Arrival, drain and slow-client rates are uniform; message size is constant. The slow client is subscribed to the same feed as the whole pod.",
        "Kernel socket buffers and TCP windows are ignored; only Redis's per-client output buffer is modelled.",
        "Limits default to the documented client-output-buffer-limit pubsub 32mb 8mb 60 and are adjustable here. Redis's mb is 1024 x 1024 bytes, so this lab uses MiB throughout.",
        "Hard limit: disconnect in the second the buffer exceeds it. Soft limit: disconnect once the buffer has stayed above it for the configured number of consecutive seconds; a dip below resets the timer.",
        "On disconnect the buffered messages plus the messages published during the resubscribe gap are lost for every client on the pod; the buffer restarts empty. Repeated disconnects are counted.",
        "Keep-latest assumes 20 distinct keys, so the slow client's queue never exceeds 20 messages. Stall starts at t = 30 s.",
        "Redis allows a hard limit below the soft limit and treats 0 as disabled; 0 is not modelled here. A pod stall also pauses the slow client's feed.",
        "No real Redis, pod or client is involved.",
      ]}
      onReset={reset}
      summary={
        <p>
          {policyText[policy][0]?.toUpperCase()}{policyText[policy].slice(1)}: at {n0(rate)} msgs/s of {n0(size)} B the buffer peaks at {mib(v.maxBufferBytes)}
          {v.disconnectSec !== null
            ? `, crosses the ${v.disconnectReason} limit at t = ${v.disconnectSec} s and Redis closes the subscriber connection (${v.disconnectCount} time${v.disconnectCount === 1 ? "" : "s"} in 120 s). ${n0(v.lostMsgsAllClients)} messages are lost for every client on the pod.`
            : `, never reaches a limit, and no pod-wide loss occurs.`}
          {" "}{policy === "headOfLine" ? "Writes are in order on a shared loop, so the pod drains no faster than the slow client." : policy === "disconnectSlow" ? (v.slowClientDisconnected ? `The slow client is cut off at t = ${v.slowClientDisconnectSec} s.` : "The slow client stays under its queue limit.") : `Only the slow client loses messages (${n0(v.droppedMsgsSlowClient)} dropped).`}
          {" "}Playhead at t = {step + 1} s: buffer {mib(v.bufferBytes[step] ?? 0)}{softNow > 0 ? `, ${softNow} s above the soft limit` : ""}.
        </p>
      }
      controls={
        <>
          <NumberField label="Incoming rate to pod" unit="msgs/s" value={rate} min={100} max={50_000} step={100} onChange={setRate} />
          <NumberField label="Message size" unit="bytes" value={size} min={100} max={16_000} step={100} onChange={setSize} />
          <NumberField label="Pod drain capacity" unit="msgs/s" value={drain} min={100} max={100_000} step={100} onChange={setDrain} />
          <NumberField label="Slow client rate" unit="msgs/s" value={slow} min={0} max={2_000} step={10} onChange={setSlow} hint="0 means no slow client." />
          <Segmented label={`Pod stall at t = ${STALL_START_SEC} s`} value={stall} onChange={setStall} options={[{ value: 0, label: "none" }, { value: 5, label: "5 s" }, { value: 20, label: "20 s" }]} />
          <Segmented label="Write policy" value={policy} onChange={setPolicy} options={[{ value: "headOfLine", label: "shared, in-order" }, { value: "dropOldest", label: "drop oldest" }, { value: "keepLatest", label: "keep latest per key" }, { value: "disconnectSlow", label: "disconnect slow" }]} />
          <Slider label="Per-client queue limit" unit="msgs" value={qLimit} min={10} max={10_000} step={10} onChange={setQLimit} />
          <Slider label="Hard limit" unit="MiB" value={hard} min={1} max={128} onChange={setHard} hint="Redis default 32." />
          <Slider label="Soft limit" unit="MiB" value={soft} min={1} max={128} onChange={setSoft} hint="Redis default 8." />
          <Slider label="Soft limit duration" unit="s" value={softSec} min={1} max={120} onChange={setSoftSec} hint="Redis default 60." />
          <Slider label="Resubscribe gap" unit="s" value={gap} min={1} max={10} onChange={setGap} />
          <div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn lab-btn" onClick={pl.toggle}>{pl.playing ? "Pause" : "Play"}</button>
              <button type="button" className="btn lab-btn" onClick={pl.next}>Step</button>
              <button type="button" className="btn lab-btn" onClick={pl.reset}>Rewind</button>
            </div>
            <p className="text-[0.78rem] opacity-80 mt-1">{pl.reduced ? "Reduced motion is on: the playhead jumps. " : ""}Playback never starts on its own. Each step is one second.</p>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <svg viewBox={`0 0 ${W + 70} ${H + 150}`} width="100%" role="img" aria-label={aria}>
          <defs>
            <clipPath id="rt-slow-clip"><rect x="0" y="-5" width={reveal} height={H + 10} style={{ transition: "width 150ms linear" }} /></clipPath>
            <clipPath id="rt-slow-qclip"><rect x="0" y="-5" width={reveal} height={QH + 10} style={{ transition: "width 150ms linear" }} /></clipPath>
          </defs>
          <g transform="translate(0,10)">
            <rect x="0" y="0" width={W} height={H} fill="none" stroke="var(--rule)" />
            <g clipPath="url(#rt-slow-clip)"><path d={area} fill="var(--lab)" fillOpacity="0.35" stroke="var(--lab)" strokeWidth="1.5" /></g>
            <line x1="0" x2={W} y1={y(v.hardBytes)} y2={y(v.hardBytes)} stroke="var(--signal)" strokeWidth="1.5" strokeDasharray="6 4" />
            <text x={W + 4} y={y(v.hardBytes) + 3} fontSize="10" fill="var(--ink)">hard {hard}</text>
            <line x1="0" x2={W} y1={y(v.softBytes)} y2={y(v.softBytes)} stroke="var(--signal)" strokeWidth="1.5" />
            <text x={W + 4} y={y(v.softBytes) + 3} fontSize="10" fill="var(--ink)">soft {soft}</text>
            <text x="4" y="12" fontSize="10" fill="var(--ink)">Redis output buffer (MiB), 0 to {mib(yMax).replace(" MiB", "")}</text>
            {v.disconnectSecs.map((sec) => sec - 1 <= step && (
              <text key={sec} x={x(sec - 1)} y={H - 4} fontSize="12" fontWeight="700" textAnchor="middle" fill="var(--signal)">✕</text>
            ))}
            <line x1={reveal} x2={reveal} y1="0" y2={H} stroke="var(--ink)" strokeWidth="1" style={{ transition: "all 150ms linear" }} />
          </g>
          <g transform={`translate(0,${H + 30})`}>
            <text x="0" y="-4" fontSize="10" fill="var(--ink)">Soft-limit timer: {softNow} of {softSec} s</text>
            <rect x="0" y="0" width={W} height="8" fill="var(--rule)" />
            <rect x="0" y="0" width={Math.min(W, (softNow / softSec) * W)} height="8" fill="var(--signal)" style={{ transition: "width 150ms linear" }} />
          </g>
          <g transform={`translate(0,${H + 70})`}>
            <text x="0" y="-4" fontSize="10" fill="var(--ink)">Slow client queue (msgs, peak {n0(qMax)}){policy === "headOfLine" ? ": not used, backlog sits in Redis" : ""}</text>
            <rect x="0" y="0" width={W} height={QH} fill="none" stroke="var(--rule)" />
            <g clipPath="url(#rt-slow-qclip)"><polyline points={qLine} fill="none" stroke="var(--lab)" strokeWidth="1.5" /></g>
            <line x1={reveal} x2={reveal} y1="0" y2={QH} stroke="var(--ink)" strokeWidth="1" style={{ transition: "all 150ms linear" }} />
          </g>
          <text x="0" y={H + 140} fontSize="10" fill="var(--ink)">0 s</text>
          <text x={W} y={H + 140} fontSize="10" textAnchor="end" fill="var(--ink)">{SLOW_DURATION_SEC} s</text>
        </svg>
        <p className="text-[0.78rem] opacity-80">Dashed line: hard limit. Solid line: soft limit. ✕: Redis closed the subscriber connection. {aria}</p>

        <StatGrid>
          <Stat label="Time to disconnect" value={v.disconnectSec === null ? "none" : `${v.disconnectSec}`} unit={v.disconnectSec === null ? undefined : `s (${v.disconnectReason})`} />
          <Stat label="Disconnects in 120 s" value={String(v.disconnectCount)} />
          <Stat label="Lost for all clients" value={n0(v.lostMsgsAllClients)} unit="msgs" />
          <Stat label="Dropped, slow client" value={n0(v.droppedMsgsSlowClient)} unit="msgs" />
          <Stat label="Max buffer" value={mib(v.maxBufferBytes)} />
          <Stat label="Slow client disconnected" value={v.slowClientDisconnected ? "yes" : "no"} />
        </StatGrid>
      </div>
    </LabShell>
  );
}
