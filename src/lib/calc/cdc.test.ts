import { describe, expect, it } from "vitest";
import { assignPartitions, capacity, eventWalk, fmtBytesPerSec, partitionFor, partitionView, remappedKeys, simulateBacklog, workerDocsPerSec } from "./cdc";

const base = { appRps: 1000, writePct: 10, rowsPerWrite: 2, eventsPerRow: 2, eventBytes: 1000, indexDocsPerSec: 1000, searchQps: 0, docsPerQuery: 1 };

describe("partitions", () => {
  it("is deterministic and in range", () => {
    expect(partitionFor("a", 6)).toBe(partitionFor("a", 6));
    for (let i = 0; i < 50; i++) expect(partitionFor("k" + i, 5)).toBeLessThan(5);
  });
  it("idle consumers when consumers > partitions", () => {
    const v = partitionView(["a", "b"], 3, 5);
    expect(v.idleConsumers).toEqual([3, 4]);
    expect(v.parallelism).toBe(3);
    expect(assignPartitions(4, 2)).toEqual([[0, 2], [1, 3]]);
  });
  it("changing partition count remaps some keys; same count remaps none", () => {
    const keys = Array.from({ length: 40 }, (_, i) => "order:" + i);
    expect(remappedKeys(keys, 6, 6)).toEqual([]);
    expect(remappedKeys(keys, 6, 7).length).toBeGreaterThan(0);
  });
  it("handles invalid", () => {
    expect(partitionFor("x", 0)).toBe(0);
    expect(partitionFor("x", NaN)).toBe(0);
  });
});

describe("capacity", () => {
  it("computes the chain", () => {
    const r = capacity(base);
    expect(r.writeRequestsPerSec).toBe(100);
    expect(r.rowChangesPerSec).toBe(200);
    expect(r.cdcEventsPerSec).toBe(400);
    expect(r.ingressBytesPerSec).toBe(400000);
    expect(r.ingressBitsPerSec).toBe(3200000);
    expect(r.utilisation).toBeCloseTo(0.4);
    expect(r.drainDocsPerSec).toBe(600);
    expect(r.cdcEventsPerSec).not.toBe(1000);
  });
  it("backlog grows when overloaded; search load lowers capacity", () => {
    expect(capacity({ ...base, indexDocsPerSec: 300 }).backlogGrowthDocsPerSec).toBe(100);
    expect(capacity({ ...base, searchQps: 800 }).effectiveCapacityDocsPerSec).toBe(200);
  });
  it("zero and invalid", () => {
    const z = capacity({ ...base, appRps: 0, indexDocsPerSec: 0 });
    expect(z.utilisation).toBe(0);
    expect(capacity({ ...base, indexDocsPerSec: 0 }).utilisation).toBe(Infinity);
    expect(capacity({ ...base, appRps: NaN }).cdcEventsPerSec).toBe(0);
    expect(capacity({ ...base, writePct: 500 }).writeRequestsPerSec).toBe(1000);
  });
  it("formats decimal units", () => {
    expect(fmtBytesPerSec(400000)).toEqual({ value: "400.0", unit: "kB/s" });
    expect(fmtBytesPerSec(2.5e6).unit).toBe("MB/s");
  });
});

describe("backlog simulation", () => {
  const s = { arrivalDocsPerSec: 500, peakPerWorker: 600, batchSize: 100, workers: 2 };
  it("batch curve saturates", () => {
    expect(workerDocsPerSec(600, 50)).toBe(300);
    expect(workerDocsPerSec(600, 1e6)).toBeLessThan(600);
    expect(workerDocsPerSec(600, 200)).toBeGreaterThan(workerDocsPerSec(600, 20));
  });
  it("steady stays empty", () => {
    const r = simulateBacklog({ ...s, scenario: "steady" });
    expect(r.peak).toBe(0);
  });
  it("outage builds then drains", () => {
    const r = simulateBacklog({ ...s, scenario: "outage" });
    expect(r.peak).toBeCloseTo(500 * 300);
    expect(r.drainSecAfterEvent).not.toBeNull();
    expect(r.finalBacklog).toBe(0);
  });
  it("undersized never drains; deterministic", () => {
    const a = simulateBacklog({ ...s, workers: 1, scenario: "spike" });
    expect(a.steadyGrowthDocsPerSec).toBeGreaterThan(0);
    expect(a.drainSecAfterEvent).toBeNull();
    expect(simulateBacklog({ ...s, workers: 1, scenario: "spike" })).toEqual(a);
  });
  it("zero workers", () => {
    expect(simulateBacklog({ ...s, workers: 0, scenario: "steady" }).finalBacklog).toBe(500 * 1800);
  });
});

describe("eventWalk", () => {
  it("delete mentions tombstone", () => {
    expect(eventWalk("delete")[2]?.detail).toContain("tombstone");
    expect(eventWalk("insert")).toHaveLength(5);
  });
});
