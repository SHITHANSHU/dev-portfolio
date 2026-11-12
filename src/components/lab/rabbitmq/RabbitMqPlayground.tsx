"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LabShell } from "../LabShell";
import { Segmented, Slider } from "../controls";

type ExchangeType = "direct" | "topic" | "fanout";
type QueueName = "workers" | "billing" | "audit";
type DeliveryState = "delayed" | "ready" | "delivered";
type RoutedCopy = { queue: QueueName; state: DeliveryState; dueAt: number };
type Message = { id: number; key: string; priority: number; publishedAt: number; exchange: ExchangeType; copies: RoutedCopy[]; unroutable: boolean };

const queueNames: QueueName[] = ["workers", "billing", "audit"];
const queueTitles: Record<QueueName, string> = { workers: "jobs.workers", billing: "jobs.billing", audit: "jobs.audit" };
const bindingText: Record<ExchangeType, Record<QueueName, string>> = {
  direct: { workers: "orders.created", billing: "orders.paid", audit: "orders.cancelled" },
  topic: { workers: "orders.*", billing: "orders.paid", audit: "orders.#" },
  fanout: { workers: "all keys", billing: "all keys", audit: "all keys" },
};
const EXCHANGES = [
  { value: "direct", label: "Direct" },
  { value: "topic", label: "Topic" },
  { value: "fanout", label: "Fanout" },
] as const;

function topicMatches(pattern: string, key: string): boolean {
  const p = pattern.split(".");
  const k = key.split(".");
  const visit = (pi: number, ki: number): boolean => {
    if (pi === p.length) return ki === k.length;
    const patternPart = p[pi];
    if (patternPart === undefined) return ki === k.length;
    if (patternPart === "#") return visit(pi + 1, ki) || (ki < k.length && visit(pi, ki + 1));
    const keyPart = k[ki];
    return keyPart !== undefined && (patternPart === "*" || patternPart === keyPart) && visit(pi + 1, ki + 1);
  };
  return visit(0, 0);
}

function route(exchange: ExchangeType, key: string): QueueName[] {
  if (exchange === "fanout") return [...queueNames];
  return queueNames.filter((queue) => exchange === "direct"
    ? bindingText.direct[queue] === key
    : topicMatches(bindingText.topic[queue], key));
}

function sampleMessages(): Message[] {
  const samples = [
    { id: 1, key: "orders.created", priority: 1, delay: 0 },
    { id: 2, key: "orders.created", priority: 4, delay: 0 },
    { id: 3, key: "orders.paid", priority: 3, delay: 3 },
  ];
  return samples.map((m): Message => {
    const state: DeliveryState = m.delay > 0 ? "delayed" : "ready";
    return {
      id: m.id, key: m.key, priority: m.priority, publishedAt: 0, exchange: "topic",
      copies: route("topic", m.key).map((queue) => ({ queue, state, dueAt: m.delay })),
      unroutable: false,
    };
  });
}

function initialEvents() {
  return [
    "t=0 · m1 published to topic; orders.created → workers + audit (priority 1)",
    "t=0 · m2 published to topic; orders.created → workers + audit (priority 4)",
    "t=0 · m3 published to topic; orders.paid → billing (priority 3, TTL 3 ticks)",
  ];
}

export function RabbitMqPlayground() {
  const [exchange, setExchange] = useState<ExchangeType>("topic");
  const [routingKey, setRoutingKey] = useState("orders.created");
  const [priority, setPriority] = useState(2);
  const [delay, setDelay] = useState(0);
  const [tick, setTick] = useState(0);
  const [messages, setMessages] = useState<Message[]>(sampleMessages);
  const [events, setEvents] = useState<string[]>(initialEvents);
  const [playing, setPlaying] = useState(false);
  const nextId = useRef(4);

  const publish = () => {
    const id = nextId.current++;
    const key = routingKey.trim();
    const targets = route(exchange, key);
    const state: DeliveryState = delay > 0 ? "delayed" : "ready";
    const next: Message = {
      id, key: key || "(empty)", priority, publishedAt: tick, exchange,
      copies: targets.map((queue) => ({ queue, state, dueAt: tick + delay })),
      unroutable: targets.length === 0,
    };
    setMessages((current) => [...current, next]);
    setEvents((current) => [`t=${tick} · m${id} published to ${exchange}; ${next.key} → ${targets.length ? targets.join(" + ") : "unroutable (mandatory return)"}${delay > 0 && targets.length ? `; TTL ${delay} ticks` : ""}; priority ${priority}`, ...current].slice(0, 30));
  };

  const advance = useCallback(() => {
    const nextTick = tick + 1;
    const actions: string[] = [];
    const next = messages.map((message) => ({
      ...message,
      copies: message.copies.map((copy) => {
        if (copy.state !== "delayed" || copy.dueAt > nextTick) return { ...copy };
        actions.push(`t=${nextTick} · m${message.id} TTL elapsed; DLX routed to ${queueTitles[copy.queue]}`);
        return { ...copy, state: "ready" as const };
      }),
    }));
    for (const queue of queueNames) {
      const candidate = next
        .flatMap((message) => message.copies.map((copy) => ({ message, copy })))
        .filter(({ copy }) => copy.queue === queue && copy.state === "ready")
        .sort((a, b) => b.message.priority - a.message.priority || a.message.id - b.message.id)[0];
      if (!candidate) continue;
      candidate.copy.state = "delivered";
      actions.push(`t=${nextTick} · ${queueTitles[queue]} delivered m${candidate.message.id} (priority ${candidate.message.priority})`);
    }
    setTick(nextTick);
    setMessages(next);
    if (actions.length) setEvents((old) => [...actions.reverse(), ...old].slice(0, 30));
  }, [messages, tick]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const active = messages.some((message) => message.copies.some((copy) => copy.state === "ready" || copy.state === "delayed"));
      if (!active) { setPlaying(false); return; }
      advance();
    }, 900);
    return () => window.clearInterval(timer);
  }, [advance, messages, playing]);

  const reset = () => {
    setPlaying(false); setExchange("topic"); setRoutingKey("orders.created"); setPriority(2); setDelay(0);
    setTick(0); setMessages(sampleMessages()); setEvents(initialEvents()); nextId.current = 4;
  };

  const allCopies = messages.flatMap((message) => message.copies.map((copy) => ({ message, copy })));
  const readyCount = allCopies.filter(({ copy }) => copy.state === "ready").length;
  const delayedCount = allCopies.filter(({ copy }) => copy.state === "delayed").length;
  const deliveredCount = allCopies.filter(({ copy }) => copy.state === "delivered").length;

  return (
    <LabShell
      id="lab-rabbitmq-routing-priority-delay" label="Lab" title="RabbitMQ routing and delay playground" kind="simulation"
      objective="Publish synthetic messages, inspect which queues each exchange routes to, then step time to watch TTL dead-lettering and priority dispatch."
      assumptions={[
        "Each tick represents one illustrative second. The three starting messages are synthetic examples routed through a topic exchange.",
        "Bindings are fixed: workers uses orders.created (direct) or orders.* (topic), billing uses orders.paid, and audit uses orders.cancelled (direct) or orders.# (topic). Fanout copies to all three queues and ignores the key.",
        "Classic-style priority is modeled as 0–4. At most one ready message per queue is dispatched on each tick, ordered by higher priority and then enqueue order. This omits consumer prefetch, concurrency and redelivery effects.",
        "A positive TTL puts a message in a fixed-delay holding state. On expiry it is dead-lettered to its matched work queue. The model assumes routing and dead-letter delivery succeed; it does not model the default at-most-once DLX loss window or quorum at-least-once dead lettering.",
        "This is a deterministic teaching model, not a RabbitMQ broker, wall-clock scheduler, benchmark or delivery guarantee. Queue durability, publisher confirms and consumer acknowledgements are not simulated.",
      ]}
      onReset={reset}
      summary={<p>Tick {tick}. {readyCount} routed message {readyCount === 1 ? "copy is" : "copies are"} ready, {delayedCount} waiting in TTL queues, and {deliveredCount} dispatched. Priority changes the next ready delivery in each queue; it cannot preempt work already delivered.</p>}
      controls={
        <>
          <Segmented label="Exchange type for new messages" value={exchange} options={EXCHANGES} onChange={setExchange} />
          <div>
            <label htmlFor="rabbit-routing-key" className="font-medium block">Routing key</label>
            <input id="rabbit-routing-key" className="mt-1 w-full border border-lab bg-paper px-2 py-1 text-ink font-mono text-sm min-h-9" value={routingKey} onChange={(event) => setRoutingKey(event.currentTarget.value)} />
            <p className="text-[0.78rem] opacity-80 mt-1">Try <code>orders.paid</code> or <code>orders.created.eu</code>.</p>
          </div>
          <Slider label="Message priority" value={priority} min={0} max={4} onChange={setPriority} hint="Classic queue example, x-max-priority = 4." />
          <Slider label="Delay queue TTL" unit="ticks" value={delay} min={0} max={10} onChange={setDelay} hint="0 sends directly to matched work queues." />
          <button type="button" className="btn lab-btn w-full" onClick={publish}>Publish message</button>
          <div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn lab-btn" onClick={() => { setPlaying((value) => !value); }}>{playing ? "Pause" : "Play"}</button>
              <button type="button" className="btn lab-btn" onClick={() => { setPlaying(false); advance(); }}>Step 1 tick</button>
            </div>
            <p className="text-[0.78rem] opacity-80 mt-1">Playback starts only when selected. Each step releases expired copies, then dispatches the highest-priority ready copy in each queue.</p>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <section aria-label="Exchange bindings">
          <h4 className="font-semibold mb-2">Bindings · {exchange} exchange for new publishes</h4>
          <div className="grid gap-2 sm:grid-cols-3">
            {queueNames.map((queue) => (
              <div key={queue} className="border border-lab bg-paper px-3 py-2 text-sm">
                <p className="font-mono font-medium">{queueTitles[queue]}</p>
                <p className="text-muted mt-1">{exchange === "fanout" ? "every published message" : `binding: ${bindingText[exchange][queue]}`}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Queue states">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="font-semibold">Queue state at tick {tick}</h4>
            <span className="meta">TTL queue → work queue → delivered</span>
          </div>
          <section aria-label="TTL holding queues" className="mt-2 border border-signal bg-signal/5 p-3">
            <h5 className="font-mono text-sm font-semibold">TTL holding queues</h5>
            {allCopies.filter(({ copy }) => copy.state === "delayed").length === 0
              ? <p className="text-sm text-muted mt-2">No messages waiting for expiry.</p>
              : <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {allCopies.filter(({ copy }) => copy.state === "delayed").map(({ message, copy }) => (
                  <li key={`${message.id}-${copy.queue}-delay`} className="border border-signal bg-paper px-2 py-1.5 text-[0.78rem]">
                    <p className="font-mono">m{message.id} · priority {message.priority} · TTL queue {copy.dueAt - message.publishedAt}s</p>
                    <p className="mt-1 break-all">{message.key} · expires at tick {copy.dueAt} → {queueTitles[copy.queue]}</p>
                  </li>
                ))}
              </ul>}
          </section>
          <div className="grid gap-3 mt-2 lg:grid-cols-3">
            {queueNames.map((queue) => {
              const lane = messages.flatMap((message) => message.copies
                .filter((copy) => copy.queue === queue && copy.state !== "delayed")
                .map((copy) => ({ message, copy })))
                .sort((a, b) => a.message.id - b.message.id);
              return (
                <section key={queue} aria-label={queueTitles[queue]} className="border border-lab p-3 min-h-36">
                  <h5 className="font-mono text-sm font-semibold">{queueTitles[queue]}</h5>
                  {lane.length === 0 ? <p className="text-sm text-muted mt-3">No matching messages.</p> : (
                    <ul className="mt-2 space-y-2">
                      {lane.map(({ message, copy }) => (
                        <li key={`${message.id}-${queue}`} className={`border px-2 py-1.5 text-[0.78rem] transition-colors ${copy.state === "delivered" ? "border-rule bg-paper-2 opacity-70" : copy.state === "delayed" ? "border-signal bg-signal/10" : "border-lab bg-lab-soft"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono">m{message.id} · p{message.priority}</span>
                            <span className="uppercase tracking-wide">{copy.state}</span>
                          </div>
                          <p className="mt-1 break-all">{message.exchange} · {message.key}{copy.state === "delayed" ? ` · due tick ${copy.dueAt}` : ""}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </section>

        <section aria-label="Simulation event log">
          <h4 className="font-semibold mb-2">Event log</h4>
          <ol className="max-h-40 overflow-y-auto border border-lab bg-paper p-2 font-mono text-[0.72rem] space-y-1" tabIndex={0} aria-label="RabbitMQ simulation events">
            {events.map((event, index) => <li key={`${index}-${event}`}>{event}</li>)}
          </ol>
        </section>
      </div>
    </LabShell>
  );
}
