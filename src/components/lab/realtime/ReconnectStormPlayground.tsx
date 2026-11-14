"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { Segmented, Slider, Stat, StatGrid } from "../controls";
import { usePlayer } from "../cdc/usePlayer";
import {
  simulateStorm, stormStats, STORM_MAX_TICKS, STORM_PODS, STORM_ROOMS, STORM_CLIENTS,
  type ReconnectPolicy, type StormEvent, type StormParams,
} from "@/lib/calc/realtime";

const D = { event: "crash" as StormEvent, policy: "immediate" as ReconnectPolicy, cap: 8, limit: 3, bufferOn: true, buffer: 8 };
const POD_W = 98;
const GRID_Y = 58;
const LANE_Y = 272;
const eventText: Record<StormEvent, string> = { crash: "crash of pod-3", drain: "drain of pod-3", rolling: "rolling deploy" };
const policyText: Record<ReconnectPolicy, string> = { immediate: "immediate retry", fixed: "fixed 3-tick retry", jitter: "exponential backoff with full jitter" };

function Shape({ room, rejected }: { room: number; rejected: boolean }) {
  const s = rejected ? "var(--signal)" : "var(--lab)";
  return (
    <>
      {room === 0 && <circle r="5" fill={s} />}
      {room === 1 && <rect x="-4.5" y="-4.5" width="9" height="9" fill={s} />}
      {room === 2 && <polygon points="0,-5.5 5,4 -5,4" fill={s} />}
      {room === 3 && <polygon points="0,-6 5.5,0 0,6 -5.5,0" fill={s} />}
      {rejected && <text x="0" y="3.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--paper, #fff)">×</text>}
    </>
  );
}

export function ReconnectStormPlayground() {
  const [event, setEvent] = useState<StormEvent>(D.event);
  const [policy, setPolicy] = useState<ReconnectPolicy>(D.policy);
  const [cap, setCap] = useState(D.cap);
  const [limit, setLimit] = useState(D.limit);
  const [bufferOn, setBufferOn] = useState(D.bufferOn);
  const [buffer, setBuffer] = useState(D.buffer);
  const [triggerAt, setTriggerAt] = useState<number | null>(null);
  const pl = usePlayer(STORM_MAX_TICKS, 500);

  const params: StormParams = { event, policy, capTicks: cap, acceptLimit: limit, bufferMsgs: bufferOn ? buffer : null, triggerAt, seed: 7 };
  const s = simulateStorm(params, pl.step);
  const st = stormStats(s, params);
  const reset = () => { setEvent(D.event); setPolicy(D.policy); setCap(D.cap); setLimit(D.limit); setBufferOn(D.bufferOn); setBuffer(D.buffer); setTriggerAt(null); pl.reset(); };

  // stable slot per client within its pod, and in the reconnecting lane
  const slots = new Map<number, number>();
  const count = new Map<number, number>();
  for (const c of s.clients) { const k = count.get(c.pod) ?? 0; slots.set(c.id, k); count.set(c.pod, k + 1); }
  const pos = (c: (typeof s.clients)[number]) => {
    const k = slots.get(c.id) ?? 0;
    return c.pod < 0 ? { x: 16 + (k % 38) * 15, y: LANE_Y + 12 + Math.floor(k / 38) * 15 } : { x: c.pod * POD_W + 20 + (k % 5) * 15, y: GRID_Y + Math.floor(k / 5) * 15 };
  };
  const maxBar = Math.max(5, ...s.attemptsPerTick);
  const log = [...s.log].reverse();
  const eventLive = triggerAt !== null && triggerAt <= s.tick;
  const aria = `Tick ${s.tick + 1} of ${STORM_MAX_TICKS}. ${STORM_CLIENTS - st.waiting} of ${STORM_CLIENTS} clients connected; connections per pod: ${st.connectedPerPod.join(", ")}; ${st.waiting} waiting to reconnect.`;

  return (
    <LabShell
      id="lab-realtime-storm" label="Lab 2" title="Reconnect storm playground" kind="simulation"
      objective="Kill or drain a gateway pod and watch how reconnect policy shapes the reconnect spike, pod imbalance, and whether missed messages are replayed, resynced or lost."
      assumptions={[
        "Ticks are abstract time. Six pods, 120 clients in four rooms (shape = room), one publish per room per tick.",
        "The accept limit stands in for the TLS, auth, subscribe and history-read cost a pod can absorb per tick. Attempts above it are rejected and retried by the same policy.",
        "A draining pod closes 5 connections per tick and exits when empty; a crashed or drained pod is replaced after 3 ticks with zero connections.",
        "Reconnecting clients pick the less loaded of two random pods that are accepting connections (power of two choices).",
        "The replay buffer is a bounded per-room log like a Stream with MAXLEN. Missing more than the buffer means a full resync; with no buffer and no snapshot fetch, the messages are lost.",
        "A rolling deploy drains one pod every 5 ticks with no surge capacity; drains may overlap, so two pods can be down at once.",
        "Jitter policy: delay = floor(rand x min(cap, 4 x 2^attempt)) + 1 ticks. Randomness is seeded, so a given setup always replays identically. No real network.",
      ]}
      onReset={reset}
      summary={
        <p>
          Tick {s.tick + 1} of {STORM_MAX_TICKS}. {!eventLive ? `No event yet; press "Trigger event" to start a ${eventText[event]} at the current tick. Policy: ${policyText[policy]}, accept limit ${limit} per pod per tick.` : (
            <>
              {eventText[event][0]?.toUpperCase()}{eventText[event].slice(1)} with {policyText[policy]}: peak {st.peakAttempts} attempt{st.peakAttempts === 1 ? "" : "s"} in one tick against an accept limit of {limit} per pod,
              {" "}{st.rejected} rejected, {st.waiting === 0 ? `all clients back ${st.ticksToRecover !== null ? `after ${st.ticksToRecover} tick${st.ticksToRecover === 1 ? "" : "s"}` : ""}` : `${st.waiting} still waiting`}.
              {" "}{bufferOn ? `Replay buffer of ${buffer}: ${st.replayedMsgs} messages replayed, ${st.resyncClients} clients needed a full resync.` : `No replay buffer: ${st.lostMsgs} messages lost.`}
              {" "}Pod load max/mean {st.imbalance.toFixed(2)}.
            </>
          )}
        </p>
      }
      controls={
        <>
          <Segmented label="Event" value={event} onChange={setEvent} options={[{ value: "crash", label: "crash pod 3" }, { value: "drain", label: "drain pod 3" }, { value: "rolling", label: "rolling deploy" }]} />
          <Segmented label="Reconnect policy" value={policy} onChange={setPolicy} options={[{ value: "immediate", label: "immediate" }, { value: "fixed", label: "fixed 3 ticks" }, { value: "jitter", label: "backoff + jitter" }]} />
          <fieldset disabled={policy !== "jitter"} className={policy !== "jitter" ? "opacity-50" : ""}>
            <Slider label="Backoff cap" unit="ticks" value={cap} min={2} max={16} onChange={setCap} hint={policy !== "jitter" ? "Only used by the jitter policy." : undefined} />
          </fieldset>
          <Slider label="Accept limit per pod" unit="conns/tick" value={limit} min={2} max={40} onChange={setLimit} />
          <Segmented label="Replay buffer" value={bufferOn ? "on" : "off"} onChange={(x) => setBufferOn(x === "on")} options={[{ value: "off", label: "none (Pub/Sub only)" }, { value: "on", label: "per-room log" }]} />
          <fieldset disabled={!bufferOn} className={!bufferOn ? "opacity-50" : ""}>
            <Slider label="Buffer length" unit="msgs/room" value={buffer} min={0} max={20} onChange={setBuffer} />
          </fieldset>
          <div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn lab-btn" onClick={pl.toggle}>{pl.playing ? "Pause" : "Play"}</button>
              <button type="button" className="btn lab-btn" onClick={pl.next}>Step</button>
              <button type="button" className="btn lab-btn" onClick={() => setTriggerAt(pl.step)}>Trigger event</button>
            </div>
            <p className="text-[0.78rem] opacity-80 mt-1">{pl.reduced ? "Reduced motion is on: clients jump instead of gliding. " : ""}Playback never starts on its own. The event fires at the tick you are on.</p>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <svg viewBox="0 0 600 340" width="100%" role="img" aria-label={aria}>
          {Array.from({ length: STORM_PODS }, (_, i) => {
            const pod = s.pods[i];
            const n = st.connectedPerPod[i] ?? 0;
            const status = pod?.status ?? "up";
            return (
              <g key={i}>
                <rect x={i * POD_W + 6} y={4} width={POD_W - 8} height={252} fill="none" stroke={status === "up" ? "var(--rule)" : "var(--signal)"} strokeDasharray={status === "up" ? undefined : "4 3"} />
                <text x={i * POD_W + 12} y={20} fontSize="11" fontWeight="600" fill="var(--ink)">pod-{i + 1}</text>
                <text x={i * POD_W + 12} y={34} fontSize="10" fill="var(--ink)">{n} conn · {status}</text>
                <rect x={i * POD_W + 12} y={40} width={POD_W - 20} height={5} fill="var(--rule)" />
                <rect x={i * POD_W + 12} y={40} height={5} width={Math.min(POD_W - 20, (n / 40) * (POD_W - 20))} fill={status === "up" ? "var(--lab)" : "var(--signal)"} style={{ transition: "width 400ms" }} />
              </g>
            );
          })}
          <text x={10} y={LANE_Y} fontSize="11" fontWeight="600" fill="var(--ink)">Reconnecting ({st.waiting})</text>
          <line x1={6} x2={594} y1={LANE_Y + 4} y2={LANE_Y + 4} stroke="var(--rule)" />
          {s.clients.map((c) => {
            const { x, y } = pos(c);
            return (
              <g key={c.id} style={{ transform: `translate(${x}px, ${y}px)`, transition: "transform 450ms" }}>
                <Shape room={c.room % STORM_ROOMS} rejected={c.rejectedAt === s.tick && c.pod < 0} />
              </g>
            );
          })}
        </svg>
        <p className="text-[0.78rem] opacity-80">Shapes are rooms: circle A, square B, triangle C, diamond D. A client with an × was rejected this tick. {aria}</p>

        <div>
          <p className="font-medium text-[0.85rem]">Reconnect attempts per tick</p>
          <svg viewBox="0 0 410 64" width="100%" role="img" aria-label={`Attempts per tick, peak ${st.peakAttempts}`}>
            {Array.from({ length: STORM_MAX_TICKS }, (_, t) => {
              const v = s.attemptsPerTick[t] ?? 0;
              const h = (v / maxBar) * 50;
              return <rect key={t} x={4 + t * 10} y={56 - h} width={7} height={h} fill={v > limit * Math.max(1, s.pods.filter((p) => p.status === "up").length) ? "var(--signal)" : "var(--lab)"} style={{ transition: "y 300ms, height 300ms" }} />;
            })}
            <line x1="2" x2="408" y1="57" y2="57" stroke="var(--rule)" />
            <text x="4" y="10" fontSize="9" fill="var(--ink)">peak {st.peakAttempts}</text>
          </svg>
        </div>

        <StatGrid>
          <Stat label="Peak attempts" value={String(st.peakAttempts)} unit="per tick" />
          <Stat label="Ticks to reconnect all" value={st.ticksToRecover === null ? "-" : String(st.ticksToRecover)} note={st.waiting > 0 ? `${st.waiting} waiting` : undefined} />
          <Stat label="Rejected attempts" value={String(st.rejected)} />
          <Stat label="Messages replayed" value={String(st.replayedMsgs)} />
          <Stat label="Full resyncs" value={String(st.resyncClients)} unit="clients" />
          <Stat label="Messages lost" value={String(st.lostMsgs)} />
          <Stat label="Imbalance" value={st.imbalance.toFixed(2)} unit="max/mean" />
          <Stat label="Pod 3 status" value={s.pods[2]?.status ?? "up"} />
        </StatGrid>

        <div>
          <p className="font-medium text-[0.8rem]">Event log (newest first)</p>
          <ol className="max-h-44 overflow-y-auto border border-lab p-2 text-[0.75rem] font-mono space-y-0.5 break-words" tabIndex={0} aria-label="Reconnect storm event log">
            {log.length === 0 ? <li>nothing yet</li> : log.map((l, i) => <li key={`${log.length - i}`}>{l}</li>)}
          </ol>
        </div>
      </div>
    </LabShell>
  );
}
