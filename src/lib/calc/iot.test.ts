import { describe, expect, it } from "vitest";
import {
  DEFAULT_PIPELINE, FAULT_TEMP_C, buildDataset, effectiveQos, explainQuery, formatBytesDecimal, generateEvents, initPipeline,
  mulberry32, partitionLoad, qosLeg, runPipeline, simulateQos, stepPipeline, storageEstimate, windowAggregate, bottleneckStage,
  type StreamEvent, type WindowConfig,
} from "./iot";

describe("prng", () => {
  it("is deterministic", () => {
    const a = mulberry32(5), b = mulberry32(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

const at = <T,>(a: readonly T[], i: number): T => {
  const v = a[i];
  if (v === undefined) throw new Error(`index ${i} out of range`);
  return v;
};

describe("pipeline", () => {
  it("is deterministic and conserves messages", () => {
    const a = runPipeline(DEFAULT_PIPELINE, 30);
    const b = runPipeline(DEFAULT_PIPELINE, 30);
    expect(a.counters).toEqual(b.counters);
    const emitted = at(a.counters, 0).received + at(a.counters, 0).dropped;
    expect(emitted).toBe(50 * 30);
    const inFlight = a.queues.reduce((s, q) => s + q.length, 0);
    expect(emitted).toBe(inFlight + at(a.counters, 4).processed + at(a.counters, 3).filtered + at(a.counters, 0).dropped);
  });
  it("a slow store builds backlog and is the bottleneck", () => {
    const cfg = { ...DEFAULT_PIPELINE, storeCapPerSec: 10 };
    const s = runPipeline(cfg, 40);
    expect(at(s.queues, 4).length).toBeGreaterThan(100);
    expect(bottleneckStage(s, cfg)).toBe(4);
  });
  it("needs at least 5 ticks to reach the store; filters faulty readings", () => {
    let s = initPipeline(1);
    for (let i = 0; i < 4; i++) s = stepPipeline(s, DEFAULT_PIPELINE);
    expect(at(s.counters, 4).processed).toBe(0);
    const big = runPipeline({ ...DEFAULT_PIPELINE, devices: 200, bridgeCapPerSec: 1000, ksqlCapPerSec: 1000, storeCapPerSec: 1000 }, 20);
    expect(at(big.counters, 3).filtered).toBeGreaterThan(0);
    expect(at(big.recent, 4).every((m) => m.tempC !== FAULT_TEMP_C)).toBe(true);
  });
  it("clamps invalid config", () => {
    const s = runPipeline({ ...DEFAULT_PIPELINE, devices: -5, msgsPerDevicePerSec: NaN, storeCapPerSec: 0 }, 3);
    expect(Number.isFinite(s.tick)).toBe(true);
  });
});

describe("mqtt qos", () => {
  it("effective qos is min", () => {
    expect(effectiveQos(2, 1)).toBe(1);
    expect(effectiveQos(0, 2)).toBe(0);
  });
  it("clean exchanges", () => {
    expect(qosLeg(0, null, true).steps.map((s) => s.packet)).toEqual(["PUBLISH"]);
    expect(qosLeg(1, null, true).steps.map((s) => s.packet)).toEqual(["PUBLISH", "PUBACK"]);
    expect(qosLeg(2, null, true).steps.map((s) => s.packet)).toEqual(["PUBLISH", "PUBREC", "PUBREL", "PUBCOMP"]);
  });
  it("qos0 drop is lost even with reconnect", () => {
    expect(qosLeg(0, 0, true).deliveries).toBe(0);
  });
  it("qos1 lost PUBACK duplicates, lost PUBLISH delivers once", () => {
    expect(qosLeg(1, 1, true).deliveries).toBe(2);
    expect(qosLeg(1, 0, true).deliveries).toBe(1);
  });
  it("qos2 never duplicates at protocol level for any single drop", () => {
    for (let i = 0; i < 4; i++) expect(qosLeg(2, i, true).deliveries).toBe(1);
  });
  it("staying offline leaves qos1/2 pending and delivers nothing when PUBLISH lost", () => {
    const r = simulateQos({ pubQos: 1, subQos: 1, dropLeg: "pub", dropIndex: 0, reconnect: false });
    expect(r.appDeliveries).toBe(0);
    expect(r.outcome).toBe("pending");
  });
  it("downgrade: pub qos2 with sub qos0 uses a 1-packet leg 2", () => {
    const r = simulateQos({ pubQos: 2, subQos: 0, dropLeg: "none", dropIndex: 0, reconnect: true });
    expect(r.effective).toBe(0);
    expect(r.leg2?.steps).toHaveLength(1);
    expect(r.outcome).toBe("once");
  });
  it("duplicate on pub leg reaches the subscriber", () => {
    const r = simulateQos({ pubQos: 1, subQos: 1, dropLeg: "pub", dropIndex: 1, reconnect: true });
    expect(r.outcome).toBe("duplicate");
  });
  it("clamps out-of-range drop index", () => {
    expect(qosLeg(1, 99, true).steps.some((s) => s.lost)).toBe(true);
  });
});

describe("partitioning", () => {
  const base = { devices: 200, partitions: 8, msgsPerDevice: 10, seed: 3 };
  it("conserves totals for every strategy", () => {
    for (const strategy of ["deviceId", "random", "constant", "region-skewed"] as const) {
      expect(partitionLoad({ ...base, strategy }).total).toBe(2000);
    }
  });
  it("constant key is one hot partition", () => {
    const r = partitionLoad({ ...base, strategy: "constant" });
    expect(r.emptyPartitions).toBe(7);
    expect(r.skewRatio).toBe(8);
    expect(r.hotPartition).not.toBeNull();
  });
  it("random is near even; region-skewed uses at most 5 partitions", () => {
    expect(partitionLoad({ ...base, strategy: "random" }).hotPartition).toBeNull();
    const r = partitionLoad({ ...base, strategy: "region-skewed" });
    expect(r.counts.filter((c) => c > 0).length).toBeLessThanOrEqual(5);
    expect(r.hotPartition).not.toBeNull();
  });
  it("is deterministic and clamps", () => {
    expect(partitionLoad({ ...base, strategy: "random" })).toEqual(partitionLoad({ ...base, strategy: "random" }));
    expect(partitionLoad({ ...base, partitions: 0, devices: -1, strategy: "deviceId" }).counts).toHaveLength(1);
  });
});

describe("stream windows", () => {
  const ev = (id: number, t: number, a: number, v = 10): StreamEvent => ({ id, eventTimeSec: t, arrivalTimeSec: a, value: v });
  const tumble: WindowConfig = { kind: "tumbling", sizeSec: 10, hopSec: 10, gapSec: 5, graceSec: 0 };
  it("tumbling counts and averages", () => {
    const r = windowAggregate([ev(1, 1, 1, 10), ev(2, 5, 5, 20), ev(3, 12, 12, 30)], tumble);
    expect(r.windows.map((w) => w.count)).toEqual([2, 1]);
    expect(r.windows[0]?.avg).toBe(15);
  });
  it("late event dropped with grace 0, accepted with enough grace", () => {
    const events = [ev(1, 1, 1), ev(2, 15, 15), ev(3, 5, 16)];
    expect(windowAggregate(events, tumble).dropped.map((d) => d.id)).toEqual([3]);
    expect(windowAggregate(events, { ...tumble, graceSec: 10 }).dropped).toHaveLength(0);
  });
  it("hopping puts an event in size/hop windows", () => {
    const r = windowAggregate([ev(1, 25, 25)], { kind: "hopping", sizeSec: 20, hopSec: 10, gapSec: 5, graceSec: 0 });
    expect(r.windows).toHaveLength(2);
  });
  it("session windows split on gap and merge on late bridge", () => {
    const cfg: WindowConfig = { kind: "session", sizeSec: 10, hopSec: 10, gapSec: 5, graceSec: 30 };
    const split = windowAggregate([ev(1, 0, 0), ev(2, 20, 20)], cfg);
    expect(split.windows).toHaveLength(2);
    const merged = windowAggregate([ev(1, 0, 0), ev(2, 8, 8), ev(3, 4, 9)], cfg);
    expect(merged.windows).toHaveLength(1);
    expect(merged.windows[0]?.count).toBe(3);
  });
  it("generator is deterministic; in-order has no reordering", () => {
    expect(generateEvents(50, "late", 4)).toEqual(generateEvents(50, "late", 4));
    expect(windowAggregate(generateEvents(50, "in-order", 4), tumble).reorderedEvents).toBe(0);
    expect(windowAggregate(generateEvents(80, "late", 4), tumble).dropped.length).toBeGreaterThan(0);
  });
  it("empty input is safe", () => {
    expect(windowAggregate([], tumble).windows).toEqual([]);
  });
});

describe("mongo model", () => {
  const ds = buildDataset(10, 120, 60); // 120 min, 1200 docs
  const q = { deviceId: 3, fromSec: 0, toSec: 7200, limit: null, op: "find" as const };
  it("collscan examines everything", () => {
    const e = explainQuery(ds, q, "none");
    expect(e.docsExamined).toBe(1200);
    expect(e.nReturned).toBe(120);
  });
  it("compound index examines only matches", () => {
    const e = explainQuery(ds, q, "device-ts");
    expect(e.docsExamined).toBe(120);
    expect(e.stage).toBe("IXSCAN + FETCH");
  });
  it("latest reading with index examines 1; bucket examines 1 bucket", () => {
    expect(explainQuery(ds, { ...q, limit: 1 }, "device-ts").docsExamined).toBe(1);
    const b = explainQuery(ds, { ...q, limit: 1 }, "bucket");
    expect(b.docsExamined).toBe(1);
    expect(b.nReturned).toBe(1);
  });
  it("bucket reads whole buckets: 2 hours, 1 device => 2 buckets", () => {
    expect(explainQuery(ds, q, "bucket").docsExamined).toBe(2);
  });
  it("no deviceId falls back to collscan for compound index", () => {
    expect(explainQuery(ds, { ...q, deviceId: null }, "device-ts").stage).toBe("COLLSCAN");
  });
  it("aggregate returns group count", () => {
    expect(explainQuery(ds, { ...q, deviceId: null, op: "aggregate" }, "none").nReturned).toBe(10);
  });
  it("clamps dataset and handles empty range", () => {
    const d = buildDataset(-1, 0);
    expect(d.deviceId.length).toBe(1);
    expect(explainQuery(ds, { ...q, fromSec: 99999, toSec: 99999 }, "none").nReturned).toBe(0);
  });
  it("storage uses decimal units", () => {
    const e = storageEstimate({ devices: 1000, readingsPerDevicePerSec: 1, retentionDays: 1, docBytes: 100, indexEntryBytes: 40, bucketedBytesPerReading: 20, bucketSec: 3600 });
    expect(e.readingsRetained).toBe(86_400_000);
    expect(e.perReadingBytes).toBe(8_640_000_000);
    expect(formatBytesDecimal(e.perReadingBytes)).toBe("8.64 GB");
    expect(e.bucketedTotalBytes).toBeLessThan(e.perReadingTotalBytes);
    expect(storageEstimate({ devices: 1, readingsPerDevicePerSec: 0, retentionDays: 0, docBytes: 1, indexEntryBytes: 0, bucketedBytesPerReading: 1, bucketSec: 60 }).readingsRetained).toBe(0);
  });
});
