/**
 * Pure, deterministic models for the IoT labs (MQTT -> Kafka -> ksqlDB -> MongoDB).
 * Everything here is a simplified teaching model on synthetic data. No real broker,
 * Kafka cluster, ksqlDB or MongoDB is involved. No Date.now / Math.random.
 */

export const clamp = (n: number, lo: number, hi: number): number =>
  !Number.isFinite(n) ? lo : Math.min(hi, Math.max(lo, n));
const clampInt = (n: number, lo: number, hi: number): number => Math.round(clamp(n, lo, hi));

/** One step of mulberry32. State in, [value in [0,1), next state] out. */
export function rngNext(state: number): [number, number] {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    const [v, n] = rngNext(s);
    s = n;
    return v;
  };
}

/** FNV-1a 32-bit. A deterministic stand-in: Kafka's default partitioner actually uses murmur2. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/* ------------------------------------------------------------------ */
/* 1. Pipeline simulator                                               */
/* ------------------------------------------------------------------ */

export const PIPELINE_STAGES = [
  "MQTT broker",
  "MQTT-to-Kafka bridge",
  "Kafka topic",
  "ksqlDB-style stream",
  "MongoDB-style store",
] as const;
export type StageIndex = 0 | 1 | 2 | 3 | 4;

/** One tick = 1 simulated second. */
export type PipelineConfig = {
  devices: number;
  /** messages per device per second */
  msgsPerDevicePerSec: number;
  payloadBytes: number;
  /** per-tick (per-second) processing capacity of the slower stages, in messages */
  bridgeCapPerSec: number;
  ksqlCapPerSec: number;
  storeCapPerSec: number;
  seed: number;
};

export const DEFAULT_PIPELINE: PipelineConfig = {
  devices: 50,
  msgsPerDevicePerSec: 1,
  payloadBytes: 200,
  bridgeCapPerSec: 80,
  ksqlCapPerSec: 80,
  storeCapPerSec: 40,
  seed: 7,
};

/** Assumed non-bottleneck capacities and queue bound (illustrative). */
export const BROKER_CAP_PER_SEC = 5000;
export const KAFKA_CAP_PER_SEC = 5000;
export const QUEUE_LIMIT = 20000;
/** Readings above this are counted as alerts by the ksql-style stage. */
export const ALERT_TEMP_C = 85;
/** Sentinel for a faulty sensor reading, filtered by the ksql-style stage. */
export const FAULT_TEMP_C = -999;

export function normalizePipelineConfig(c: PipelineConfig): PipelineConfig {
  return {
    devices: clampInt(c.devices, 1, 200),
    msgsPerDevicePerSec: clamp(c.msgsPerDevicePerSec, 0.1, 5),
    payloadBytes: clampInt(c.payloadBytes, 16, 10000),
    bridgeCapPerSec: clampInt(c.bridgeCapPerSec, 1, BROKER_CAP_PER_SEC),
    ksqlCapPerSec: clampInt(c.ksqlCapPerSec, 1, BROKER_CAP_PER_SEC),
    storeCapPerSec: clampInt(c.storeCapPerSec, 1, BROKER_CAP_PER_SEC),
    seed: clampInt(c.seed, 0, 2 ** 31),
  };
}

export type Msg = {
  id: number;
  deviceId: number;
  tempC: number;
  payloadBytes: number;
  createdTick: number;
  /** tick at which each stage finished with this message (index = stage) */
  trail: number[];
};

export type StageCounters = { received: number; processed: number; dropped: number; filtered: number };

export type PipelineState = {
  tick: number;
  rng: number;
  emitAcc: number;
  nextId: number;
  /** queues[i] = messages waiting for stage i */
  queues: Msg[][];
  counters: StageCounters[];
  /** last few messages finished by each stage (newest last) */
  recent: Msg[][];
  alerts: number;
  /** sum of (store tick - created tick), for mean end-to-end latency */
  latencySumTicks: number;
};

const RECENT_KEEP = 5;

export function initPipeline(seed: number): PipelineState {
  return {
    tick: 0,
    rng: clampInt(seed, 0, 2 ** 31),
    emitAcc: 0,
    nextId: 1,
    queues: PIPELINE_STAGES.map(() => []),
    counters: PIPELINE_STAGES.map(() => ({ received: 0, processed: 0, dropped: 0, filtered: 0 })),
    recent: PIPELINE_STAGES.map(() => []),
    alerts: 0,
    latencySumTicks: 0,
  };
}

export function stepPipeline(prev: PipelineState, cfgIn: PipelineConfig): PipelineState {
  const cfg = normalizePipelineConfig(cfgIn);
  const tick = prev.tick + 1;
  const queues = prev.queues.map((q) => q.slice());
  const counters = prev.counters.map((c) => ({ ...c }));
  const recent = prev.recent.map((r) => r.slice());
  let alerts = prev.alerts;
  let latencySumTicks = prev.latencySumTicks;
  const caps = [BROKER_CAP_PER_SEC, cfg.bridgeCapPerSec, KAFKA_CAP_PER_SEC, cfg.ksqlCapPerSec, cfg.storeCapPerSec];

  // Downstream first, so a message advances at most one stage per tick.
  for (let i = 4; i >= 0; i--) {
    const q = queues[i];
    const cnt = counters[i];
    const rec = recent[i];
    const next = queues[i + 1];
    const cap = caps[i] ?? 1;
    if (!q || !cnt || !rec) continue;
    const room = next ? Math.max(0, QUEUE_LIMIT - next.length) : Infinity; // full downstream = backpressure
    const n = Math.min(cap, q.length, room);
    const batch = q.splice(0, n);
    for (let bi = 0; bi < batch.length; bi++) {
      const orig = batch[bi];
      if (!orig) continue;
      const m: Msg = { ...orig, trail: [...orig.trail] };
      m.trail[i] = tick;
      batch[bi] = m;
      cnt.processed++;
      if (i === 3 && m.tempC === FAULT_TEMP_C) {
        cnt.filtered++; // WHERE-clause style filter: faulty readings stop here
        continue;
      }
      if (i === 3 && m.tempC > ALERT_TEMP_C) alerts++;
      if (i === 4) latencySumTicks += tick - m.createdTick;
      if (next) {
        next.push(m);
        const nc = counters[i + 1];
        if (nc) nc.received++;
      }
    }
    rec.push(...batch.slice(-RECENT_KEEP));
    if (rec.length > RECENT_KEEP) rec.splice(0, rec.length - RECENT_KEEP);
  }

  // Devices publish.
  let rng = prev.rng;
  let emitAcc = prev.emitAcc + cfg.devices * cfg.msgsPerDevicePerSec;
  const emit = Math.floor(emitAcc);
  emitAcc -= emit;
  let nextId = prev.nextId;
  const q0 = queues[0];
  const c0 = counters[0];
  if (q0 && c0) {
    for (let k = 0; k < emit; k++) {
      let r: number;
      [r, rng] = rngNext(rng);
      let t: number;
      [t, rng] = rngNext(rng);
      const tempC = r < 0.03 ? FAULT_TEMP_C : Math.round((15 + t * 80) * 10) / 10;
      const msg: Msg = { id: nextId, deviceId: (nextId - 1) % cfg.devices, tempC, payloadBytes: cfg.payloadBytes, createdTick: tick, trail: [] };
      nextId++;
      if (q0.length >= QUEUE_LIMIT) {
        c0.dropped++;
        continue;
      }
      q0.push(msg);
      c0.received++;
    }
  }
  return { tick, rng, emitAcc, nextId, queues, counters, recent, alerts, latencySumTicks };
}

export function runPipeline(cfg: PipelineConfig, ticks: number): PipelineState {
  let s = initPipeline(normalizePipelineConfig(cfg).seed);
  for (let i = 0; i < ticks; i++) s = stepPipeline(s, cfg);
  return s;
}

/** The first stage whose backlog is the largest, or null if every queue is short (<= 1 tick of its capacity). */
export function bottleneckStage(s: PipelineState, cfgIn: PipelineConfig): number | null {
  const cfg = normalizePipelineConfig(cfgIn);
  const caps = [BROKER_CAP_PER_SEC, cfg.bridgeCapPerSec, KAFKA_CAP_PER_SEC, cfg.ksqlCapPerSec, cfg.storeCapPerSec];
  let best: number | null = null;
  let bestLen = 0;
  s.queues.forEach((q, i) => {
    if (q.length > (caps[i] ?? 1) && q.length > bestLen) {
      best = i;
      bestLen = q.length;
    }
  });
  return best;
}

export function msgPayloadJson(m: Msg): string {
  return JSON.stringify({ deviceId: `dev-${String(m.deviceId).padStart(3, "0")}`, tempC: m.tempC === FAULT_TEMP_C ? null : m.tempC, tick: m.createdTick });
}

/* ------------------------------------------------------------------ */
/* 2. MQTT QoS                                                         */
/* ------------------------------------------------------------------ */

export type Qos = 0 | 1 | 2;
export type Packet = "PUBLISH" | "PUBACK" | "PUBREC" | "PUBREL" | "PUBCOMP";
/** S = sender of the PUBLISH on this leg, R = receiver. */
export type Side = "S" | "R";

export type QosStep = {
  from: Side | "-";
  packet: Packet | "RECONNECT" | "TIMEOUT";
  dup: boolean;
  lost: boolean;
  note: string;
};

export type LegResult = {
  qos: Qos;
  steps: QosStep[];
  /** how many times the receiving application was handed the message on this leg */
  deliveries: number;
  /** true when the sender finished the handshake and considers it done */
  completed: boolean;
};

export const effectiveQos = (pub: Qos, sub: Qos): Qos => (Math.min(pub, sub) as Qos);

const SEQ: Record<Qos, { from: Side; packet: Packet }[]> = {
  0: [{ from: "S", packet: "PUBLISH" }],
  1: [{ from: "S", packet: "PUBLISH" }, { from: "R", packet: "PUBACK" }],
  2: [
    { from: "S", packet: "PUBLISH" },
    { from: "R", packet: "PUBREC" },
    { from: "S", packet: "PUBREL" },
    { from: "R", packet: "PUBCOMP" },
  ],
};

export const packetsOf = (qos: Qos): Packet[] => SEQ[qos].map((p) => p.packet);

/**
 * One publish leg. `dropIndex` = which packet of the handshake the link loses (null = none).
 * `reconnect` = the client reconnects and resumes its session (persistent session assumed).
 */
export function qosLeg(qos: Qos, dropIndexIn: number | null, reconnect: boolean): LegResult {
  const seq = SEQ[qos];
  const dropIndex = dropIndexIn === null ? null : clampInt(dropIndexIn, 0, seq.length - 1);
  const steps: QosStep[] = [];
  let deliveries = 0;
  let dropped = false;
  let dupNext = false;
  let completed = false;
  let i = 0;
  while (i < seq.length) {
    const p = seq[i];
    if (!p) break;
    const lost = dropIndex === i && !dropped;
    const dup = p.packet === "PUBLISH" && dupNext;
    if (lost) {
      steps.push({ from: p.from, packet: p.packet, dup, lost: true, note: `${p.packet} is lost on the link.` });
      dropped = true;
      if (qos === 0) break; // fire and forget: nothing retries
      if (!reconnect) {
        steps.push({ from: "-", packet: "TIMEOUT", dup: false, lost: false, note: "Link stays down. The sender keeps the message in its session; nothing more happens." });
        break;
      }
      steps.push({ from: "-", packet: "RECONNECT", dup: false, lost: false, note: "Client reconnects and resumes its session; unacknowledged packets are retransmitted." });
      const resume = qos === 1 ? 0 : i <= 1 ? 0 : 2;
      dupNext = resume === 0;
      i = resume;
      continue;
    }
    let note = "";
    if (p.packet === "PUBLISH") {
      if (qos === 2 && deliveries > 0) {
        note = "Receiver recognises the packet id and does NOT hand the message to the application again.";
      } else {
        deliveries++;
        note = dup && qos === 1 ? "Receiver cannot tell it already processed this: the application sees the message again (duplicate)." : "Receiver hands the message to the application.";
      }
    } else if (p.packet === "PUBACK") note = "Sender may now forget the message.";
    else if (p.packet === "PUBREC") note = "Receiver has stored the packet id; sender may release it.";
    else if (p.packet === "PUBREL") note = "Sender releases the id; receiver may discard its stored state.";
    else note = "Handshake complete; both sides forget the packet id.";
    steps.push({ from: p.from, packet: p.packet, dup, lost: false, note });
    if (i === seq.length - 1) completed = true;
    i++;
  }
  return { qos, steps, deliveries, completed };
}

export type QosScenario = {
  pubQos: Qos;
  subQos: Qos;
  /** which leg the link drop hits */
  dropLeg: "none" | "pub" | "sub";
  dropIndex: number;
  reconnect: boolean;
};

export type QosOutcome = "lost" | "pending" | "once" | "duplicate";

export type QosResult = {
  effective: Qos;
  leg1: LegResult;
  leg2: LegResult | null;
  /** how many times the subscriber's application received the message */
  appDeliveries: number;
  outcome: QosOutcome;
  explanation: string;
};

export function simulateQos(s: QosScenario): QosResult {
  const effective = effectiveQos(s.pubQos, s.subQos);
  const leg1 = qosLeg(s.pubQos, s.dropLeg === "pub" ? s.dropIndex : null, s.reconnect);
  let leg2: LegResult | null = null;
  let appDeliveries = 0;
  if (leg1.deliveries > 0) {
    // broker forwards every PUBLISH it accepted; it cannot dedupe a QoS 1 duplicate
    leg2 = qosLeg(effective, s.dropLeg === "sub" ? s.dropIndex : null, s.reconnect);
    appDeliveries = leg2.deliveries + (leg1.deliveries - 1);
  }
  const outcome: QosOutcome = appDeliveries === 0 ? (effective > 0 && s.dropLeg !== "none" && !s.reconnect ? "pending" : "lost") : appDeliveries === 1 ? "once" : "duplicate";
  let explanation: string;
  if (outcome === "lost") explanation = "The message was lost: with QoS 0 (or a QoS 0 downgrade) nothing retransmits it.";
  else if (outcome === "pending") explanation = "The message is not delivered yet: the sender still holds it and retries when the session resumes.";
  else if (outcome === "duplicate") explanation = "The application saw the message more than once: QoS 1 is at-least-once, so the consumer must be idempotent.";
  else if (effective === 2) explanation = "Delivered once at protocol level. The broker and consumer application can still redeliver or replay (for example after a crash between receiving and committing), so keep idempotent writes.";
  else explanation = effective === 1 ? "Delivered once this time, but QoS 1 only promises at least once." : "Delivered once this time, but QoS 0 gives no guarantee at all.";
  return { effective, leg1, leg2, appDeliveries, outcome, explanation };
}

/* ------------------------------------------------------------------ */
/* 3. Partitioning                                                     */
/* ------------------------------------------------------------------ */

export type KeyStrategy = "deviceId" | "random" | "constant" | "region-skewed";
export const REGION_NAMES = ["north", "south", "east", "west", "island"] as const;
/** Illustrative skew: most of the fleet sits in a few regions. */
export const REGION_WEIGHTS = [0.55, 0.25, 0.1, 0.06, 0.04];
export const HOT_SKEW_RATIO = 1.5;

export type PartitionConfig = { devices: number; partitions: number; strategy: KeyStrategy; msgsPerDevice: number; seed: number };
export type PartitionResult = {
  counts: number[];
  total: number;
  max: number;
  mean: number;
  /** max / mean over ALL partitions (empty ones included); 0 when no messages */
  skewRatio: number;
  hotPartition: number | null;
  emptyPartitions: number;
  distinctKeys: number;
  orderingNote: string;
};

export const ORDERING_NOTES: Record<KeyStrategy, string> = {
  deviceId: "Every message of a device shares a key, so it lands in one partition and stays in order. Order across devices is not defined.",
  random: "Messages of one device are spread over partitions, so per-device order is lost across partitions. Load is even.",
  constant: "One key means one partition: total order, but a single partition does all the work and extra consumers sit idle.",
  "region-skewed": "Key = region. Order holds per region, but only a few distinct keys exist, so at most that many partitions ever receive data and big regions dominate.",
};

export function partitionLoad(cfgIn: PartitionConfig): PartitionResult {
  const devices = clampInt(cfgIn.devices, 1, 5000);
  const partitions = clampInt(cfgIn.partitions, 1, 128);
  const per = clampInt(cfgIn.msgsPerDevice, 1, 200);
  const counts = new Array<number>(partitions).fill(0);
  let distinctKeys = 0;
  let rng = clampInt(cfgIn.seed, 0, 2 ** 31);
  const add = (p: number, n: number) => {
    counts[p] = (counts[p] ?? 0) + n;
  };
  if (cfgIn.strategy === "deviceId") {
    distinctKeys = devices;
    for (let d = 0; d < devices; d++) add(fnv1a32(`dev-${d}`) % partitions, per);
  } else if (cfgIn.strategy === "constant") {
    distinctKeys = 1;
    add(fnv1a32("fleet") % partitions, devices * per);
  } else if (cfgIn.strategy === "random") {
    distinctKeys = devices * per; // null key: no key at all; counted per message for display only
    for (let m = 0; m < devices * per; m++) {
      let r: number;
      [r, rng] = rngNext(rng);
      add(Math.floor(r * partitions), 1);
    }
  } else {
    const used = new Set<number>();
    for (let d = 0; d < devices; d++) {
      let r: number;
      [r, rng] = rngNext(rng);
      let acc = 0;
      let region = REGION_WEIGHTS.length - 1;
      for (let k = 0; k < REGION_WEIGHTS.length; k++) {
        acc += REGION_WEIGHTS[k] ?? 0;
        if (r < acc) {
          region = k;
          break;
        }
      }
      used.add(region);
      add(fnv1a32(`region-${REGION_NAMES[region] ?? "x"}`) % partitions, per);
    }
    distinctKeys = used.size;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts);
  const mean = total / partitions;
  const skewRatio = total === 0 ? 0 : max / mean;
  return {
    counts,
    total,
    max,
    mean,
    skewRatio,
    hotPartition: skewRatio >= HOT_SKEW_RATIO ? counts.indexOf(max) : null,
    emptyPartitions: counts.filter((c) => c === 0).length,
    distinctKeys,
    orderingNote: ORDERING_NOTES[cfgIn.strategy],
  };
}

/* ------------------------------------------------------------------ */
/* 4. Stream windows                                                   */
/* ------------------------------------------------------------------ */

export type WindowKind = "tumbling" | "hopping" | "session";
export type ArrivalPattern = "in-order" | "out-of-order" | "late";

export type StreamEvent = { id: number; eventTimeSec: number; arrivalTimeSec: number; value: number };

export function generateEvents(count: number, pattern: ArrivalPattern, seed: number): StreamEvent[] {
  const n = clampInt(count, 1, 200);
  const rand = mulberry32(clampInt(seed, 0, 2 ** 31));
  const out: StreamEvent[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    // event gaps 1..9 s: a few bursts, a few quiet gaps (useful for session windows)
    t += i === 0 ? 0 : rand() < 0.12 ? 15 + Math.floor(rand() * 20) : 1 + Math.floor(rand() * 5);
    const value = Math.round((20 + 6 * Math.sin(i / 6) + rand() * 4) * 10) / 10;
    let delay = 0.5;
    if (pattern === "out-of-order") delay = rand() * 12;
    else if (pattern === "late") delay = rand() < 0.15 ? 25 + rand() * 20 : 0.5;
    out.push({ id: i + 1, eventTimeSec: t, arrivalTimeSec: Math.round((t + delay) * 10) / 10, value });
  }
  return out;
}

export type WindowConfig = { kind: WindowKind; sizeSec: number; hopSec: number; gapSec: number; graceSec: number };
export type WindowAgg = { startSec: number; endSec: number; count: number; avg: number | null; droppedCount: number };
export type DroppedEvent = { id: number; eventTimeSec: number; arrivalTimeSec: number; watermarkSec: number; reason: string };
export type WindowResult = {
  windows: WindowAgg[];
  dropped: DroppedEvent[];
  accepted: number;
  /** watermark after the last arrival (simplified: max event time seen so far) */
  finalWatermarkSec: number;
  reorderedEvents: number;
};

export function windowAggregate(eventsIn: StreamEvent[], cfgIn: WindowConfig): WindowResult {
  const size = clampInt(cfgIn.sizeSec, 1, 600);
  const hop = clampInt(cfgIn.kind === "hopping" ? cfgIn.hopSec : size, 1, size);
  const gap = clampInt(cfgIn.gapSec, 1, 300);
  const grace = clampInt(cfgIn.graceSec, 0, 120);
  const byArrival = [...eventsIn].sort((a, b) => a.arrivalTimeSec - b.arrivalTimeSec || a.id - b.id);
  let watermark = -Infinity;
  let reordered = 0;
  const dropped: DroppedEvent[] = [];
  let accepted = 0;
  const bins = new Map<number, { startSec: number; endSec: number; sum: number; count: number; droppedCount: number }>();
  type Sess = { start: number; last: number; sum: number; count: number };
  let sessions: Sess[] = [];

  for (const e of byArrival) {
    if (e.eventTimeSec < watermark) reordered++;
    watermark = Math.max(watermark, e.eventTimeSec);
    if (cfgIn.kind !== "session") {
      const first = Math.max(0, Math.floor((e.eventTimeSec - size) / hop) + 1);
      let dropAny: string | null = null;
      let placed = false;
      for (let k = first; k * hop <= e.eventTimeSec; k++) {
        const start = k * hop;
        const end = start + size;
        if (e.eventTimeSec >= end) continue;
        const b = bins.get(start) ?? { startSec: start, endSec: end, sum: 0, count: 0, droppedCount: 0 };
        if (end + grace <= watermark) {
          b.droppedCount++;
          dropAny = `window [${start}s, ${end}s) already closed (end + grace = ${end + grace}s <= watermark ${watermark}s)`;
        } else {
          b.sum += e.value;
          b.count++;
          placed = true;
        }
        bins.set(start, b);
      }
      if (placed) accepted++;
      if (dropAny) dropped.push({ id: e.id, eventTimeSec: e.eventTimeSec, arrivalTimeSec: e.arrivalTimeSec, watermarkSec: watermark, reason: dropAny });
    } else {
      const t = e.eventTimeSec;
      const touching = sessions.filter((s) => t >= s.start - gap && t <= s.last + gap);
      const closedTouch = touching.find((s) => s.last + gap + grace <= watermark);
      const newClosed = touching.length === 0 && t + gap + grace <= watermark;
      if (closedTouch || newClosed) {
        dropped.push({ id: e.id, eventTimeSec: t, arrivalTimeSec: e.arrivalTimeSec, watermarkSec: watermark, reason: "its session already closed (session end + gap + grace <= watermark)" });
        continue;
      }
      accepted++;
      const merged: Sess = { start: t, last: t, sum: e.value, count: 1 };
      for (const s of touching) {
        merged.start = Math.min(merged.start, s.start);
        merged.last = Math.max(merged.last, s.last);
        merged.sum += s.sum;
        merged.count += s.count;
      }
      sessions = [...sessions.filter((s) => !touching.includes(s)), merged];
    }
  }
  const windows: WindowAgg[] =
    cfgIn.kind === "session"
      ? sessions.map((s) => ({ startSec: s.start, endSec: s.last + gap, count: s.count, avg: s.count ? s.sum / s.count : null, droppedCount: 0 }))
      : [...bins.values()].map((b) => ({ startSec: b.startSec, endSec: b.endSec, count: b.count, avg: b.count ? b.sum / b.count : null, droppedCount: b.droppedCount }));
  windows.sort((a, b) => a.startSec - b.startSec);
  return { windows, dropped, accepted, finalWatermarkSec: Number.isFinite(watermark) ? watermark : 0, reorderedEvents: reordered };
}

/* ------------------------------------------------------------------ */
/* 5. Mongo-style data explorer                                        */
/* ------------------------------------------------------------------ */

export type IndexChoice = "none" | "device-ts" | "bucket";
export type MongoDataset = { devices: number; readingsPerDevice: number; intervalSec: number; deviceId: Int32Array; tsSec: Float64Array; tempC: Float32Array };

export function buildDataset(devicesIn: number, readingsIn: number, intervalIn = 60, seed = 11): MongoDataset {
  const devices = clampInt(devicesIn, 1, 100);
  const readingsPerDevice = clampInt(readingsIn, 1, 1000);
  const intervalSec = clampInt(intervalIn, 1, 3600);
  const n = devices * readingsPerDevice;
  const deviceId = new Int32Array(n);
  const tsSec = new Float64Array(n);
  const tempC = new Float32Array(n);
  const rand = mulberry32(seed);
  let k = 0;
  // natural (insertion) order = time order across the fleet
  for (let s = 0; s < readingsPerDevice; s++) {
    for (let d = 0; d < devices; d++) {
      deviceId[k] = d;
      tsSec[k] = s * intervalSec + (d % intervalSec);
      tempC[k] = Math.round((20 + 10 * rand()) * 10) / 10;
      k++;
    }
  }
  return { devices, readingsPerDevice, intervalSec, deviceId, tsSec, tempC };
}

export type MongoQuery = {
  /** null = any device */
  deviceId: number | null;
  fromSec: number;
  toSec: number;
  /** sort ts desc + limit; null = no limit */
  limit: number | null;
  op: "find" | "aggregate";
};

export type MongoPreset = { id: string; label: string; build: (d: MongoDataset) => MongoQuery };
export const MONGO_PRESETS: MongoPreset[] = [
  { id: "latest", label: "Latest reading, one device", build: (d) => ({ deviceId: 3 % d.devices, fromSec: 0, toSec: d.readingsPerDevice * d.intervalSec, limit: 1, op: "find" }) },
  { id: "device-hour", label: "One device, last hour", build: (d) => { const end = d.readingsPerDevice * d.intervalSec; return { deviceId: 3 % d.devices, fromSec: Math.max(0, end - 3600), toSec: end, limit: null, op: "find" }; } },
  { id: "fleet-avg", label: "Fleet average, last 15 min (aggregate)", build: (d) => { const end = d.readingsPerDevice * d.intervalSec; return { deviceId: null, fromSec: Math.max(0, end - 900), toSec: end, limit: null, op: "aggregate" }; } },
  { id: "device-avg", label: "One device average, whole range (aggregate)", build: (d) => ({ deviceId: 3 % d.devices, fromSec: 0, toSec: d.readingsPerDevice * d.intervalSec, limit: null, op: "aggregate" }) },
];

export type Explain = {
  stage: "COLLSCAN" | "IXSCAN + FETCH" | "BUCKET SCAN + UNPACK";
  /** documents the model reads; bucket docs when index = bucket */
  docsExamined: number;
  keysExamined: number;
  /** result rows (documents for find, groups for aggregate) */
  nReturned: number;
  /** raw readings matching the filter, regardless of shape */
  matchingReadings: number;
  unit: "documents" | "bucket documents";
  inMemorySort: boolean;
  note: string;
};

export const BUCKET_SEC_DEFAULT = 3600;

export function explainQuery(ds: MongoDataset, qIn: MongoQuery, index: IndexChoice, bucketSec = BUCKET_SEC_DEFAULT): Explain {
  const from = Math.min(qIn.fromSec, qIn.toSec);
  const to = Math.max(qIn.fromSec, qIn.toSec);
  const dev = qIn.deviceId === null ? null : clampInt(qIn.deviceId, 0, ds.devices - 1);
  const limit = qIn.limit === null ? null : clampInt(qIn.limit, 1, 1000);
  const n = ds.deviceId.length;
  const matches = (i: number) => (dev === null || ds.deviceId[i] === dev) && (ds.tsSec[i] ?? 0) >= from && (ds.tsSec[i] ?? 0) < to;
  let matching = 0;
  const groups = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (matches(i)) {
      matching++;
      groups.add(ds.deviceId[i] ?? 0);
    }
  }
  const returnedRows = qIn.op === "aggregate" ? groups.size : limit === null ? matching : Math.min(limit, matching);

  if (index === "bucket") {
    const bsec = clampInt(bucketSec, 60, 86400);
    // bucket = (device, floor(ts / bucketSec)); count buckets overlapping the filter
    const buckets = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      if (dev !== null && ds.deviceId[i] !== dev) continue;
      const bStart = Math.floor((ds.tsSec[i] ?? 0) / bsec);
      const key = `${ds.deviceId[i]}:${bStart}`;
      // a bucket "overlaps" when its time span intersects the range
      if (bStart * bsec < to && (bStart + 1) * bsec > from) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    let examined = buckets.size;
    if (limit !== null && qIn.op === "find" && dev !== null) {
      // newest-first walk: read buckets until `limit` readings are covered
      const perBucket = [...buckets.entries()].map(([k, c]) => ({ b: Number(k.split(":")[1]), c })).sort((a, b) => b.b - a.b);
      let got = 0;
      examined = 0;
      for (const p of perBucket) {
        examined++;
        got += p.c;
        if (got >= limit) break;
      }
    }
    return { stage: "BUCKET SCAN + UNPACK", docsExamined: examined, keysExamined: 0, nReturned: returnedRows, matchingReadings: matching, unit: "bucket documents", inMemorySort: false, note: `Model of a time-series-style collection: readings packed per (device, ${bsec} s) bucket. Whole buckets are read and unpacked; the planner prunes by time range, and by device when given.` };
  }

  if (index === "device-ts" && dev !== null) {
    const keys = limit !== null && qIn.op === "find" ? Math.min(limit, matching) : matching;
    return { stage: "IXSCAN + FETCH", docsExamined: keys, keysExamined: keys, nReturned: returnedRows, matchingReadings: matching, unit: "documents", inMemorySort: false, note: "Index {deviceId: 1, ts: -1}: equality on deviceId then a ts range gives tight bounds and a free newest-first order; each key needs one document fetch." };
  }

  const reason = index === "device-ts" ? "The {deviceId, ts} index has deviceId as its prefix, so a filter without deviceId cannot use tight bounds; the model falls back to a collection scan." : "No usable index: every document is read and tested.";
  return { stage: "COLLSCAN", docsExamined: n, keysExamined: 0, nReturned: returnedRows, matchingReadings: matching, unit: "documents", inMemorySort: limit !== null, note: reason };
}

export type StorageInput = {
  devices: number;
  readingsPerDevicePerSec: number;
  retentionDays: number;
  /** assumed BSON bytes per one-document-per-reading doc (illustrative) */
  docBytes: number;
  /** assumed index bytes per entry (illustrative) */
  indexEntryBytes: number;
  /** assumed average bytes per reading inside a compressed bucket (illustrative) */
  bucketedBytesPerReading: number;
  bucketSec: number;
};
export type StorageEstimate = {
  readingsRetained: number;
  perReadingBytes: number;
  perReadingIndexBytes: number;
  bucketedBytes: number;
  bucketedIndexBytes: number;
  bucketCount: number;
  perReadingTotalBytes: number;
  bucketedTotalBytes: number;
};

/** Decimal units: 1 GB = 1e9 bytes. Steady-state size once the TTL / retention window is full. */
export function storageEstimate(i: StorageInput): StorageEstimate {
  const devices = clampInt(i.devices, 1, 1e6);
  const rate = clamp(i.readingsPerDevicePerSec, 0, 100);
  const days = clamp(i.retentionDays, 0, 3650);
  const docB = clamp(i.docBytes, 1, 1e5);
  const idxB = clamp(i.indexEntryBytes, 0, 1e4);
  const bktB = clamp(i.bucketedBytesPerReading, 1, 1e5);
  const bucketSec = clampInt(i.bucketSec, 60, 86400);
  const readingsRetained = devices * rate * days * 86400;
  const bucketCount = Math.ceil(devices * (days * 86400 / bucketSec));
  const perReadingBytes = readingsRetained * docB;
  const perReadingIndexBytes = readingsRetained * idxB;
  const bucketedBytes = readingsRetained * bktB;
  const bucketedIndexBytes = bucketCount * idxB;
  return { readingsRetained, perReadingBytes, perReadingIndexBytes, bucketedBytes, bucketedIndexBytes, bucketCount, perReadingTotalBytes: perReadingBytes + perReadingIndexBytes, bucketedTotalBytes: bucketedBytes + bucketedIndexBytes };
}

/** Decimal byte formatter (kB = 1000). */
export function formatBytesDecimal(b: number): string {
  if (!Number.isFinite(b) || b <= 0) return "0 B";
  const u = ["B", "kB", "MB", "GB", "TB", "PB"];
  const e = Math.min(u.length - 1, Math.floor(Math.log10(b) / 3));
  const v = b / 1000 ** e;
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${u[e]}`;
}
