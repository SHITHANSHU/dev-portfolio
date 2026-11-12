"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { Slider } from "../controls";
import { usePlayer } from "../cdc/usePlayer";
import { simulateDelivery, type ConsumerRow } from "@/lib/calc/redis";

const D = { messages: 10, consumers: 2, offFrom: 3, offTicks: 4, crash: false, timeout: 3 };

function Table({ title, rows, streams }: { title: string; rows: ConsumerRow[]; streams: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[0.8rem] num">
        <caption className="text-left font-medium pb-1">{title}</caption>
        <thead><tr className="border-b border-lab text-left">
          <th scope="col" className="pr-2">{streams ? "Consumer" : "Subscriber"}</th><th scope="col" className="pr-2">Delivered</th>
          <th scope="col" className="pr-2">Missed</th><th scope="col" className="pr-2">Pending</th><th scope="col">Duplicates</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-lab">
              <th scope="row" className="pr-2 font-normal">{r.name}{r.online ? "" : " (offline)"}</th>
              <td className="pr-2">{r.delivered}</td><td className="pr-2">{r.missed}</td><td className="pr-2">{r.pending}</td><td>{r.duplicates}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Log = ({ title, lines }: { title: string; lines: string[] }) => (
  <div>
    <p className="font-medium text-[0.8rem]">{title}</p>
    <ol className="max-h-44 overflow-y-auto border border-lab p-2 text-[0.75rem] font-mono space-y-0.5 break-words" tabIndex={0} aria-label={title}>
      {lines.length === 0 ? <li>nothing yet</li> : lines.map((l, i) => <li key={i}>{l}</li>)}
    </ol>
  </div>
);

export function RedisPubSubVsStreams() {
  const [messages, setMessages] = useState(D.messages);
  const [consumers, setConsumers] = useState(D.consumers);
  const [offFrom, setOffFrom] = useState(D.offFrom);
  const [offTicks, setOffTicks] = useState(D.offTicks);
  const [crash, setCrash] = useState(D.crash);
  const [timeout, setTimeoutTicks] = useState(D.timeout);
  const params = { messages, consumers, offlineFrom: offFrom, offlineTicks: offTicks, crashBeforeAck: crash, ackTimeout: timeout };
  const total = simulateDelivery(params).lastTick + 1;
  const pl = usePlayer(total, 900);
  const step = Math.min(pl.step, total - 1);
  const r = simulateDelivery(params, step);
  const reset = () => { setMessages(D.messages); setConsumers(D.consumers); setOffFrom(D.offFrom); setOffTicks(D.offTicks); setCrash(D.crash); setTimeoutTicks(D.timeout); pl.reset(); };
  const done = step >= total - 1;

  return (
    <LabShell
      id="lab-redis-pubsub-streams" label="Lab" title="Pub/Sub vs Streams delivery" kind="simulation"
      objective="Compare fire-and-forget Pub/Sub with a Streams consumer group when a consumer goes offline or crashes before acknowledging."
      assumptions={[
        "Synthetic tick-based model: one message is produced per tick; each consumer handles at most one entry per tick and acks on the next tick.",
        "Only consumer 1 goes offline. With the crash toggle on, it reads an entry at the start of its offline window and dies before XACK, having already applied the effect, so the redelivery is a duplicate.",
        "Pub/Sub keeps nothing: a subscriber that is offline simply never sees the message, and every online subscriber gets its own copy (fan-out).",
        "Stream entries stay in the log; the group tracks a pending entries list (PEL). XAUTOCLAIM takes entries idle for at least the ack timeout and hands them to an online consumer (delivery is at-least-once, so duplicates are possible).",
        "Not modelled: stream trimming, consumer-group creation races, blocking reads, replication. Async replication can lose acknowledged writes on failover; WAIT reduces but does not eliminate that.",
      ]}
      onReset={reset}
      summary={
        <p>
          Tick {step + 1} of {total}. Pub/Sub: {r.pubsub.totalMissed} delivery{r.pubsub.totalMissed === 1 ? "" : "ies"} missed by the offline subscriber, unrecoverable.
          Streams: {r.streams.neverDelivered === 0 ? "no entry is left undelivered" : `${r.streams.neverDelivered} entries still waiting in the log`}, {r.streams.acked} acked, {r.streams.pendingTotal} pending, {r.streams.redeliveries} redelivered via XAUTOCLAIM
          {crash && offTicks > 0 ? ", with duplicates possible because the crashed consumer may already have processed the entry" : ""}.
          {done ? "" : " Press Step or Play to continue."}
        </p>
      }
      controls={
        <>
          <Slider label="Messages" value={messages} min={1} max={30} onChange={setMessages} />
          <Slider label="Consumers / subscribers" value={consumers} min={1} max={4} onChange={setConsumers} />
          <Slider label="Consumer 1 offline from tick" value={offFrom} min={0} max={29} onChange={setOffFrom} />
          <Slider label="Offline window" unit="ticks" value={offTicks} min={0} max={30} onChange={setOffTicks} hint="0 means it never goes offline." />
          <Slider label="Ack timeout (XAUTOCLAIM min idle)" unit="ticks" value={timeout} min={1} max={20} onChange={setTimeoutTicks} />
          <label className="flex items-center gap-2 min-h-9">
            <input type="checkbox" checked={crash} onChange={(e) => setCrash(e.target.checked)} />
            <span className="font-medium">Consumer 1 crashes before XACK</span>
          </label>
          <div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn lab-btn" onClick={pl.toggle}>{pl.playing ? "Pause" : "Play"}</button>
              <button type="button" className="btn lab-btn" onClick={pl.next}>Step</button>
              <button type="button" className="btn lab-btn" onClick={pl.reset}>Rewind</button>
            </div>
            <p className="text-[0.78rem] opacity-80 mt-1">{pl.reduced ? "Reduced motion is on: Play still only advances discrete steps. " : ""}Playback never starts on its own.</p>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section aria-label="Pub/Sub">
          <h4 className="font-semibold">Pub/Sub: at-most-once, no history</h4>
          <Table title="Per-subscriber deliveries" rows={r.pubsub.rows} streams={false} />
          <Log title="Pub/Sub log" lines={r.pubsub.log} />
        </section>
        <section aria-label="Streams">
          <h4 className="font-semibold">Streams + consumer group: at-least-once</h4>
          <Table title="Per-consumer deliveries (group)" rows={r.streams.rows} streams />
          <Log title="Streams log" lines={r.streams.log} />
        </section>
      </div>
    </LabShell>
  );
}
