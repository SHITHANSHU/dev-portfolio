import { describe, expect, it } from "vitest";
import {
  REINDEX_DEFAULTS, REINDEX_TICKS, ROUTING_DEFAULTS, SIZING_DEFAULTS, SNAPSHOT_DOCS, TENANTS,
  describeTick, effectivePartition, hashString, mulberry32, reindexOutcome, shardFor, shardSizing, shardsSearchedForTenant,
  simulateReindex, simulateRouting, zipfWeights,
  type ReindexParams, type RoutingParams, type SizingInput,
} from "./elasticsearch";

const S: SizingInput = SIZING_DEFAULTS;
const R: RoutingParams = ROUTING_DEFAULTS;
const X: ReindexParams = REINDEX_DEFAULTS;

describe("shardSizing", () => {
  it("matches the worked example", () => {
    const v = shardSizing(S);
    expect(v.rolloverDays).toBeCloseTo(1.2, 9);
    expect(v.indicesRetained).toBe(25);
    expect(v.primaryShardGB).toBeCloseTo(40, 9);
    expect(v.totalShards).toBe(300);
    expect(v.shardsPerNode).toBe(25);
    expect(v.storedGB).toBe(12000);
    expect(v.diskUtil).toBeCloseTo(0.5, 9);
    expect(v.nodesForDisk).toBe(8);
    expect(v.shardsQueriedPerSearch).toBe(6);
    expect(v.shardRequestsPerSec).toBe(300);
    expect(v.firstLimit).toBe("none");
  });
  it("full retention search fans out to every shard of every index", () => {
    const v = shardSizing({ ...S, scope: "retention" });
    expect(v.shardsQueriedPerSearch).toBe(150);
    expect(v.shardRequestsPerSec).toBe(7500);
  });
  it("flags daily indices at low volume as oversharded", () => {
    const v = shardSizing({ ...S, ingestGBPerDay: 1, layout: "daily", primaries: 5, nodes: 3, diskPerNodeGB: 2000 });
    expect(v.totalShards).toBe(300);
    expect(v.primaryShardGB).toBeCloseTo(0.2, 9);
    expect(v.warnings.some((w) => w.kind === "shardSizeSmall")).toBe(true);
    expect(v.firstLimit).toBe("shardSizeSmall");
  });
  it("flags undersharding: huge shards", () => {
    const v = shardSizing({ ...S, layout: "daily", ingestGBPerDay: 200, primaries: 2 });
    expect(v.primaryShardGB).toBe(100);
    expect(v.firstLimit).toBe("shardSizeLarge");
  });
  it("zero ingest does not divide by zero", () => {
    const v = shardSizing({ ...S, ingestGBPerDay: 0 });
    expect(v.rolloverDays).toBe(30);
    expect(v.indicesRetained).toBe(1);
    expect(v.primaryShardGB).toBe(0);
    expect(v.warnings).toEqual([]);
    expect(Number.isFinite(v.diskUtil)).toBe(true);
  });
  it("clamps NaN and out-of-range input", () => {
    const v = shardSizing({ ...S, ingestGBPerDay: NaN, retentionDays: -5, replicas: 99, primaries: 0, nodes: 0, diskPerNodeGB: 0 });
    expect(Number.isFinite(v.totalShards)).toBe(true);
    expect(v.indicesRetained).toBe(1);
    expect(v.storedGB).toBe(0);
  });
  it("flags disk past the low watermark", () => {
    const v = shardSizing({ ...S, nodes: 5 });
    expect(v.diskUtil).toBeCloseTo(1.2, 9);
    expect(v.warnings.some((w) => w.kind === "diskWatermark")).toBe(true);
  });
  it("flags shards per node over the limit and ranks it first", () => {
    const v = shardSizing({ ...S, layout: "daily", ingestGBPerDay: 100, retentionDays: 365, primaries: 64, nodes: 10, replicas: 1 });
    expect(v.shardsPerNode).toBeGreaterThan(1000);
    expect(v.firstLimit).toBe("shardsPerNode");
  });
  it("caps the drawn strip", () => {
    expect(shardSizing({ ...S, layout: "daily", retentionDays: 365 }).stripCount).toBe(60);
  });
  it("is deterministic", () => {
    expect(shardSizing(S)).toEqual(shardSizing({ ...S }));
  });
});

describe("routing primitives", () => {
  it("hashString and shardFor are deterministic and in range", () => {
    expect(hashString("t01")).toBe(hashString("t01"));
    for (const n of [1, 3, 6, 12]) {
      for (let i = 0; i < 50; i++) expect(shardFor(`t${i}`, `d${i}`, n, null)).toBeLessThan(n);
    }
    expect(shardFor("t01", "a", 1, 3)).toBe(0);
  });
  it("partition size spreads one routing value over at most p shards", () => {
    const shards = new Set<number>();
    for (let i = 0; i < 500; i++) shards.add(shardFor("t01", `doc-${i}`, 6, 3));
    expect(shards.size).toBe(3);
    const plain = new Set<number>();
    for (let i = 0; i < 500; i++) plain.add(shardFor("t01", `doc-${i}`, 6, null));
    expect(plain.size).toBe(1);
  });
  it("partition size is bounded by primaries - 1", () => {
    expect(effectivePartition(5, 3)).toBe(2);
    expect(effectivePartition(99, 12)).toBe(5);
  });
  it("zipf weights sum to 1; skew 0 is uniform; NaN falls back", () => {
    const w = zipfWeights(12, 1.2);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(w[0]).toBeGreaterThan(w[1] ?? 1);
    expect(new Set(zipfWeights(4, 0).map((x) => x.toFixed(6))).size).toBe(1);
    expect(zipfWeights(0, NaN)).toEqual([1]);
  });
  it("mulberry32 is seeded", () => {
    const a = mulberry32(5), b = mulberry32(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("simulateRouting", () => {
  const skewOf = (mode: RoutingParams["mode"]) => simulateRouting({ ...R, mode }, 40).skewRatio;
  it("_id routing is close to even", () => {
    expect(skewOf("id")).toBeLessThan(1.2);
    expect(skewOf("id")).toBeGreaterThanOrEqual(1);
  });
  it("tenant routing skews more than partitions, which skew more than _id", () => {
    expect(skewOf("tenant")).toBeGreaterThan(skewOf("partition"));
    expect(skewOf("partition")).toBeGreaterThan(skewOf("id"));
    expect(skewOf("tenant")).toBeGreaterThan(2);
  });
  it("skew 0 makes tenant routing much flatter", () => {
    const flat = simulateRouting({ ...R, mode: "tenant", skew: 0 }, 40).skewRatio;
    expect(flat).toBeLessThan(simulateRouting({ ...R, mode: "tenant", skew: 1.2 }, 40).skewRatio);
  });
  it("rejections are zero with huge capacity and positive when hot", () => {
    expect(simulateRouting({ ...R, nodeCapacityPerTick: 1000 }, 40).rejectedTotal).toBe(0);
    expect(simulateRouting({ ...R, mode: "tenant" }, 40).rejectedTotal).toBeGreaterThan(0);
    const s = simulateRouting({ ...R, nodeCapacityPerTick: 6 }, 10);
    expect(s.accepted.reduce((a, b) => a + b, 0) + s.rejectedTotal).toBe(240);
  });
  it("state is a prefix-extension and deterministic", () => {
    const a = simulateRouting(R, 12), b = simulateRouting(R, 12);
    expect(a).toEqual(b);
    const c = simulateRouting(R, 13);
    expect(c.events.slice(0, 12)).toEqual(a.events);
    expect(c.routed.reduce((x, y) => x + y, 0)).toBe(13 * 24);
  });
  it("tick 0, NaN and clamps", () => {
    const z = simulateRouting(R, 0);
    expect(z.skewRatio).toBe(0);
    expect(z.lastBatch).toEqual([]);
    const c = simulateRouting({ ...R, primaries: NaN, nodeCapacityPerTick: NaN, skew: NaN }, 999);
    expect(c.tick).toBe(40);
    expect(Number.isFinite(c.skewRatio)).toBe(true);
    expect(TENANTS).toBe(12);
  });
  it("searched shards per mode", () => {
    expect(shardsSearchedForTenant("id", 6, 3)).toBe(6);
    expect(shardsSearchedForTenant("tenant", 6, 3)).toBe(1);
    expect(shardsSearchedForTenant("partition", 6, 3)).toBe(3);
    expect(shardsSearchedForTenant("partition", 3, 5)).toBe(2);
  });
  it("describes a tick", () => {
    const s = simulateRouting(R, 3);
    const e = s.events[2];
    expect(e).toBeDefined();
    if (e) expect(describeTick(e, 10)).toMatch(/^t3 · 24 docs · shard \d \+\d+ \(tenant t\d\d ×\d+\)/);
  });
});

describe("simulateReindex", () => {
  const run = (p: Partial<ReindexParams>, t = REINDEX_TICKS) => simulateReindex({ ...X, ...p }, t);
  it("swapping right after the copy loses writes and resurrects deletes", () => {
    const s = run({ strategy: "swapRightAfter" });
    expect(s.swapTick).toBe(7);
    expect(s.missingWrites).toBe(70);
    expect(s.resurrectedDeletes).toBe(14);
    expect(reindexOutcome(s).consistent).toBe(false);
    expect(s.events.some((e) => e.includes("alias swapped v1 → v2"))).toBe(true);
  });
  it("catch-up by updated_at fixes writes but not deletes", () => {
    const s = run({ strategy: "catchUp" });
    expect(s.missingWrites).toBe(0);
    expect(s.resurrectedDeletes).toBe(2 * (s.swapTick ?? 0));
    expect(s.resurrectedDeletes).toBeGreaterThan(0);
    expect(reindexOutcome(s).consistent).toBe(false);
  });
  it("catch-up never swaps when writes outrun the copy rate", () => {
    const s = run({ strategy: "catchUp", writesPerTick: 40, copyPerTick: 30 });
    expect(s.swapTick).toBeNull();
    expect(s.missingWrites).toBeGreaterThan(0);
    expect(reindexOutcome(s).swapped).toBe(false);
  });
  it("pausing writes is consistent and costs pause ticks", () => {
    const s = run({ strategy: "pauseWrites" });
    const o = reindexOutcome(s);
    expect(o.consistent).toBe(true);
    expect(o.pauseTicks).toBeGreaterThan(0);
    expect(s.queued).toBe(0);
  });
  it("CDC replay is consistent with no pause", () => {
    const o = reindexOutcome(run({ strategy: "cdcReplay" }));
    expect(o.consistent).toBe(true);
    expect(o.pauseTicks).toBe(0);
    expect(o.swapTick).not.toBeNull();
  });
  it("zero traffic is consistent for every strategy and never pauses", () => {
    for (const strategy of ["swapRightAfter", "catchUp", "pauseWrites", "cdcReplay"] as const) {
      const o = reindexOutcome(run({ strategy, writesPerTick: 0, deletesPerTick: 0 }));
      expect(o.consistent).toBe(true);
      expect(o.pauseTicks).toBe(0);
      expect(o.swapTick).toBe(7);
    }
  });
  it("state at tick 0 and mid-run", () => {
    const z = run({}, 0);
    expect(z.swapTick).toBeNull();
    expect(z.v1Count).toBe(SNAPSHOT_DOCS);
    expect(z.v2Count).toBe(0);
    expect(run({}, 3).copied).toBe(180);
    expect(run({}, 3).events).toHaveLength(4);
  });
  it("clamps NaN and huge input; deterministic", () => {
    const s = simulateReindex({ writesPerTick: NaN, deletesPerTick: -4, copyPerTick: NaN, strategy: "catchUp" }, 999);
    expect(s.tick).toBe(REINDEX_TICKS);
    expect(Number.isFinite(s.v2Count)).toBe(true);
    expect(run({})).toEqual(run({}));
  });
});
