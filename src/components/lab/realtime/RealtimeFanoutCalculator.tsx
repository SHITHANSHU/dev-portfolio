"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { NumberField, Segmented, Slider, Stat, StatGrid } from "../controls";
import { fmtBytesDecimal } from "@/lib/calc/redis";
import { fanoutModel, samplePublishPods, REDIS_MAXCLIENTS, type Routing, type Strategy, type Topology, type Bottleneck } from "@/lib/calc/realtime";

const D = { pods: 200, members: 40, rooms: 50_000, rate: 20_000, bytes: 500, strategy: "perRoom" as Strategy, routing: "roundRobin" as Routing, topology: "standalone" as Topology, shards: 6, replicas: 1, memKB: 20 };

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const fmt = (n: number) => (n >= 100 ? Math.round(n).toLocaleString("en-US") : nf.format(n));
const MAX_CELLS = 200;
const LOG_MAX = 9; // bars span 10^0 .. 10^9
const barPct = (v: number) => Math.min(100, (Math.log10(1 + Math.max(0, v)) / LOG_MAX) * 100);

const bottleneckText: Record<Bottleneck, string> = {
  clientEgress: "client egress per pod (unavoidable, same for every strategy)",
  redisEgress: "Redis delivery volume",
  redisPublishCpu: "Redis publish handling",
  connections: "connection counts",
};

export function RealtimeFanoutCalculator() {
  const [pods, setPods] = useState(D.pods);
  const [members, setMembers] = useState(D.members);
  const [rooms, setRooms] = useState(D.rooms);
  const [rate, setRate] = useState(D.rate);
  const [bytes, setBytes] = useState(D.bytes);
  const [strategy, setStrategy] = useState<Strategy>(D.strategy);
  const [routing, setRouting] = useState<Routing>(D.routing);
  const [topology, setTopology] = useState<Topology>(D.topology);
  const [shards, setShards] = useState(D.shards);
  const [replicas, setReplicas] = useState(D.replicas);
  const [memKB, setMemKB] = useState(D.memKB);
  const [seed, setSeed] = useState(1);

  const v = fanoutModel({ pods, membersPerRoom: members, rooms, publishesPerSec: rate, payloadBytes: bytes, strategy, routing, topology, shards, replicas, connMemKB: memKB });
  const hit = samplePublishPods(pods, members, routing, seed);
  const cells = Math.min(pods, MAX_CELLS);
  const per = pods / cells;
  const lit = new Set(hit.map((i) => Math.min(cells - 1, Math.floor(i / per))));
  const cols = Math.min(cells, 20);
  const rowsN = Math.ceil(cells / cols);
  const cell = 14;
  const gridH = rowsN * cell + 4;

  const bars = [
    { key: "redisEgress", label: "Redis deliveries", unit: "msgs/s", value: v.redisEgressMsgsPerSec, hot: v.bottleneck === "redisEgress" },
    { key: "publish", label: "Publish handling per primary", unit: "msgs/s", value: v.perPrimaryPublishesPerSec, hot: v.bottleneck === "redisPublishCpu" },
    { key: "ingress", label: "Per-pod Redis ingress", unit: "msgs/s", value: v.perPodIngressMsgsPerSec, hot: false },
    { key: "bus", label: "Cluster-bus traffic", unit: "msgs/s", value: v.clusterBusMsgsPerSec, hot: false },
    { key: "client", label: "Per-pod client egress", unit: "msgs/s", value: v.perPodClientEgressMsgsPerSec, hot: v.bottleneck === "clientEgress" },
  ];
  const strat = { perConnection: "per-connection subscriptions", global: "a global channel", perRoom: "per-room, pod-coalesced subscriptions" }[strategy];
  const reset = () => {
    setPods(D.pods); setMembers(D.members); setRooms(D.rooms); setRate(D.rate); setBytes(D.bytes); setStrategy(D.strategy); setRouting(D.routing);
    setTopology(D.topology); setShards(D.shards); setReplicas(D.replicas); setMemKB(D.memKB); setSeed(1);
  };
  const aria = `${hit.length} of ${pods} pods ${strategy === "perConnection" ? "host members that each get a delivery for" : "receive"} one sample publish${strategy === "global" ? `; the other ${pods - hit.length} also receive it and discard it` : ""}.`;

  return (
    <LabShell
      id="lab-realtime-fanout" label="Lab 1" title="Fan-out cost calculator" kind="calculator"
      objective="See how Redis deliveries, per-pod ingress and client egress grow with pod count under each subscription strategy and routing policy, and where the bottleneck moves."
      assumptions={[
        "Under round-robin routing, each member lands on a uniformly random pod; under room affinity, a room lives on min(P, ceil(M / 50,000)) pods, where 50,000 connections is an illustrative per-pod capacity.",
        "One room per client, so connections C = rooms x members per room. Every room publishes at the same rate.",
        "Channels hash uniformly across shards; no message batching, pipelining or compression.",
        "Per-connection memory is an input you choose, not a fact about any runtime. Measure yours.",
        "The bottleneck tag ranks relative load against arbitrary round reference scales (100,000 msgs/s on one process, 10,000 subscriber connections per node, 50,000 sockets per pod). It is not a capacity claim.",
        "Sizes are decimal (kB = 1000 B). Nothing here talks to a real Redis or network.",
      ]}
      onReset={reset}
      summary={
        <p>
          With {pods} pods, {fmt(v.connections)} connections and {strat} under {routing === "affinity" ? "room-affinity" : "round-robin"} routing, each publish reaches {fmt(v.deliveriesPerPublish)} {strategy === "perConnection" ? "subscriptions" : "pods"} on average
          ({fmt(v.redisEgressMsgsPerSec)} Redis deliveries/s, {fmtBytesDecimal(v.redisEgressBytesPerSec)}/s). {strategy === "global" ? `Each pod discards ${Math.round(v.wastedFraction * 100)}% of what it receives. ` : ""}
          Clients still receive {fmt(v.clientEgressMsgsPerSec)} msgs/s in total, {fmt(v.perPodClientEgressMsgsPerSec)} per pod. Busiest tier by this model: {bottleneckText[v.bottleneck]}.
          {v.exceedsMaxclients ? ` Subscriber connections per Redis node (${fmt(v.subscriberConnectionsPerNode)}) exceed the default maxclients of ${REDIS_MAXCLIENTS.toLocaleString("en-US")}.` : ""}
        </p>
      }
      controls={
        <>
          <Slider label="Pods (P)" value={pods} min={3} max={1000} onChange={setPods} />
          <NumberField label="Members per room (M)" value={members} min={1} max={100_000} onChange={setMembers} />
          <NumberField label="Rooms (N)" value={rooms} min={1} max={1_000_000} onChange={setRooms} />
          <NumberField label="Publishes per second (R)" unit="msgs/s" value={rate} min={1} max={1_000_000} step={1000} onChange={setRate} />
          <NumberField label="Payload (B)" unit="bytes" value={bytes} min={50} max={64_000} step={50} onChange={setBytes} />
          <Segmented label="Subscription strategy" value={strategy} onChange={setStrategy} options={[{ value: "perConnection", label: "per-connection" }, { value: "global", label: "global channel" }, { value: "perRoom", label: "per-room, coalesced" }]} />
          <Segmented label="Routing" value={routing} onChange={setRouting} options={[{ value: "roundRobin", label: "round-robin" }, { value: "affinity", label: "room affinity" }]} />
          <Segmented label="Redis topology" value={topology} onChange={setTopology} options={[{ value: "standalone", label: "standalone" }, { value: "clusterClassic", label: "cluster classic" }, { value: "clusterSharded", label: "cluster sharded" }]} />
          {topology !== "standalone" && (
            <>
              <Slider label="Shards (S)" value={shards} min={1} max={64} onChange={setShards} />
              <Slider label="Replicas per primary (r)" value={replicas} min={0} max={2} onChange={setReplicas} />
            </>
          )}
          <NumberField label="Memory per connection" unit="kB, illustrative" value={memKB} min={1} max={1000} onChange={setMemKB} hint="Illustrative input: measure your own runtime." />
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-[0.85rem]">One sample publish{per > 1 ? ` (1 cell = ${Math.ceil(per)} pods)` : ""}</p>
            <button type="button" className="btn lab-btn" onClick={() => setSeed((s) => s + 1)}>Publish sample</button>
          </div>
          <svg viewBox={`0 0 ${cols * cell + 4} ${gridH}`} width="100%" style={{ maxHeight: 220 }} role="img" aria-label={aria} className="mt-1">
            <defs>
              <pattern id="rt-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="4" stroke="var(--signal)" strokeWidth="1.5" />
              </pattern>
            </defs>
            {Array.from({ length: cells }, (_, i) => {
              const on = lit.has(i);
              const wasted = !on && strategy === "global";
              return (
                <rect key={i} x={2 + (i % cols) * cell} y={2 + Math.floor(i / cols) * cell} width={cell - 2} height={cell - 2}
                  fill={on ? "var(--lab)" : wasted ? "url(#rt-hatch)" : "transparent"} stroke={on ? "var(--lab)" : wasted ? "var(--signal)" : "var(--rule)"} strokeWidth="1"
                  style={{ transition: "fill 400ms, stroke 400ms" }} />
              );
            })}
          </svg>
          <p className="text-[0.78rem] opacity-80">Filled: pod has a member and delivers to clients. Hatched: pod received the message and discards it (global channel). Outline: untouched. {aria}</p>
        </div>

        <div>
          <p className="font-medium text-[0.85rem]">Load per tier (log scale, 1 to 1,000,000,000)</p>
          <ul className="space-y-2 mt-1">
            {bars.map((b) => (
              <li key={b.key}>
                <div className="flex justify-between gap-2 text-[0.8rem]">
                  <span>{b.label}{b.hot ? <strong style={{ color: "var(--signal)" }}> · bottleneck</strong> : null}</span>
                  <span className="num">{fmt(b.value)} {b.unit}</span>
                </div>
                <div className="h-3 border border-lab bg-paper-2" aria-hidden="true">
                  <div className="h-full" style={{ width: `${barPct(b.value)}%`, background: b.hot ? "var(--signal)" : "var(--lab)", transition: "width 400ms" }} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <StatGrid>
          <Stat label="Pods per room" value={fmt(v.podsPerRoom)} unit="pods" />
          <Stat label="Redis deliveries" value={fmt(v.redisEgressMsgsPerSec)} unit="msgs/s" />
          <Stat label="Redis egress" value={fmtBytesDecimal(v.redisEgressBytesPerSec)} unit="/s" />
          <Stat label="Per-pod ingress" value={fmt(v.perPodIngressMsgsPerSec)} unit="msgs/s" note={`${Math.round(v.wastedFraction * 100)}% wasted`} />
          <Stat label="Client egress per pod" value={fmt(v.perPodClientEgressMsgsPerSec)} unit="msgs/s" />
          <Stat label="Subscriber conns" value={fmt(v.redisSubscriberConnections)} note={v.exceedsMaxclients ? `per node ${fmt(v.subscriberConnectionsPerNode)}: above maxclients` : `per node ${fmt(v.subscriberConnectionsPerNode)}`} />
          <Stat label="Channel subscriptions" value={fmt(v.channelSubscriptions)} />
          <Stat label="Publish load per primary" value={fmt(v.perPrimaryPublishesPerSec)} unit="msgs/s" />
          <Stat label="Pod connection memory" value={fmtBytesDecimal(v.podConnMemoryBytes)} note={`${fmt(v.connectionsPerPod)} conns/pod`} />
        </StatGrid>
      </div>
    </LabShell>
  );
}
