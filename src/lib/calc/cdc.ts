/** Pure, deterministic helpers for the CDC labs. Synthetic models only; no real Kafka/MySQL/ES. */

const num = (v: number, fallback = 0) => (Number.isFinite(v) ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, num(v, lo)));

// ---------- Kafka partition model ----------

/** FNV-1a 32-bit. A deterministic STAND-IN for Kafka's murmur2 default partitioner (different values, same behaviour). */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function partitionFor(key: string, partitions: number): number {
  const n = Math.max(1, Math.floor(num(partitions, 1)));
  return fnv1a32(key) % n;
}

/** Round-robin stand-in for a consumer-group assignor: partition p -> consumer p % consumers. */
export function assignPartitions(partitions: number, consumers: number): number[][] {
  const p = Math.max(1, Math.floor(num(partitions, 1)));
  const c = Math.max(1, Math.floor(num(consumers, 1)));
  return Array.from({ length: c }, (_, ci) => Array.from({ length: p }, (_, i) => i).filter((i) => i % c === ci));
}

export type PartitionView = {
  partitions: number;
  consumers: number;
  assignment: number[][];
  activeConsumers: number;
  idleConsumers: number[];
  keysPerPartition: number[];
  keyToPartition: Record<string, number>;
  /** Max effective parallelism = min(partitions, consumers). */
  parallelism: number;
};

export function partitionView(keys: readonly string[], partitions: number, consumers: number): PartitionView {
  const p = Math.max(1, Math.floor(num(partitions, 1)));
  const c = Math.max(1, Math.floor(num(consumers, 1)));
  const assignment = assignPartitions(p, c);
  const keysPerPartition = Array<number>(p).fill(0);
  const keyToPartition: Record<string, number> = {};
  for (const k of keys) {
    const pi = partitionFor(k, p);
    keyToPartition[k] = pi;
    keysPerPartition[pi] = (keysPerPartition[pi] ?? 0) + 1;
  }
  const idleConsumers = assignment.flatMap((a, i) => (a.length === 0 ? [i] : []));
  return { partitions: p, consumers: c, assignment, activeConsumers: c - idleConsumers.length, idleConsumers, keysPerPartition, keyToPartition, parallelism: Math.min(p, c) };
}

/** Keys whose partition differs between two partition counts. */
export function remappedKeys(keys: readonly string[], from: number, to: number): string[] {
  return keys.filter((k) => partitionFor(k, from) !== partitionFor(k, to));
}

// ---------- Capacity ----------

export type CapacityInput = {
  appRps: number;
  writePct: number; // 0..100
  rowsPerWrite: number;
  eventsPerRow: number;
  eventBytes: number;
  indexDocsPerSec: number;
  searchQps: number;
  /** Assumption: indexing-capacity cost of one search query, in doc-equivalents. */
  docsPerQuery: number;
};

export type CapacityResult = {
  writeRequestsPerSec: number;
  rowChangesPerSec: number;
  cdcEventsPerSec: number;
  ingressBytesPerSec: number;
  ingressBitsPerSec: number;
  demandDocsPerSec: number;
  effectiveCapacityDocsPerSec: number;
  utilisation: number; // ratio, may exceed 1; Infinity if capacity 0 and demand > 0
  netDocsPerSec: number; // capacity - demand; negative = backlog grows
  backlogGrowthDocsPerSec: number; // >= 0
  drainDocsPerSec: number; // >= 0
  /** cdc events per app request (so 1,000 RPS never equals 1,000 events/s unless factor is 1). */
  amplification: number;
};

export function capacity(i: CapacityInput): CapacityResult {
  const rps = clamp(i.appRps, 0, 1e7);
  const w = clamp(i.writePct, 0, 100) / 100;
  const rows = clamp(i.rowsPerWrite, 0, 1e6);
  const epr = clamp(i.eventsPerRow, 0, 1e3);
  const bytes = clamp(i.eventBytes, 0, 1e8);
  const cap = clamp(i.indexDocsPerSec, 0, 1e9);
  const writeRequestsPerSec = rps * w;
  const rowChangesPerSec = writeRequestsPerSec * rows;
  const cdcEventsPerSec = rowChangesPerSec * epr;
  const ingressBytesPerSec = cdcEventsPerSec * bytes;
  const effectiveCapacityDocsPerSec = Math.max(0, cap - clamp(i.searchQps, 0, 1e7) * clamp(i.docsPerQuery, 0, 1e6));
  const net = effectiveCapacityDocsPerSec - cdcEventsPerSec;
  return {
    writeRequestsPerSec,
    rowChangesPerSec,
    cdcEventsPerSec,
    ingressBytesPerSec,
    ingressBitsPerSec: ingressBytesPerSec * 8,
    demandDocsPerSec: cdcEventsPerSec,
    effectiveCapacityDocsPerSec,
    utilisation: effectiveCapacityDocsPerSec > 0 ? cdcEventsPerSec / effectiveCapacityDocsPerSec : cdcEventsPerSec > 0 ? Infinity : 0,
    netDocsPerSec: net,
    backlogGrowthDocsPerSec: Math.max(0, -net),
    drainDocsPerSec: Math.max(0, net),
    amplification: rps > 0 ? cdcEventsPerSec / rps : 0,
  };
}

/** Decimal units (kB = 1000 B). */
export function fmtBytesPerSec(b: number): { value: string; unit: string } {
  const x = Math.abs(num(b));
  if (x >= 1e9) return { value: (b / 1e9).toFixed(2), unit: "GB/s" };
  if (x >= 1e6) return { value: (b / 1e6).toFixed(2), unit: "MB/s" };
  return { value: (b / 1e3).toFixed(1), unit: "kB/s" };
}
export function fmtBitsPerSec(b: number): { value: string; unit: string } {
  const x = Math.abs(num(b));
  if (x >= 1e9) return { value: (b / 1e9).toFixed(2), unit: "Gbit/s" };
  return { value: (b / 1e6).toFixed(2), unit: "Mbit/s" };
}

// ---------- Backlog simulation ----------

export type Scenario = "steady" | "spike" | "outage";

/**
 * ASSUMPTION: per-worker throughput saturates with batch size: T(b) = peak * b / (b + b0),
 * where b0 is the batch size reaching half of peak (per-request overhead amortisation).
 */
export const BATCH_HALF = 50;
export function workerDocsPerSec(peakDocsPerSec: number, batchSize: number, b0 = BATCH_HALF): number {
  const b = clamp(batchSize, 1, 1e6);
  return (clamp(peakDocsPerSec, 0, 1e9) * b) / (b + b0);
}

export type SimInput = {
  arrivalDocsPerSec: number;
  peakPerWorker: number;
  batchSize: number;
  workers: number;
  scenario: Scenario;
  durationSec?: number;
};

export type SimResult = {
  backlog: number[]; // index = second
  arrival: number[];
  service: number[]; // capacity available at that second (0 during outage)
  capacityDocsPerSec: number;
  peak: number;
  peakAtSec: number;
  finalBacklog: number;
  /** Seconds from the end of the disturbance until backlog hits 0; null if never within the window. */
  drainSecAfterEvent: number | null;
  /** Steady-state growth (docs/s) when arrival > capacity, else 0. */
  steadyGrowthDocsPerSec: number;
  eventStartSec: number;
  eventEndSec: number;
};

export const SPIKE_MULT = 4;
const EVENT_START = 300;
const EVENT_LEN: Record<Scenario, number> = { steady: 0, spike: 180, outage: 300 };

export function simulateBacklog(i: SimInput): SimResult {
  const dur = Math.floor(clamp(i.durationSec ?? 1800, 60, 7200));
  const base = clamp(i.arrivalDocsPerSec, 0, 1e8);
  const workers = Math.floor(clamp(i.workers, 0, 10000));
  const cap = workers * workerDocsPerSec(i.peakPerWorker, i.batchSize);
  const start = EVENT_START;
  const end = start + EVENT_LEN[i.scenario];
  const backlog: number[] = [];
  const arrival: number[] = [];
  const service: number[] = [];
  let b = 0;
  let peak = 0;
  let peakAt = 0;
  for (let t = 0; t < dur; t++) {
    const inEvent = t >= start && t < end;
    const a = i.scenario === "spike" && inEvent ? base * SPIKE_MULT : base;
    const s = i.scenario === "outage" && inEvent ? 0 : cap;
    b = Math.max(0, b + a - Math.min(s, b + a));
    arrival.push(a);
    service.push(s);
    backlog.push(b);
    if (b > peak) { peak = b; peakAt = t; }
  }
  let drain: number | null = null;
  if (i.scenario !== "steady" && peak > 0) {
    for (let t = end; t < dur; t++) if (backlog[t] === 0) { drain = t - end; break; }
  }
  return {
    backlog, arrival, service, capacityDocsPerSec: cap, peak, peakAtSec: peakAt,
    finalBacklog: b, drainSecAfterEvent: drain,
    steadyGrowthDocsPerSec: Math.max(0, base - cap),
    eventStartSec: start, eventEndSec: end,
  };
}

// ---------- Architecture stages ----------

export type StageId = "mysql" | "debezium" | "kafka" | "consumer" | "es";
export type Stage = { id: StageId; name: string; responsibility: string; failure: string; scaling: string };

export const STAGES: readonly Stage[] = [
  { id: "mysql", name: "MySQL", responsibility: "System of record. Commits rows and appends every change to the binlog (row format).", failure: "Binlog purged before the connector reads it forces a snapshot; failover changes binlog position/GTID.", scaling: "Write throughput is bound by the primary; binlog volume grows with row changes, not requests." },
  { id: "debezium", name: "Debezium connector", responsibility: "Reads the binlog, turns each row change into a change event (before/after, op, source position) and publishes it.", failure: "Connector restart replays from the last committed offset, so duplicates (at-least-once) are possible; schema changes can break parsing.", scaling: "One connector task per MySQL source reads one binlog stream; it does not scale out by adding tasks." },
  { id: "kafka", name: "Kafka topic", responsibility: "Durably stores ordered events per partition; key = row primary key so one row stays in one partition.", failure: "Broker loss is covered by replication; retention shorter than outage loses unread events.", scaling: "Parallelism of consumers is capped by partition count; changing it later reshuffles key-to-partition mapping." },
  { id: "consumer", name: "Indexing consumer", responsibility: "Reads events, transforms them to search documents, writes in bulk, commits offsets only after success.", failure: "Poison message or slow bulk writes stall a partition; backlog (lag) grows while upstream keeps producing.", scaling: "Add consumers up to the partition count; bulk size trades latency for throughput." },
  { id: "es", name: "Elasticsearch", responsibility: "Holds the searchable copy; upserts by document id and deletes on tombstone.", failure: "Bulk rejections (429) under load; mapping conflicts reject documents.", scaling: "Indexing rate depends on shards, refresh interval and hardware; reads compete with indexing." },
];

export type Op = "insert" | "update" | "delete";

export type StageSnapshot = { stage: StageId; title: string; detail: string };

/** Synthetic walk of one event through the stages. Deterministic; values are made up. */
export function eventWalk(op: Op): StageSnapshot[] {
  const row = op === "insert" ? "id=42, name='Widget', price=10" : op === "update" ? "id=42, price 10 -> 12" : "id=42";
  const opc = op === "insert" ? "c" : op === "update" ? "u" : "d";
  const kafkaVal = op === "delete" ? "key=42, value={op:'d', before:{id:42,...}} then tombstone: key=42, value=null" : `key=42, value={op:'${opc}', ${op === "update" ? "before:{price:10}, after:{price:12}" : "after:{id:42,name:'Widget'}"}}`;
  return [
    { stage: "mysql", title: "Row committed", detail: `${op.toUpperCase()} on products: ${row}. Binlog entry appended.` },
    { stage: "debezium", title: "Change event built", detail: `op='${opc}'${op === "update" ? ", before and after images" : ""}, source file/pos attached.` },
    { stage: "kafka", title: "Appended to partition", detail: `${kafkaVal}. Same key -> same partition -> order preserved.` },
    { stage: "consumer", title: op === "delete" ? "Delete requested" : "Document upserted in bulk", detail: op === "delete" ? "Tombstone (null value) tells the consumer to delete doc 42; compaction later drops the key from the log." : "Event mapped to a search document with _id=42; added to the next bulk request." },
    { stage: "es", title: op === "delete" ? "Document deleted" : op === "insert" ? "Document created" : "Document replaced", detail: op === "delete" ? "doc 42 removed after next refresh." : "Searchable after the next refresh (about 1 s by default)." },
  ];
}
