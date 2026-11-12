/** Pure, deterministic models for the Redis labs. Illustrative simplifications; no benchmark numbers. */

export const clamp = (v: number, lo: number, hi: number): number =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;

/** Decimal units (kB = 1000 B). */
export function fmtBytesDecimal(bytes: number): string {
  const b = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (b < 1_000) return `${Math.round(b)} B`;
  if (b < 1_000_000) return `${(b / 1_000).toFixed(1)} kB`;
  if (b < 1_000_000_000) return `${(b / 1_000_000).toFixed(1)} MB`;
  return `${(b / 1_000_000_000).toFixed(2)} GB`;
}

/* ------------------------------------------------------------------ */
/* Lab 1: persistence                                                  */
/* ------------------------------------------------------------------ */

export type PersistMode = "rdb" | "aof" | "hybrid";
export type FsyncPolicy = "always" | "everysec" | "no";

/** Timeline length in seconds. */
export const TIMELINE_SEC = 60;
/** Typical Linux dirty-page expiry used for `appendfsync no` (kernel dependent, ~30 s). */
export const OS_FLUSH_SEC = 30;

export type PersistInput = {
  writesPerSec: number;
  mode: PersistMode;
  fsync: FsyncPolicy;
  /** `save <seconds> <changes>`: snapshot when both thresholds are met. */
  snapshotSeconds: number;
  snapshotChanges: number;
  crashSec: number;
  datasetGB: number;
};

export type PersistView = {
  writesPerSec: number;
  crashSec: number;
  /** Writes acknowledged by the crash instant. */
  acked: number;
  /** Acknowledged writes missing after recovery. */
  lost: number;
  /** Time of the last durable point at or before the crash (0 = none). */
  durableSec: number;
  recoverySource: string;
  /** Worst-case loss window in seconds (edge cases noted in `windowNote`). */
  worstWindowSec: number;
  worstWindowWrites: number;
  windowNote: string;
  snapshotPeriodSec: number;
  snapshotTimes: number[];
  fsyncTimes: number[];
  fsyncEveryWrite: boolean;
  /** Ordinal 1..5, qualitative only. */
  latencyIndex: number;
  throughputIndex: number;
  costText: string;
  cowRisk: "low" | "moderate" | "high";
  cowPeakExtraGB: number;
  usesAof: boolean;
};

const fsyncWindow = (p: FsyncPolicy): number => (p === "always" ? 0 : p === "everysec" ? 1 : OS_FLUSH_SEC);

/** Number of writes acknowledged by time t (uniform arrival, one every 1/rate s). */
const writesBy = (rate: number, t: number): number => Math.floor(rate * t + 1e-9);

export function persistenceView(raw: PersistInput): PersistView {
  const rate = clamp(raw.writesPerSec, 0, 1_000_000);
  const crash = clamp(raw.crashSec, 0, TIMELINE_SEC);
  const snapSec = clamp(raw.snapshotSeconds, 1, TIMELINE_SEC);
  const snapChanges = clamp(raw.snapshotChanges, 1, 10_000_000);
  const datasetGB = clamp(raw.datasetGB, 0, 10_000);
  const { mode, fsync } = raw;

  // Snapshot rule: at least `snapChanges` changes AND at least `snapSec` seconds since the last save.
  const period = rate > 0 ? Math.max(snapSec, snapChanges / rate) : snapSec;
  const hasSnapshots = mode !== "aof" && rate > 0;
  const snapshotTimes: number[] = [];
  if (hasSnapshots) for (let k = 1; k * period <= TIMELINE_SEC + 1e-9; k++) snapshotTimes.push(k * period);

  const usesAof = mode !== "rdb";
  const win = fsyncWindow(fsync);
  const fsyncEveryWrite = usesAof && fsync === "always";
  const fsyncTimes: number[] = [];
  if (usesAof && fsync !== "always") for (let t = win; t <= TIMELINE_SEC + 1e-9; t += win) fsyncTimes.push(t);

  // A durability event landing exactly on the crash instant is treated as not yet done (conservative).
  let durableSec: number;
  let recoverySource: string;
  if (usesAof) {
    durableSec = fsync === "always" ? crash : Math.max(0, (Math.ceil(crash / win) - 1) * win);
    recoverySource = mode === "hybrid"
      ? "AOF is preferred on restart (its base file is an RDB preamble); the RDB save rules are only a backup here."
      : "Replay of the AOF (base file + incr files + manifest in Redis 7+).";
  } else {
    durableSec = snapshotTimes.filter((s) => s < crash).pop() ?? 0;
    recoverySource = "Load of the last dump.rdb; anything after that snapshot is gone.";
  }

  const acked = writesBy(rate, crash);
  const lost = Math.max(0, acked - writesBy(rate, durableSec));

  let worstWindowSec: number;
  let windowNote: string;
  if (usesAof) {
    worstWindowSec = win;
    windowNote =
      fsync === "always"
        ? "About 0 acknowledged-write loss, modulo disk write caches, virtualised or lying storage, and filesystem behaviour."
        : fsync === "everysec"
          ? "Up to about 1 s; in edge cases (a slow fsync delaying the next one) about 2 s."
          : `Depends on when the OS flushes dirty pages; typically up to about ${OS_FLUSH_SEC} s on Linux, and a process crash alone loses nothing already written to the page cache.`;
  } else {
    worstWindowSec = rate > 0 ? period : 0;
    windowNote = "Everything since the last snapshot, up to the snapshot interval (plus the time the snapshot itself takes).";
  }

  // Qualitative ordinals only (1 = least cost, 5 = most). Not measurements.
  const aofIdx = fsync === "always" ? 5 : fsync === "everysec" ? 3 : 2;
  const latencyIndex = usesAof ? aofIdx : 1;
  const throughputIndex = usesAof ? aofIdx : 1;
  const costText = usesAof
    ? fsync === "always"
      ? "Highest: every write waits for an fsync (Redis batches writes of one event-loop pass, which softens it)."
      : fsync === "everysec"
        ? "Moderate: fsync runs in a background thread, but a slow disk can still stall writes."
        : "Low on the write path: Redis only write()s; the OS decides when to flush."
    : "Lowest on the write path; cost shows up as periodic fork pauses and CPU/disk bursts during snapshots.";

  const cowRisk: PersistView["cowRisk"] = rate <= 1_000 ? "low" : rate <= 20_000 ? "moderate" : "high";

  return {
    writesPerSec: rate, crashSec: crash, acked, lost, durableSec, recoverySource,
    worstWindowSec, worstWindowWrites: writesBy(rate, worstWindowSec), windowNote,
    snapshotPeriodSec: period, snapshotTimes, fsyncTimes, fsyncEveryWrite,
    latencyIndex, throughputIndex, costText, cowRisk,
    // Upper bound: every page rewritten while the child lives => up to one extra copy of the dataset.
    cowPeakExtraGB: datasetGB, usesAof,
  };
}

/* ------------------------------------------------------------------ */
/* Lab 2: Pub/Sub vs Streams                                           */
/* ------------------------------------------------------------------ */

export type DeliveryParams = {
  messages: number;
  consumers: number;
  /** Tick at which consumer/subscriber 1 goes offline. */
  offlineFrom: number;
  /** Offline duration in ticks (0 = never offline). */
  offlineTicks: number;
  crashBeforeAck: boolean;
  /** Ticks a delivered entry may sit un-acked before XAUTOCLAIM may take it. */
  ackTimeout: number;
};

export type ConsumerRow = { name: string; delivered: number; missed: number; pending: number; duplicates: number; online: boolean };

export type DeliveryResult = {
  lastTick: number;
  tick: number;
  pubsub: { rows: ConsumerRow[]; log: string[]; totalMissed: number };
  streams: { rows: ConsumerRow[]; log: string[]; retained: number; acked: number; pendingTotal: number; neverDelivered: number; redeliveries: number };
};

const BASE_MS = 1_700_000_000_000;
export const entryId = (i: number): string => `${BASE_MS + i * 100}-0`;

type Entry = { idx: number; delivered: boolean; holder: number; deliveredAt: number; acked: boolean; processedBy: number[]; doomed: boolean };

export function normalizeDelivery(p: DeliveryParams): DeliveryParams {
  return {
    messages: Math.round(clamp(p.messages, 1, 30)),
    consumers: Math.round(clamp(p.consumers, 1, 4)),
    offlineFrom: Math.round(clamp(p.offlineFrom, 0, 29)),
    offlineTicks: Math.round(clamp(p.offlineTicks, 0, 30)),
    crashBeforeAck: p.crashBeforeAck,
    ackTimeout: Math.round(clamp(p.ackTimeout, 1, 20)),
  };
}

/**
 * Tick-based simulation. Per tick: XADD/PUBLISH, ack of earlier deliveries, XAUTOCLAIM, XREADGROUP (one entry per online consumer).
 * `upTo` stops after that tick (inclusive); `lastTick` is only the true final tick when `upTo` is omitted. Deterministic: no clock, no randomness.
 */
export function simulateDelivery(raw: DeliveryParams, upTo = Number.POSITIVE_INFINITY): DeliveryResult {
  const p = normalizeDelivery(raw);
  const C = p.consumers;
  const offEnd = p.offlineFrom + p.offlineTicks; // exclusive
  const isOffline = (c: number, t: number) => c === 0 && p.offlineTicks > 0 && t >= p.offlineFrom && t < offEnd;

  const psRows: ConsumerRow[] = Array.from({ length: C }, (_, c) => ({ name: `S${c + 1}`, delivered: 0, missed: 0, pending: 0, duplicates: 0, online: true }));
  const stRows: ConsumerRow[] = Array.from({ length: C }, (_, c) => ({ name: `C${c + 1}`, delivered: 0, missed: 0, pending: 0, duplicates: 0, online: true }));
  const psLog: string[] = [];
  const stLog: string[] = [];
  const entries: Entry[] = [];
  let rr = 0;
  let redeliveries = 0;
  let acked = 0;
  let lastTick = 0;
  let tickReached = 0;

  const hardCap = p.messages + p.offlineFrom + p.offlineTicks + p.ackTimeout + p.messages + 5;
  for (let t = 0; t < hardCap; t++) {
    const producing = t < p.messages;
    // Run until everything is published, offline window over, and the stream is fully acked.
    if (!producing && t >= offEnd && entries.every((e) => e.acked)) break;
    lastTick = t;
    if (t > upTo) break;
    tickReached = t;

    for (let c = 0; c < C; c++) { const r = stRows[c]; if (r) r.online = !isOffline(c, t); const q = psRows[c]; if (q) q.online = !isOffline(c, t); }

    // 1. Producer
    if (producing) {
      const who = psRows.map((r, c) => {
        if (isOffline(c, t)) { r.missed++; return `${r.name} missed`; }
        r.delivered++; return `${r.name} got`;
      });
      psLog.push(`t${t}: PUBLISH m${t} -> ${who.join(", ")}`);
      entries.push({ idx: t, delivered: false, holder: -1, deliveredAt: -1, acked: false, processedBy: [], doomed: false });
      stLog.push(`t${t}: XADD ${entryId(t)} (m${t}) retained in the log`);
    }

    // 2. XACK for entries delivered on an earlier tick by a consumer that has not crashed
    for (const e of entries) {
      if (e.delivered && !e.acked && !e.doomed && e.deliveredAt < t) {
        e.acked = true; acked++;
        const r = stRows[e.holder]; if (r) r.pending--;
        stLog.push(`t${t}: ${r?.name ?? "?"} XACK m${e.idx}`);
      }
    }

    // 3. XAUTOCLAIM idle entries to an online consumer
    for (const e of entries) {
      if (e.delivered && !e.acked && t - e.deliveredAt >= p.ackTimeout) {
        const target = pickOnline(C, t, rr, isOffline);
        if (target < 0) continue;
        rr = (target + 1) % C;
        const from = stRows[e.holder]; if (from) from.pending--;
        const to = stRows[target];
        if (!to) continue;
        const dup = e.processedBy.includes(e.holder);
        e.holder = target; e.deliveredAt = t; e.doomed = false; redeliveries++;
        to.delivered++; to.pending++;
        if (dup) to.duplicates++;
        e.processedBy.push(target);
        stLog.push(`t${t}: XAUTOCLAIM m${e.idx} (idle >= ${p.ackTimeout}) -> ${to.name}${dup ? " [duplicate: effect already applied before the crash]" : ""}`);
      }
    }

    // 4. XREADGROUP: each online consumer takes at most one undelivered entry; the crashing consumer reads then dies before XACK.
    const crashNow = p.crashBeforeAck && p.offlineTicks > 0 && t === p.offlineFrom;
    const rot = Array.from({ length: C }, (_, k) => (rr + k) % C);
    const order = crashNow ? [0, ...rot.filter((c) => c !== 0)] : rot;
    let lastTaker = -1;
    for (const c of order) {
      const crashing = crashNow && c === 0;
      if (isOffline(c, t) && !crashing) continue;
      const e = entries.find((x) => !x.delivered);
      if (!e) break;
      const r = stRows[c]; if (!r) continue;
      e.delivered = true; e.holder = c; e.deliveredAt = t; e.doomed = crashing; e.processedBy.push(c);
      r.delivered++; r.pending++;
      stLog.push(`t${t}: XREADGROUP > -> ${r.name} gets m${e.idx}${crashing ? " then CRASHES before XACK (entry stays in the PEL)" : ""}`);
      lastTaker = c;
    }
    if (lastTaker >= 0) rr = (lastTaker + 1) % C;
    if (p.offlineTicks > 0 && t === p.offlineFrom) {
      psLog.push(`t${t}: S1 goes offline for ${p.offlineTicks} ticks (no history is kept for it)`);
      stLog.push(`t${t}: C1 goes offline for ${p.offlineTicks} ticks`);
    }
    if (p.offlineTicks > 0 && t === offEnd) {
      psLog.push(`t${t}: S1 is back; earlier messages are gone`);
      stLog.push(`t${t}: C1 is back`);
    }
  }

  const pendingTotal = stRows.reduce((s, r) => s + r.pending, 0);
  const neverDelivered = entries.filter((e) => !e.delivered).length;
  return {
    lastTick, tick: Math.min(tickReached, lastTick),
    pubsub: { rows: psRows, log: psLog, totalMissed: psRows.reduce((s, r) => s + r.missed, 0) },
    streams: { rows: stRows, log: stLog, retained: entries.length, acked, pendingTotal, neverDelivered, redeliveries },
  };
}

function pickOnline(C: number, t: number, start: number, isOffline: (c: number, t: number) => boolean): number {
  for (let k = 0; k < C; k++) {
    const c = (start + k) % C;
    if (!isOffline(c, t)) return c;
  }
  return -1;
}

/* ------------------------------------------------------------------ */
/* Lab 3: stream + consumer groups                                     */
/* ------------------------------------------------------------------ */

export type TrimMode = "none" | "exact" | "approx";
/** Redis default `stream-node-max-entries`: approximate trimming removes whole macro nodes only. */
export const STREAM_NODE_ENTRIES = 100;
/** Illustrative: producer writes all entries over this many seconds. */
export const PRODUCE_SEC = 10;
/** Illustrative: entries/s one consumer at speed 1.0 can process. */
export const CONSUMER_RATE = 20;

export const streamEntryId = (i: number): string => `${BASE_MS + Math.floor(i / 3) * 5}-${i % 3}`;

export type StreamInput = {
  entries: number;
  consumersPerGroup: number;
  groups: number;
  trimMode: TrimMode;
  maxlen: number;
  /** 0..90: slowest consumer runs at (100 - skew)% of the fastest. */
  skewPct: number;
  bytesPerEntry: number;
};

export type GroupView = {
  name: string;
  consumers: { name: string; speed: number; entries: number }[];
  delivered: number;
  lag: number;
  /** Entries trimmed away before this group's cursor reached them. */
  lostToTrim: number;
};

export type StreamView = {
  entries: number;
  retained: number;
  removed: number;
  firstRetainedId: string;
  lastId: string;
  memoryBytes: number;
  memoryUntrimmedBytes: number;
  overshoot: number;
  groups: GroupView[];
};

/** Largest-remainder apportionment: sums exactly to `total`; ties go to the lower index. */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (weights.length === 0) return [];
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (Math.max(0, w) / sum) * total);
  const base = exact.map(Math.floor);
  let left = total - base.reduce((s, b) => s + b, 0);
  const order = exact.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const o of order) { if (left <= 0) break; base[o.i] = (base[o.i] ?? 0) + 1; left--; }
  return base;
}

export function trimView(entries: number, mode: TrimMode, maxlen: number): { retained: number; removed: number } {
  const n = Math.max(0, Math.floor(entries));
  const m = Math.max(1, Math.floor(maxlen));
  if (mode === "none" || n <= m) return { retained: n, removed: 0 };
  const removed = mode === "exact" ? n - m : Math.floor((n - m) / STREAM_NODE_ENTRIES) * STREAM_NODE_ENTRIES;
  return { retained: n - removed, removed };
}

export function streamGroupView(raw: StreamInput): StreamView {
  const n = Math.round(clamp(raw.entries, 0, 1000));
  const cpg = Math.round(clamp(raw.consumersPerGroup, 1, 6));
  const gcount = Math.round(clamp(raw.groups, 1, 3));
  const skew = clamp(raw.skewPct, 0, 90) / 100;
  const bpe = clamp(raw.bytesPerEntry, 1, 1_000_000);
  const maxlen = Math.round(clamp(raw.maxlen, 1, 1000));
  const { retained, removed } = trimView(n, raw.trimMode, maxlen);

  const groups: GroupView[] = Array.from({ length: gcount }, (_, g) => {
    // Group g+1 has one fewer consumer than the previous (min 1) so groups lag independently.
    const cn = Math.max(1, cpg - g);
    const speeds = Array.from({ length: cn }, (_, k) => (cn === 1 ? 1 : 1 - (skew * k) / (cn - 1)));
    const capacity = speeds.reduce((s, v) => s + v, 0) * CONSUMER_RATE * PRODUCE_SEC;
    const delivered = Math.min(n, Math.floor(capacity));
    const share = apportion(delivered, speeds);
    return {
      name: `group-${g + 1}`,
      consumers: speeds.map((speed, k) => ({ name: `g${g + 1}-c${k + 1}`, speed, entries: share[k] ?? 0 })),
      delivered,
      lag: n - delivered,
      lostToTrim: Math.max(0, removed - delivered),
    };
  });

  return {
    entries: n, retained, removed,
    firstRetainedId: n === 0 ? "-" : streamEntryId(removed),
    lastId: n === 0 ? "-" : streamEntryId(n - 1),
    memoryBytes: retained * bpe,
    memoryUntrimmedBytes: n * bpe,
    overshoot: raw.trimMode === "approx" ? Math.max(0, retained - Math.min(n, maxlen)) : 0,
    groups,
  };
}
