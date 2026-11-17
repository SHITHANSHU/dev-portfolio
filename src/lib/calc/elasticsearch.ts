/**
 * Pure, deterministic models for the Elasticsearch sharding labs. Illustrative simplifications; no benchmark numbers.
 * Decimal units: 1 GB = 10^9 bytes. Defaults named here are Elasticsearch 8.x defaults; verify for your version.
 */
import { clamp } from "./redis";

export { clamp };

const EPS = 1e-9;
const ceilSafe = (x: number): number => Math.ceil(x - EPS);

/* ------------------------------------------------------------------ */
/* Lab 1: shard sizing                                                 */
/* ------------------------------------------------------------------ */

/** Elastic's sizing guidance band for primary shards (guidance, not a hard rule). */
export const SHARD_BAND_MIN_GB = 10;
export const SHARD_BAND_MAX_GB = 50;
/** Disk watermarks, fraction of disk used: low, high, flood stage (8.x defaults). */
export const WATERMARK_LOW = 0.85;
export const WATERMARK_HIGH = 0.9;
export const WATERMARK_FLOOD = 0.95;
/** `cluster.max_shards_per_node` default in 8.x. */
export const MAX_SHARDS_PER_NODE = 1000;
/** Cap on retained-index rectangles drawn by the lab. */
export const STRIP_MAX = 60;

export type SizingLayout = "rollover" | "daily";
export type SearchScope = "day" | "retention";
export type SizingLimit = "shardSizeLarge" | "shardSizeSmall" | "diskWatermark" | "shardsPerNode" | "none";

export type SizingInput = {
  ingestGBPerDay: number;
  retentionDays: number;
  replicas: number;
  targetShardGB: number;
  primaries: number;
  nodes: number;
  diskPerNodeGB: number;
  layout: SizingLayout;
  searchesPerSec: number;
  scope: SearchScope;
};

export type SizingWarning = { kind: Exclude<SizingLimit, "none">; text: string };

export type SizingView = {
  rolloverDays: number;
  indicesRetained: number;
  /** Indices drawn in the strip (capped). */
  stripCount: number;
  primaryShardGB: number;
  totalShards: number;
  shardsPerNode: number;
  /** Primary + replica data, GB. */
  storedGB: number;
  /** Fraction of total disk used; may exceed 1. */
  diskUtil: number;
  nodesForDisk: number;
  shardsQueriedPerSearch: number;
  shardRequestsPerSec: number;
  warnings: SizingWarning[];
  /** Most severe limit hit; severity order: shardsPerNode, diskWatermark, shardSizeLarge, shardSizeSmall. */
  firstLimit: SizingLimit;
};

export const SIZING_DEFAULTS: SizingInput = {
  ingestGBPerDay: 200,
  retentionDays: 30,
  replicas: 1,
  targetShardGB: 40,
  primaries: 6,
  nodes: 12,
  diskPerNodeGB: 2000,
  layout: "rollover",
  searchesPerSec: 50,
  scope: "day",
};

export function shardSizing(raw: SizingInput): SizingView {
  const ingest = clamp(raw.ingestGBPerDay, 0, 5000);
  const retention = Math.round(clamp(raw.retentionDays, 1, 365));
  const replicas = Math.round(clamp(raw.replicas, 0, 3));
  const target = clamp(raw.targetShardGB, 1, 100);
  const primaries = Math.round(clamp(raw.primaries, 1, 64));
  const nodes = Math.round(clamp(raw.nodes, 1, 200));
  const disk = clamp(raw.diskPerNodeGB, 100, 20000);
  const q = clamp(raw.searchesPerSec, 0, 5000);
  const copies = 1 + replicas;

  // Days of ingest per index. Size rollover fills `target` GB per primary; the age cap is the retention window.
  const rolloverDays = raw.layout === "daily" ? 1 : ingest > 0 ? Math.min(retention, (target * primaries) / ingest) : retention;
  const indicesRetained = Math.max(1, ceilSafe(retention / rolloverDays));
  const primaryShardGB = (ingest * rolloverDays) / primaries;
  const totalShards = indicesRetained * primaries * copies;
  const shardsPerNode = totalShards / nodes;
  const storedGB = ingest * retention * copies;
  const diskUtil = storedGB / (nodes * disk);
  const nodesForDisk = Math.max(1, ceilSafe(storedGB / (disk * WATERMARK_LOW)));

  const indicesInScope = raw.scope === "retention" ? indicesRetained : Math.min(indicesRetained, Math.max(1, ceilSafe(1 / rolloverDays)));
  const shardsQueriedPerSearch = indicesInScope * primaries;
  const shardRequestsPerSec = q * shardsQueriedPerSearch;

  const warnings: SizingWarning[] = [];
  if (shardsPerNode > MAX_SHARDS_PER_NODE) warnings.push({ kind: "shardsPerNode", text: `${shardsPerNode.toFixed(0)} shards per node exceeds the ${MAX_SHARDS_PER_NODE} default limit; index creation would be blocked.` });
  if (diskUtil > WATERMARK_LOW) warnings.push({ kind: "diskWatermark", text: `Disk ${(diskUtil * 100).toFixed(0)}% is past the ${WATERMARK_LOW * 100}% low watermark.` });
  if (primaryShardGB > SHARD_BAND_MAX_GB) warnings.push({ kind: "shardSizeLarge", text: `${primaryShardGB.toFixed(1)} GB primaries are above the ${SHARD_BAND_MAX_GB} GB guidance; recovery and relocation take longer.` });
  if (ingest > 0 && primaryShardGB < SHARD_BAND_MIN_GB) warnings.push({ kind: "shardSizeSmall", text: `${primaryShardGB.toFixed(2)} GB primaries are below the ${SHARD_BAND_MIN_GB} GB guidance; per-shard overhead dominates.` });

  return {
    rolloverDays,
    indicesRetained,
    stripCount: Math.min(indicesRetained, STRIP_MAX),
    primaryShardGB,
    totalShards,
    shardsPerNode,
    storedGB,
    diskUtil,
    nodesForDisk,
    shardsQueriedPerSearch,
    shardRequestsPerSec,
    warnings,
    firstLimit: warnings[0]?.kind ?? "none",
  };
}

/* ------------------------------------------------------------------ */
/* Lab 2: routing and hot shards                                       */
/* ------------------------------------------------------------------ */

export type RoutingMode = "id" | "tenant" | "partition";

export const ROUTING_TICKS = 40;
export const DOCS_PER_TICK = 24;
export const TENANTS = 12;
export const NODES = 3;
const ROUTING_SEED = 7;

/** Small deterministic PRNG (mulberry32). Returns floats in [0, 1). */
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

/** FNV-1a, 32 bit. Stand-in for Elasticsearch's murmur3 so the lab is deterministic and dependency free. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Target shard of a document. Without a partition size: `hash(routing) mod primaries`.
 * With `partitionSize = p` (1 < p < primaries): `(hash(routing) + hash(id) mod p) mod primaries`.
 * Treats `num_routing_shards` as equal to `primaries` (routing factor 1).
 */
export function shardFor(routing: string, id: string, primaries: number, partitionSize: number | null): number {
  const n = Math.max(1, Math.floor(primaries));
  const base = hashString(routing);
  if (partitionSize !== null && partitionSize > 1 && n > 1) {
    const p = Math.min(Math.floor(partitionSize), n - 1);
    return (base + (hashString(id) % p)) % n;
  }
  return base % n;
}

/** Normalised Zipf weights, rank 1 first. `s = 0` is uniform. */
export function zipfWeights(n: number, s: number): number[] {
  const count = Math.max(1, Math.floor(n));
  const exp = clamp(s, 0, 4);
  const raw = Array.from({ length: count }, (_, i) => 1 / Math.pow(i + 1, exp));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

/** Partition size actually used: 2 .. primaries-1 (Elasticsearch requires 1 < p < number_of_shards). */
export const effectivePartition = (p: number, primaries: number): number => Math.max(1, Math.min(Math.round(clamp(p, 2, 5)), primaries - 1));

export type RoutingParams = {
  mode: RoutingMode;
  partitionSize: number;
  skew: number;
  nodeCapacityPerTick: number;
  primaries: number;
};

export type BatchDoc = { slot: number; tenant: number; shard: number; node: number; accepted: boolean };

export type TickEvent = {
  tick: number;
  docs: number;
  hotShard: number;
  hotShardDocs: number;
  hotTenant: number;
  hotTenantDocs: number;
  /** Per node: documents routed to it this tick and how many it rejected. */
  nodes: { arrivals: number; rejected: number }[];
};

export type RoutingState = {
  tick: number;
  primaries: number;
  /** Documents routed to each shard (attempted, whether or not accepted). */
  routed: number[];
  /** Documents indexed per shard. */
  accepted: number[];
  rejectedTotal: number;
  rejectedByNode: number[];
  /** Skew ratio: max routed / mean routed (1 = perfectly even; 0 before any docs). */
  skewRatio: number;
  hotShard: number;
  lastBatch: BatchDoc[];
  events: TickEvent[];
  /** Tenant with the most documents so far (rank 1 by construction when skew > 0). */
  biggestTenant: number;
};

export const tenantName = (t: number): string => `t${String(t + 1).padStart(2, "0")}`;
export const shardNode = (shard: number): number => shard % NODES;

export const ROUTING_DEFAULTS: RoutingParams = { mode: "tenant", partitionSize: 3, skew: 1.2, nodeCapacityPerTick: 10, primaries: 6 };

/**
 * Index `DOCS_PER_TICK` synthetic documents per tick for `ticks` ticks. Each node accepts at most
 * `nodeCapacityPerTick` documents per tick (the write queue is not carried over); the rest are rejected (HTTP 429).
 * Pure: same params and tick count always give the same state, and state at t+1 extends state at t.
 */
export function simulateRouting(raw: RoutingParams, ticksRaw: number): RoutingState {
  const mode = raw.mode;
  const primaries = Math.round(clamp(raw.primaries, 1, 64));
  const cap = Math.round(clamp(raw.nodeCapacityPerTick, 0, 1000));
  const p = mode === "partition" ? effectivePartition(raw.partitionSize, primaries) : null;
  const ticks = Math.round(clamp(ticksRaw, 0, ROUTING_TICKS));
  const weights = zipfWeights(TENANTS, raw.skew);
  const cum: number[] = [];
  let acc = 0;
  for (const w of weights) { acc += w; cum.push(acc); }
  const rng = mulberry32(ROUTING_SEED);

  const routed = Array<number>(primaries).fill(0);
  const accepted = Array<number>(primaries).fill(0);
  const rejectedByNode = Array<number>(NODES).fill(0);
  const tenantDocs = Array<number>(TENANTS).fill(0);
  const events: TickEvent[] = [];
  let lastBatch: BatchDoc[] = [];

  for (let t = 1; t <= ticks; t++) {
    const arrivals = Array<number>(NODES).fill(0);
    const rejected = Array<number>(NODES).fill(0);
    const tickShard = Array<number>(primaries).fill(0);
    const tickTenant = Array<number>(TENANTS).fill(0);
    const batch: BatchDoc[] = [];
    for (let slot = 0; slot < DOCS_PER_TICK; slot++) {
      const u = rng();
      let tenant = cum.findIndex((c) => u < c);
      if (tenant < 0) tenant = TENANTS - 1;
      const id = `d${t}-${slot}`;
      const tenantId = tenantName(tenant);
      const shard = shardFor(mode === "id" ? id : tenantId, id, primaries, p);
      const node = shardNode(shard);
      arrivals[node] = (arrivals[node] ?? 0) + 1;
      const ok = (arrivals[node] ?? 0) <= cap;
      routed[shard] = (routed[shard] ?? 0) + 1;
      tickShard[shard] = (tickShard[shard] ?? 0) + 1;
      tickTenant[tenant] = (tickTenant[tenant] ?? 0) + 1;
      tenantDocs[tenant] = (tenantDocs[tenant] ?? 0) + 1;
      if (ok) accepted[shard] = (accepted[shard] ?? 0) + 1;
      else { rejected[node] = (rejected[node] ?? 0) + 1; rejectedByNode[node] = (rejectedByNode[node] ?? 0) + 1; }
      batch.push({ slot, tenant, shard, node, accepted: ok });
    }
    const hotShardDocs = Math.max(...tickShard);
    const hotTenantDocs = Math.max(...tickTenant);
    events.push({
      tick: t,
      docs: DOCS_PER_TICK,
      hotShard: tickShard.indexOf(hotShardDocs),
      hotShardDocs,
      hotTenant: tickTenant.indexOf(hotTenantDocs),
      hotTenantDocs,
      nodes: arrivals.map((a, i) => ({ arrivals: a, rejected: rejected[i] ?? 0 })),
    });
    lastBatch = batch;
  }

  const total = routed.reduce((a, b) => a + b, 0);
  const maxRouted = Math.max(...routed);
  return {
    tick: ticks,
    primaries,
    routed,
    accepted,
    rejectedTotal: rejectedByNode.reduce((a, b) => a + b, 0),
    rejectedByNode,
    skewRatio: total > 0 ? maxRouted / (total / primaries) : 0,
    hotShard: routed.indexOf(maxRouted),
    lastBatch,
    events,
    biggestTenant: tenantDocs.indexOf(Math.max(...tenantDocs)),
  };
}

/** Shards a search for one tenant must touch. `id` mode cannot route by tenant, so it queries every shard. */
export function shardsSearchedForTenant(mode: RoutingMode, primaries: number, partitionSize: number): number {
  const n = Math.max(1, Math.round(primaries));
  if (mode === "tenant") return 1;
  if (mode === "partition") return Math.min(n, effectivePartition(partitionSize, n));
  return n;
}

/** One event-log line for a tick. */
export function describeTick(e: TickEvent, cap: number): string {
  const over = e.nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.rejected > 0);
  const tail = over.length
    ? over.map(({ n, i }) => `node-${i + 1} queue ${n.arrivals} > ${cap}: ${n.rejected} rejected (429)`).join("; ")
    : "no rejections";
  return `t${e.tick} · ${e.docs} docs · shard ${e.hotShard} +${e.hotShardDocs} (tenant ${tenantName(e.hotTenant)} ×${e.hotTenantDocs}) · ${tail}`;
}

/* ------------------------------------------------------------------ */
/* Lab 3: reindex behind an alias                                      */
/* ------------------------------------------------------------------ */

export type ReindexStrategy = "swapRightAfter" | "catchUp" | "pauseWrites" | "cdcReplay";

export const REINDEX_TICKS = 30;
export const SNAPSHOT_DOCS = 400;

export type ReindexParams = {
  writesPerTick: number;
  deletesPerTick: number;
  copyPerTick: number;
  strategy: ReindexStrategy;
};

export type ReindexPhase = "copy" | "catchUp" | "paused" | "swapped";

export type ReindexState = {
  tick: number;
  phase: ReindexPhase;
  /** Snapshot documents copied into v2. */
  copied: number;
  copyDoneTick: number | null;
  swapTick: number | null;
  pauseTicks: number;
  /** Document counts for the two indices (counts, not documents). */
  v1Count: number;
  v2Count: number;
  /** Writes that reached v1 but are not in v2. */
  missingWrites: number;
  /** Docs deleted in v1 (or the live index) but still present in v2. */
  resurrectedDeletes: number;
  /** Writes held at the client while paused. */
  queued: number;
  events: string[];
};

export const REINDEX_DEFAULTS: ReindexParams = { writesPerTick: 10, deletesPerTick: 2, copyPerTick: 60, strategy: "swapRightAfter" };

/**
 * Count-based reindex model. At tick 0 (T0) v2 is created and a snapshot of v1's `SNAPSHOT_DOCS` documents is
 * taken; the snapshot copy runs at `copyPerTick`. Every later tick brings `writesPerTick` inserts/updates and
 * `deletesPerTick` deletes of snapshot documents. Because the copy reads the snapshot, every delete after T0 is
 * resurrected in v2 unless the strategy replays or reconciles deletes. Pure and deterministic.
 */
export function simulateReindex(raw: ReindexParams, upToRaw: number): ReindexState {
  const w = Math.round(clamp(raw.writesPerTick, 0, 1000));
  const d = Math.round(clamp(raw.deletesPerTick, 0, 1000));
  const copy = Math.max(1, Math.round(clamp(raw.copyPerTick, 1, 100000)));
  const upTo = Math.round(clamp(upToRaw, 0, REINDEX_TICKS));
  const strategy = raw.strategy;

  let copied = 0;
  let copyDoneTick: number | null = null;
  let swapTick: number | null = null;
  let paused = false;
  let pauseTicks = 0;
  let wV1 = 0, dV1 = 0; // applied to v1 before the swap
  let wSynced = 0, dSynced = 0; // reflected in v2 via catch-up, replay or reconcile
  let wDirect = 0, dDirect = 0; // applied to v2 after the swap
  let qW = 0, qD = 0; // held at the client during a pause
  let phase: ReindexPhase = "copy";
  const events: string[] = [`t0 · v2 created, snapshot of v1 taken (${SNAPSHOT_DOCS} docs), T0 recorded`];

  for (let t = 1; t <= upTo; t++) {
    const log = (s: string) => events.push(`t${t} · ${s}`);
    // 1. client traffic
    if (swapTick !== null) { wDirect += w; dDirect += d; }
    else if (paused) { qW += w; qD += d; pauseTicks++; }
    else { wV1 += w; dV1 = Math.min(SNAPSHOT_DOCS, dV1 + d); }

    // 2. reindex work (before the swap)
    if (swapTick === null) {
      const copyWasDone = copyDoneTick !== null;
      if (!copyWasDone) {
        copied = Math.min(SNAPSHOT_DOCS, copied + copy);
        if (copied >= SNAPSHOT_DOCS) {
          copyDoneTick = t;
          phase = "catchUp";
          log(`reindex snapshot complete (${SNAPSHOT_DOCS} docs) · ${wV1 - wSynced} writes and ${dV1 - dSynced} deletes since T0 not in v2`);
        } else {
          log(`copied ${copied}/${SNAPSHOT_DOCS} · ${wV1} writes and ${dV1} deletes on v1 since T0`);
        }
      } else {
        const pendW = wV1 - wSynced;
        const pendD = dV1 - dSynced;
        if (strategy === "catchUp") {
          const n = Math.min(pendW, copy);
          wSynced += n;
          log(`catch-up by updated_at copied ${n} docs · ${wV1 - wSynced} writes still pending, deletes invisible`);
        } else if (strategy === "pauseWrites" || strategy === "cdcReplay") {
          const ops = pendW + pendD;
          const sw = ops > 0 ? Math.min(pendW, Math.ceil((copy * pendW) / ops)) : 0;
          const sd = Math.min(pendD, copy - sw);
          wSynced += sw; dSynced += sd;
          log(`${strategy === "pauseWrites" ? "writes paused, reconcile" : "log replay"} applied ${sw} writes and ${sd} deletes · ${(wV1 - wSynced) + (dV1 - dSynced)} ops pending`);
        }
      }

      // 3. swap decision (end of tick)
      if (copyDoneTick !== null) {
        const pendW = wV1 - wSynced;
        const pendD = dV1 - dSynced;
        let doSwap = false;
        if (strategy === "swapRightAfter") doSwap = true;
        else if (strategy === "catchUp") doSwap = pendW <= w;
        else if (strategy === "cdcReplay") doSwap = pendW + pendD <= w + d;
        else {
          if (!paused && pendW + pendD > 0 && copyDoneTick === t) { paused = true; phase = "paused"; log(`writes paused at the client (queue grows ${w} per tick)`); }
          doSwap = pendW + pendD === 0;
        }
        if (doSwap) {
          const missing = pendW;
          const resurrected = pendD;
          if (strategy === "catchUp") wSynced = wV1; // final catch-up pass after the swap
          if (strategy === "cdcReplay") { wSynced = wV1; dSynced = dV1; }
          if (paused) { wDirect += qW; dDirect += qD; qW = 0; qD = 0; paused = false; }
          swapTick = t;
          phase = "swapped";
          log(`alias swapped v1 → v2 · ${strategy === "swapRightAfter" ? `${missing} writes missing, ${resurrected} deleted docs resurrected` : strategy === "catchUp" ? `final catch-up copies ${missing} docs, ${resurrected} deleted docs resurrected` : "no divergence"}`);
        }
      }
    } else if (t === swapTick + 1) {
      log("writes go straight to v2");
    }
  }

  const v1Count = SNAPSHOT_DOCS + wV1 - dV1;
  const v2Count = Math.max(0, copied + wSynced + wDirect - (dSynced + dDirect));
  return {
    tick: upTo,
    phase,
    copied,
    copyDoneTick,
    swapTick,
    pauseTicks,
    v1Count,
    v2Count,
    missingWrites: wV1 - wSynced,
    resurrectedDeletes: dV1 - dSynced,
    queued: qW + qD,
    events,
  };
}

export type ReindexOutcome = {
  swapped: boolean;
  swapTick: number | null;
  missingWrites: number;
  resurrectedDeletes: number;
  pauseTicks: number;
  consistent: boolean;
};

export function reindexOutcome(s: ReindexState): ReindexOutcome {
  const swapped = s.swapTick !== null;
  return {
    swapped,
    swapTick: s.swapTick,
    missingWrites: s.missingWrites,
    resurrectedDeletes: s.resurrectedDeletes,
    pauseTicks: s.pauseTicks,
    consistent: swapped && s.missingWrites === 0 && s.resurrectedDeletes === 0,
  };
}
