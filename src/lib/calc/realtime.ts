/** Pure, deterministic models for the realtime fan-out labs. Illustrative arithmetic; no benchmark numbers. */
import { clamp } from "./redis";

/** Seeded PRNG (mulberry32). Same seed, same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic hash of a few integers into a PRNG seed. */
const mix = (...xs: number[]): number => {
  let h = 2166136261;
  for (const x of xs) h = Math.imul(h ^ (x | 0), 16777619) >>> 0;
  return h;
};

/* ------------------------------------------------------------------ */
/* Lab 1: fan-out calculator                                           */
/* ------------------------------------------------------------------ */

export type Routing = "roundRobin" | "affinity";
export type Strategy = "perConnection" | "global" | "perRoom";
export type Topology = "standalone" | "clusterClassic" | "clusterSharded";
export type Bottleneck = "clientEgress" | "redisEgress" | "redisPublishCpu" | "connections";

/** Redis `maxclients` default. */
export const REDIS_MAXCLIENTS = 10_000;
/** Illustrative per-pod connection capacity used by room-affinity placement. */
export const POD_CAPACITY_CONNS = 50_000;

/**
 * Expected number of pods holding at least one member of a room (pods).
 * Round-robin: P x (1 - (1 - 1/P)^M). Affinity: min(P, ceil(M / connsPerPod)).
 */
export function expectedPodsPerRoom(pods: number, members: number, routing: Routing, connsPerPod: number): number {
  const P = Math.round(clamp(pods, 1, 1_000_000));
  const M = Math.round(clamp(members, 1, 1e9));
  if (routing === "affinity") return Math.min(P, Math.ceil(M / Math.max(1, clamp(connsPerPod, 1, 1e12))));
  if (P === 1) return 1;
  return P * (1 - Math.pow(1 - 1 / P, M));
}

export type FanoutInput = {
  pods: number;
  membersPerRoom: number;
  rooms: number;
  publishesPerSec: number;
  payloadBytes: number;
  strategy: Strategy;
  routing: Routing;
  topology: Topology;
  shards: number;
  replicas: number;
  /** Illustrative per-connection memory, decimal kB. */
  connMemKB: number;
};

export type FanoutView = {
  pods: number;
  podsPerRoom: number;
  deliveriesPerPublish: number;
  redisEgressMsgsPerSec: number;
  redisEgressBytesPerSec: number;
  perPodIngressMsgsPerSec: number;
  /** 0..1, share of a pod's Redis ingress that it discards (global channel only). */
  wastedFraction: number;
  clientEgressMsgsPerSec: number;
  clientEgressBytesPerSec: number;
  perPodClientEgressMsgsPerSec: number;
  redisSubscriberConnections: number;
  subscriberConnectionsPerNode: number;
  exceedsMaxclients: boolean;
  channelSubscriptions: number;
  clusterBusMsgsPerSec: number;
  perPrimaryPublishesPerSec: number;
  redisNodes: number;
  connections: number;
  connectionsPerPod: number;
  podConnMemoryBytes: number;
  /** Relative ranking of the busiest tier. Reference scales are arbitrary round numbers, not capacities. */
  bottleneck: Bottleneck;
};

export function fanoutModel(raw: FanoutInput): FanoutView {
  const P = Math.round(clamp(raw.pods, 1, 1000));
  const M = Math.round(clamp(raw.membersPerRoom, 1, 100_000));
  const N = Math.round(clamp(raw.rooms, 1, 1_000_000));
  const R = clamp(raw.publishesPerSec, 0, 1_000_000);
  const B = clamp(raw.payloadBytes, 50, 64_000);
  const cluster = raw.topology !== "standalone";
  const S = cluster ? Math.round(clamp(raw.shards, 1, 64)) : 1;
  const r = cluster ? Math.round(clamp(raw.replicas, 0, 2)) : 0;
  const nodes = S * (1 + r);
  const memKB = clamp(raw.connMemKB, 1, 1000);

  const C = N * M;
  const connsPerPod = C / P;
  const E = expectedPodsPerRoom(P, M, raw.routing, POD_CAPACITY_CONNS);
  const d = raw.strategy === "perConnection" ? M : raw.strategy === "global" ? P : E;

  const redisEgress = R * d;
  const subs = raw.strategy === "perConnection" ? C : raw.strategy === "global" ? P : raw.topology === "clusterSharded" ? P * S : P;
  const channelSubscriptions = raw.strategy === "perConnection" ? C : raw.strategy === "global" ? P : N * E;
  const subsPerNode = raw.topology === "standalone" ? subs : raw.topology === "clusterSharded" ? subs / S : subs / nodes;
  const bus = raw.topology === "clusterClassic" ? R * (nodes - 1) : raw.topology === "clusterSharded" ? R * r : 0;
  const perPrimary = raw.topology === "clusterSharded" ? R / S : R;
  const clientEgress = R * M;

  // Relative load scores (1.0 = a round reference of 100,000 msgs/s on one process, 10,000 subscriber connections on one node, POD_CAPACITY_CONNS sockets on one pod).
  const REF_MSGS = 100_000;
  const scores = {
    clientEgress: clientEgress / P / REF_MSGS,
    redisPublishCpu: perPrimary / REF_MSGS,
    redisEgress: redisEgress / (cluster ? nodes : 1) / REF_MSGS,
    connections: Math.max(subsPerNode / REDIS_MAXCLIENTS, connsPerPod / POD_CAPACITY_CONNS),
  };
  let bottleneck: Bottleneck = "clientEgress";
  for (const k of ["redisEgress", "redisPublishCpu", "connections"] as const) if (scores[k] > scores[bottleneck]) bottleneck = k;

  return {
    pods: P, podsPerRoom: E, deliveriesPerPublish: d,
    redisEgressMsgsPerSec: redisEgress, redisEgressBytesPerSec: redisEgress * B,
    perPodIngressMsgsPerSec: redisEgress / P,
    wastedFraction: raw.strategy === "global" ? 1 - E / P : 0,
    clientEgressMsgsPerSec: clientEgress, clientEgressBytesPerSec: clientEgress * B, perPodClientEgressMsgsPerSec: clientEgress / P,
    redisSubscriberConnections: subs, subscriberConnectionsPerNode: subsPerNode, exceedsMaxclients: subsPerNode > REDIS_MAXCLIENTS,
    channelSubscriptions, clusterBusMsgsPerSec: bus, perPrimaryPublishesPerSec: perPrimary, redisNodes: nodes,
    connections: C, connectionsPerPod: connsPerPod, podConnMemoryBytes: connsPerPod * memKB * 1000,
    bottleneck,
  };
}

/** Sorted, unique pod indices hit by one sample publish. Deterministic for a seed. */
export function samplePublishPods(pods: number, members: number, routing: Routing, seed: number, connsPerPod = POD_CAPACITY_CONNS): number[] {
  const P = Math.round(clamp(pods, 1, 1_000_000));
  const M = Math.round(clamp(members, 1, 1e9));
  const rand = mulberry32(seed);
  const hit = new Set<number>();
  if (routing === "affinity") {
    const k = Math.min(P, Math.ceil(M / Math.max(1, connsPerPod)));
    const start = Math.floor(rand() * P);
    for (let i = 0; i < k; i++) hit.add((start + i) % P);
  } else {
    // ponytail: capped draw count; beyond ~30 draws per pod essentially every pod is hit anyway.
    const draws = Math.min(M, P * 30);
    for (let i = 0; i < draws && hit.size < P; i++) hit.add(Math.floor(rand() * P));
  }
  return [...hit].sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ */
/* Lab 2: reconnect storm                                              */
/* ------------------------------------------------------------------ */

export type StormEvent = "crash" | "drain" | "rolling";
export type ReconnectPolicy = "immediate" | "fixed" | "jitter";

export const STORM_PODS = 6;
export const STORM_CLIENTS = 120;
export const STORM_ROOMS = 4;
export const STORM_MAX_TICKS = 40;
export const FIXED_DELAY_TICKS = 3;
/** First-retry window for the jitter policy, in ticks. */
export const BACKOFF_BASE_TICKS = 4;
export const DRAIN_BATCH = 5;
export const RESTART_TICKS = 3;
export const ROLLING_GAP_TICKS = 5;

export type StormParams = {
  event: StormEvent;
  policy: ReconnectPolicy;
  capTicks: number;
  acceptLimit: number;
  /** Per-room replay buffer length in messages; null means Pub/Sub only. */
  bufferMsgs: number | null;
  /** Tick at which the event fires; null = not triggered yet. */
  triggerAt: number | null;
  seed: number;
};

export type StormClient = { id: number; room: number; pod: number; attempt: number; retryAt: number; lastSeq: number; rejectedAt: number };
export type PodState = { status: "up" | "draining" | "down"; restartAt: number };

export type StormState = {
  tick: number;
  clients: StormClient[];
  pods: PodState[];
  seq: number[];
  attemptsPerTick: number[];
  peakAttempts: number;
  rejected: number;
  accepted: number;
  replayedMsgs: number;
  resyncClients: number;
  lostMsgs: number;
  lastWaitingTick: number;
  log: string[];
};

export type ResumeOutcome = "replayed" | "resync" | "lost";

export function resumeOutcome(missed: number, bufferSize: number | null): ResumeOutcome {
  if (bufferSize === null) return "lost";
  return missed <= bufferSize ? "replayed" : "resync";
}

/** Delay in ticks before the next attempt (>= 1). Full jitter: floor(rand x min(cap, base x 2^attempt)) + 1. */
export function backoffDelayTicks(policy: ReconnectPolicy, attempt: number, capTicks: number, rand: () => number): number {
  if (policy === "immediate") return 1;
  if (policy === "fixed") return FIXED_DELAY_TICKS;
  const cap = Math.round(clamp(capTicks, 2, 16));
  const ceiling = Math.min(cap, BACKOFF_BASE_TICKS * Math.pow(2, Math.max(0, Math.min(attempt, 10))));
  return Math.floor(rand() * ceiling) + 1;
}

export function normalizeStorm(p: StormParams): StormParams {
  return {
    event: p.event, policy: p.policy,
    capTicks: Math.round(clamp(p.capTicks, 2, 16)),
    acceptLimit: Math.round(clamp(p.acceptLimit, 2, 40)),
    bufferMsgs: p.bufferMsgs === null ? null : Math.round(clamp(p.bufferMsgs, 0, 20)),
    triggerAt: p.triggerAt === null ? null : Math.round(clamp(p.triggerAt, 0, STORM_MAX_TICKS - 1)),
    seed: Math.round(clamp(p.seed, 0, 2_147_483_647)),
  };
}

export function initialStormState(): StormState {
  return {
    tick: -1,
    clients: Array.from({ length: STORM_CLIENTS }, (_, id) => ({ id, room: id % STORM_ROOMS, pod: id % STORM_PODS, attempt: 0, retryAt: 0, lastSeq: 0, rejectedAt: -1 })),
    pods: Array.from({ length: STORM_PODS }, () => ({ status: "up" as const, restartAt: 0 })),
    seq: Array.from({ length: STORM_ROOMS }, () => 0),
    attemptsPerTick: [], peakAttempts: 0, rejected: 0, accepted: 0, replayedMsgs: 0, resyncClients: 0, lostMsgs: 0, lastWaitingTick: -1, log: [],
  };
}

const TARGET_POD = 2; // "pod 3" in the UI

const podLabel = (i: number) => `pod-${i + 1}`;

/** Advance one tick. Pure: returns a new state. */
export function stepStorm(prev: StormState, raw: StormParams): StormState {
  const p = normalizeStorm(raw);
  const t = prev.tick + 1;
  const s: StormState = {
    ...prev, tick: t,
    clients: prev.clients.map((c) => ({ ...c })),
    pods: prev.pods.map((x) => ({ ...x })),
    seq: [...prev.seq], attemptsPerTick: [...prev.attemptsPerTick], log: [...prev.log],
  };
  const delayFor = (c: StormClient) => backoffDelayTicks(p.policy, c.attempt, p.capTicks, mulberry32(mix(p.seed, t, c.id, c.attempt)));
  const disconnect = (c: StormClient) => { c.pod = -1; c.attempt = 0; c.retryAt = t + delayFor(c); };

  // 0. pods restart
  for (let i = 0; i < STORM_PODS; i++) {
    const pod = s.pods[i];
    if (pod && pod.status === "down" && t >= pod.restartAt) { pod.status = "up"; s.log.push(`t${t} · ${podLabel(i)} restarted, 0 connections`); }
  }

  // 1. event
  const t0 = p.triggerAt;
  if (t0 !== null && t >= t0) {
    const starts: number[] = p.event === "rolling" ? Array.from({ length: STORM_PODS }, (_, k) => t0 + k * ROLLING_GAP_TICKS) : [t0];
    starts.forEach((at, k) => {
      if (at !== t) return;
      const i = p.event === "rolling" ? k : TARGET_POD;
      const pod = s.pods[i];
      if (!pod) return;
      if (p.event === "crash") {
        const gone = s.clients.filter((c) => c.pod === i);
        gone.forEach(disconnect);
        pod.status = "down"; pod.restartAt = t + RESTART_TICKS;
        s.log.push(`t${t} · ${podLabel(i)} crashed · ${gone.length} clients disconnected`);
      } else {
        pod.status = "draining";
        s.log.push(`t${t} · ${podLabel(i)} SIGTERM: endpoint marked terminating, drain starts (${DRAIN_BATCH} closes per tick)`);
      }
    });
  }

  // 2. drain batches
  for (let i = 0; i < STORM_PODS; i++) {
    const pod = s.pods[i];
    if (!pod || pod.status !== "draining") continue;
    const mine = s.clients.filter((c) => c.pod === i).slice(0, DRAIN_BATCH);
    mine.forEach(disconnect);
    if (mine.length > 0) s.log.push(`t${t} · ${podLabel(i)} closed ${mine.length} connections (1001 going away)`);
    if (!s.clients.some((c) => c.pod === i)) { pod.status = "down"; pod.restartAt = t + RESTART_TICKS; s.log.push(`t${t} · ${podLabel(i)} empty, exits`); }
  }

  // 3. reconnect attempts (clients disconnected this tick have retryAt > t and wait for the next tick)
  const due = s.clients.filter((c) => c.pod === -1 && c.retryAt <= t);
  const load = s.pods.map((_, i) => s.clients.filter((c) => c.pod === i).length);
  const acceptedNow = s.pods.map(() => 0);
  const open = s.pods.map((x) => x.status === "up");
  let acc = 0;
  let rej = 0;
  const outcomes = { replayed: 0, replayedMsgs: 0, resync: 0, lost: 0, lostMsgs: 0 };
  for (const c of due) {
    const rand = mulberry32(mix(p.seed, t, c.id, 99));
    const alive = s.pods.map((_, i) => i).filter((i) => open[i]);
    // power of two choices among pods that are up
    const pick = () => alive[Math.floor(rand() * alive.length)] ?? -1;
    const a = pick();
    const b = pick();
    const target = a < 0 ? -1 : (load[a] ?? 0) <= (load[b] ?? 0) ? a : b;
    if (target < 0 || (acceptedNow[target] ?? 0) >= p.acceptLimit) {
      rej++; c.attempt++; c.rejectedAt = t; c.retryAt = t + delayFor(c);
      continue;
    }
    acceptedNow[target] = (acceptedNow[target] ?? 0) + 1;
    load[target] = (load[target] ?? 0) + 1;
    acc++;
    c.pod = target;
    const missed = (s.seq[c.room] ?? 0) - c.lastSeq;
    if (missed > 0) {
      const o = resumeOutcome(missed, p.bufferMsgs);
      if (o === "replayed") { outcomes.replayed++; outcomes.replayedMsgs += missed; }
      else if (o === "resync") outcomes.resync++;
      else { outcomes.lost++; outcomes.lostMsgs += missed; }
      c.lastSeq = s.seq[c.room] ?? 0;
    }
    c.attempt = 0;
  }
  if (due.length > 0) {
    s.log.push(`t${t} · ${due.length} attempts, ${acc} accepted, ${rej} rejected${rej > 0 ? " (accept limit)" : ""}`);
    const parts: string[] = [];
    if (outcomes.replayed) parts.push(`${outcomes.replayed} resumed with replay (${outcomes.replayedMsgs} msgs)`);
    if (outcomes.resync) parts.push(`${outcomes.resync} full resync (gap > buffer ${p.bufferMsgs})`);
    if (outcomes.lost) parts.push(`${outcomes.lost} lost ${outcomes.lostMsgs} msgs (no buffer)`);
    if (parts.length) s.log.push(`t${t} · ${parts.join("; ")}`);
  }
  s.attemptsPerTick.push(due.length);
  s.peakAttempts = Math.max(s.peakAttempts, due.length);
  s.rejected += rej; s.accepted += acc;
  s.replayedMsgs += outcomes.replayedMsgs; s.resyncClients += outcomes.resync; s.lostMsgs += outcomes.lostMsgs;

  // 4. publish: one message per room, seen by connected clients only
  for (let r = 0; r < STORM_ROOMS; r++) s.seq[r] = (s.seq[r] ?? 0) + 1;
  for (const c of s.clients) if (c.pod >= 0) c.lastSeq = s.seq[c.room] ?? 0;

  if (s.clients.some((c) => c.pod === -1)) s.lastWaitingTick = t;
  return s;
}

/** Run from tick 0 through `upTo` (inclusive). */
export function simulateStorm(raw: StormParams, upTo: number): StormState {
  const last = Math.round(clamp(upTo, 0, STORM_MAX_TICKS - 1));
  let s = initialStormState();
  for (let t = 0; t <= last; t++) s = stepStorm(s, raw);
  return s;
}

export type StormStats = {
  peakAttempts: number;
  ticksToRecover: number | null;
  rejected: number;
  replayedMsgs: number;
  resyncClients: number;
  lostMsgs: number;
  imbalance: number;
  connectedPerPod: number[];
  waiting: number;
};

export function stormStats(s: StormState, raw: StormParams): StormStats {
  const p = normalizeStorm(raw);
  const connectedPerPod = s.pods.map((_, i) => s.clients.filter((c) => c.pod === i).length);
  const waiting = s.clients.filter((c) => c.pod === -1).length;
  const upCounts = connectedPerPod.filter((_, i) => s.pods[i]?.status === "up");
  const mean = upCounts.length ? upCounts.reduce((a, b) => a + b, 0) / upCounts.length : 0;
  return {
    peakAttempts: s.peakAttempts,
    ticksToRecover: p.triggerAt === null || p.triggerAt > s.tick || waiting > 0 || s.lastWaitingTick < 0 ? null : s.lastWaitingTick - p.triggerAt + 1,
    rejected: s.rejected, replayedMsgs: s.replayedMsgs, resyncClients: s.resyncClients, lostMsgs: s.lostMsgs,
    imbalance: mean > 0 ? Math.max(...upCounts) / mean : 0,
    connectedPerPod, waiting,
  };
}

/* ------------------------------------------------------------------ */
/* Lab 3: slow subscriber                                              */
/* ------------------------------------------------------------------ */

export type WritePolicy = "headOfLine" | "dropOldest" | "keepLatest" | "disconnectSlow";

/** Redis `mb` in client-output-buffer-limit is 1024 x 1024 bytes; this module uses MiB throughout. */
export const MIB = 1_048_576;
export const SLOW_DURATION_SEC = 120;
export const STALL_START_SEC = 30;
/** Assumed distinct keys for "keep latest per key" (so the queue is bounded by this). */
export const COALESCE_KEYS = 20;

export type SlowSubInput = {
  incomingMsgsPerSec: number;
  msgBytes: number;
  podDrainMsgsPerSec: number;
  slowClientMsgsPerSec: number;
  stallSec: number;
  policy: WritePolicy;
  queueLimit: number;
  hardMiB: number;
  softMiB: number;
  softSeconds: number;
  resubscribeGapSec: number;
};

export type SlowSubView = {
  bufferBytes: number[];
  slowQueueMsgs: number[];
  softOverSec: number[];
  disconnectSec: number | null;
  disconnectReason: "hard" | "soft" | null;
  disconnectCount: number;
  /** 1-based seconds at which Redis closed the connection. */
  disconnectSecs: number[];
  lostMsgsAllClients: number;
  droppedMsgsSlowClient: number;
  maxBufferBytes: number;
  slowClientDisconnected: boolean;
  slowClientDisconnectSec: number | null;
  hardBytes: number;
  softBytes: number;
};

/** Per-second timeline. Second i covers [i, i+1); results are end-of-second and `disconnectSec` is 1-based (i + 1). */
export function outputBufferTimeline(raw: SlowSubInput): SlowSubView {
  const R = clamp(raw.incomingMsgsPerSec, 0, 50_000);
  const size = clamp(raw.msgBytes, 100, 16_000);
  const drain = clamp(raw.podDrainMsgsPerSec, 100, 100_000);
  const slow = clamp(raw.slowClientMsgsPerSec, 0, 2_000);
  const stall = clamp(raw.stallSec, 0, 60);
  const qLimit = clamp(raw.queueLimit, 10, 10_000);
  const softB = clamp(raw.softMiB, 1, 1_000) * MIB;
  const hardB = clamp(raw.hardMiB, 1, 1_000) * MIB; // hard < soft is allowed (as in Redis); 0 = disabled is not modelled
  const softSec = Math.round(clamp(raw.softSeconds, 1, 600));
  const gap = Math.round(clamp(raw.resubscribeGapSec, 1, 10));
  const hol = raw.policy === "headOfLine";

  const bufferBytes: number[] = [];
  const slowQueueMsgs: number[] = [];
  const softOverSec: number[] = [];
  let buf = 0; // msgs in the Redis output buffer
  let q = 0; // slow client's queue (per-client policies)
  let softOver = 0;
  let gapUntil = 0;
  let disconnectSec: number | null = null;
  let disconnectReason: "hard" | "soft" | null = null;
  let disconnectCount = 0;
  const disconnectSecs: number[] = [];
  let lost = 0;
  let dropped = 0;
  let slowGone = false;
  let slowGoneSec: number | null = null;
  let maxBuf = 0;

  for (let i = 0; i < SLOW_DURATION_SEC; i++) {
    const sec = i + 1;
    if (i < gapUntil) { bufferBytes.push(0); slowQueueMsgs.push(q); softOverSec.push(0); continue; }
    const stalled = stall > 0 && i >= STALL_START_SEC && i < STALL_START_SEC + stall;
    const podRate = stalled ? 0 : hol && slow > 0 ? Math.min(drain, slow) : drain;
    buf += R;
    buf -= Math.min(buf, podRate);

    if (!hol && !slowGone && slow > 0 && !stalled) {
      q += R;
      q -= Math.min(q, slow);
      if (raw.policy === "dropOldest" && q > qLimit) { dropped += q - qLimit; q = qLimit; }
      else if (raw.policy === "keepLatest" && q > COALESCE_KEYS) { dropped += q - COALESCE_KEYS; q = COALESCE_KEYS; }
      else if (raw.policy === "disconnectSlow" && q > qLimit) { dropped += q; q = 0; slowGone = true; slowGoneSec = sec; }
    }

    const bytes = buf * size;
    maxBuf = Math.max(maxBuf, bytes);
    softOver = bytes > softB ? softOver + 1 : 0;
    bufferBytes.push(bytes);
    slowQueueMsgs.push(q);
    softOverSec.push(softOver);
    const reason = bytes > hardB ? "hard" : softOver >= softSec ? "soft" : null;
    if (reason) {
      disconnectCount++;
      disconnectSecs.push(sec);
      if (disconnectSec === null) { disconnectSec = sec; disconnectReason = reason; }
      lost += buf + R * gap;
      buf = 0; softOver = 0; gapUntil = i + 1 + gap;
    }
  }

  return {
    bufferBytes, slowQueueMsgs, softOverSec, disconnectSec, disconnectReason, disconnectCount, disconnectSecs,
    lostMsgsAllClients: lost, droppedMsgsSlowClient: dropped, maxBufferBytes: maxBuf,
    slowClientDisconnected: slowGone, slowClientDisconnectSec: slowGoneSec, hardBytes: hardB, softBytes: softB,
  };
}
