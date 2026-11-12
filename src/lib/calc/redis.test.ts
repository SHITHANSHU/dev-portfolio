import { describe, expect, it } from "vitest";
import { apportion, fmtBytesDecimal, persistenceView, simulateDelivery, streamGroupView, trimView, type DeliveryParams, type PersistInput } from "./redis";

const P: PersistInput = { writesPerSec: 100, mode: "aof", fsync: "everysec", snapshotSeconds: 10, snapshotChanges: 100, crashSec: 25.5, datasetGB: 8 };
const D: DeliveryParams = { messages: 10, consumers: 2, offlineFrom: 3, offlineTicks: 4, crashBeforeAck: false, ackTimeout: 3 };

describe("persistenceView", () => {
  it("always loses nothing", () => {
    const v = persistenceView({ ...P, fsync: "always" });
    expect(v.lost).toBe(0);
    expect(v.worstWindowSec).toBe(0);
    expect(v.fsyncEveryWrite).toBe(true);
  });
  it("everysec loses at most ~1 s of writes", () => {
    const v = persistenceView(P);
    expect(v.durableSec).toBe(25);
    expect(v.lost).toBe(50);
    expect(v.worstWindowSec).toBe(1);
    expect(v.lost).toBeLessThanOrEqual(v.worstWindowWrites);
  });
  it("no: window is the OS flush interval", () => {
    const v = persistenceView({ ...P, fsync: "no", crashSec: 45 });
    expect(v.durableSec).toBe(30);
    expect(v.lost).toBe(1500);
    expect(v.worstWindowSec).toBe(30);
  });
  it("rdb loses everything since the last snapshot", () => {
    const v = persistenceView({ ...P, mode: "rdb", crashSec: 25 });
    expect(v.snapshotTimes).toEqual([10, 20, 30, 40, 50, 60]);
    expect(v.durableSec).toBe(20);
    expect(v.lost).toBe(500);
    expect(v.worstWindowSec).toBe(10);
  });
  it("rdb: change threshold stretches the period at low write rate", () => {
    const v = persistenceView({ ...P, mode: "rdb", writesPerSec: 5, snapshotChanges: 100 });
    expect(v.snapshotPeriodSec).toBe(20);
  });
  it("rdb before the first snapshot loses all", () => {
    const v = persistenceView({ ...P, mode: "rdb", crashSec: 5 });
    expect(v.durableSec).toBe(0);
    expect(v.lost).toBe(v.acked);
  });
  it("hybrid recovers from AOF window, aof mode has no snapshots", () => {
    const h = persistenceView({ ...P, mode: "hybrid" });
    expect(h.snapshotTimes.length).toBeGreaterThan(0);
    expect(h.lost).toBe(persistenceView(P).lost);
    expect(persistenceView(P).snapshotTimes).toEqual([]);
  });
  it("zero and invalid inputs", () => {
    const z = persistenceView({ ...P, writesPerSec: 0 });
    expect(z.acked).toBe(0);
    expect(z.lost).toBe(0);
    const bad = persistenceView({ ...P, writesPerSec: Number.NaN, crashSec: -5, snapshotSeconds: 0, datasetGB: -1 });
    expect(bad.writesPerSec).toBe(0);
    expect(bad.crashSec).toBe(0);
    expect(bad.cowPeakExtraGB).toBe(0);
  });
  it("cost ordering is always > everysec > no", () => {
    const idx = (f: "always" | "everysec" | "no") => persistenceView({ ...P, fsync: f }).latencyIndex;
    expect(idx("always")).toBeGreaterThan(idx("everysec"));
    expect(idx("everysec")).toBeGreaterThan(idx("no"));
  });
  it("is deterministic", () => {
    expect(persistenceView(P)).toEqual(persistenceView(P));
  });
});

describe("simulateDelivery", () => {
  it("pub/sub: offline subscriber misses messages; others do not", () => {
    const r = simulateDelivery(D);
    const [s1, s2] = r.pubsub.rows;
    expect(s1?.missed).toBe(4);
    expect(s1?.delivered).toBe(6);
    expect(s2?.missed).toBe(0);
    expect(r.pubsub.totalMissed).toBe(4);
  });
  it("streams: every entry is delivered exactly once and acked without a crash", () => {
    const r = simulateDelivery(D);
    expect(r.streams.neverDelivered).toBe(0);
    expect(r.streams.acked).toBe(10);
    expect(r.streams.pendingTotal).toBe(0);
    expect(r.streams.redeliveries).toBe(0);
    expect(r.streams.rows.reduce((s, x) => s + x.delivered, 0)).toBe(10);
  });
  it("single consumer: offline window only delays stream entries", () => {
    const r = simulateDelivery({ ...D, consumers: 1 });
    expect(r.streams.neverDelivered).toBe(0);
    expect(r.streams.acked).toBe(10);
    expect(r.pubsub.rows[0]?.missed).toBe(4);
  });
  it("crash before ack: PEL entry is redelivered after the timeout, as a duplicate", () => {
    const r = simulateDelivery({ ...D, crashBeforeAck: true });
    expect(r.streams.redeliveries).toBe(1);
    expect(r.streams.rows.reduce((s, x) => s + x.duplicates, 0)).toBe(1);
    expect(r.streams.acked).toBe(10);
    expect(r.streams.pendingTotal).toBe(0);
    expect(r.streams.log.some((l) => l.includes("XAUTOCLAIM"))).toBe(true);
  });
  it("a longer ack timeout delays redelivery", () => {
    const fast = simulateDelivery({ ...D, crashBeforeAck: true, ackTimeout: 1 });
    const slow = simulateDelivery({ ...D, crashBeforeAck: true, ackTimeout: 8 });
    expect(slow.lastTick).toBeGreaterThan(fast.lastTick);
  });
  it("upTo gives a prefix view with pending visible mid-run", () => {
    const r = simulateDelivery({ ...D, crashBeforeAck: true }, 4);
    expect(r.tick).toBe(4);
    expect(r.streams.pendingTotal).toBeGreaterThan(0);
  });
  it("clamps invalid input and is deterministic", () => {
    const r = simulateDelivery({ ...D, messages: Number.NaN, consumers: 99, ackTimeout: -3 });
    expect(r.streams.retained).toBe(1);
    expect(r.streams.rows.length).toBe(4);
    expect(simulateDelivery(D)).toEqual(simulateDelivery(D));
  });
});

describe("streams and groups", () => {
  const S = { entries: 300, consumersPerGroup: 3, groups: 2, trimMode: "exact" as const, maxlen: 100, skewPct: 0, bytesPerEntry: 100 };
  it("trim exact vs approximate", () => {
    expect(trimView(300, "exact", 100)).toEqual({ retained: 100, removed: 200 });
    expect(trimView(350, "approx", 100)).toEqual({ retained: 150, removed: 200 });
    expect(trimView(150, "approx", 100)).toEqual({ retained: 150, removed: 0 });
    expect(trimView(300, "none", 10)).toEqual({ retained: 300, removed: 0 });
    expect(trimView(50, "exact", 100).retained).toBe(50);
  });
  it("approximate never keeps fewer than maxlen", () => {
    for (let n = 0; n < 600; n += 7) expect(trimView(n, "approx", 120).retained).toBeGreaterThanOrEqual(Math.min(n, 120));
  });
  it("each entry goes to exactly one consumer in a group; groups read independently", () => {
    const v = streamGroupView(S);
    for (const g of v.groups) expect(g.consumers.reduce((s, c) => s + c.entries, 0)).toBe(g.delivered);
    expect(v.groups.length).toBe(2);
    expect(v.groups[1]?.consumers.length).toBe(2);
  });
  it("skew moves entries to the faster consumer and fewer consumers raise lag", () => {
    const flat = streamGroupView(S).groups[0];
    const skew = streamGroupView({ ...S, skewPct: 80 }).groups[0];
    expect((skew?.consumers[0]?.entries ?? 0)).toBeGreaterThan(skew?.consumers[2]?.entries ?? 99);
    expect(flat?.consumers[0]?.entries).toBe(flat?.consumers[2]?.entries);
    expect(streamGroupView({ ...S, consumersPerGroup: 1 }).groups[0]?.lag).toBeGreaterThan(flat?.lag ?? 0);
  });
  it("memory estimate in decimal units and trimming lowers it", () => {
    const v = streamGroupView(S);
    expect(v.memoryBytes).toBe(10_000);
    expect(v.memoryUntrimmedBytes).toBe(30_000);
    expect(fmtBytesDecimal(10_000)).toBe("10.0 kB");
    expect(fmtBytesDecimal(2_500_000_000)).toBe("2.50 GB");
  });
  it("trimmed-before-read entries are reported", () => {
    const v = streamGroupView({ ...S, consumersPerGroup: 1, entries: 1000, maxlen: 100 });
    expect(v.groups[0]?.lostToTrim).toBe(Math.max(0, v.removed - (v.groups[0]?.delivered ?? 0)));
    expect(v.groups[0]?.lostToTrim).toBeGreaterThan(0);
  });
  it("zero entries and invalid input", () => {
    const v = streamGroupView({ ...S, entries: 0 });
    expect(v.retained).toBe(0);
    expect(v.firstRetainedId).toBe("-");
    expect(streamGroupView({ ...S, entries: Number.NaN, groups: 9 }).groups.length).toBe(3);
    expect(apportion(5, [0, 0])).toEqual([0, 0]);
    expect(apportion(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });
});
