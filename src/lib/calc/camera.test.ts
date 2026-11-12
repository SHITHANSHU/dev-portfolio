import { describe, expect, it } from "vitest";
import { bandwidthStorage, buildGop, cameraConfig, decodability, gopStats, latencyBudget, seekDecodeCount, type CameraConfigInput } from "./camera";

const base: CameraConfigInput = { resolution: "1080p", profile: "main", fps: 25, codec: "H.264", rateControl: "CBR", bitrateKbps: 4000, gopUnit: "seconds", gopValue: 2 };

describe("cameraConfig", () => {
  it("computes bandwidth, storage, gop", () => {
    const r = cameraConfig(base);
    expect(r.bandwidthMbps).toBe(4);
    expect(r.gbPerHour).toBeCloseTo(1.8, 6);
    expect(r.gbPerDay).toBeCloseTo(43.2, 6);
    expect(r.gopFrames).toBe(50);
    expect(r.keyframeIntervalSec).toBe(2);
    expect(r.bpp).toBeCloseTo(4e6 / (1920 * 1080 * 25), 9);
    expect(r.band).toBe("adequate");
  });
  it("frames gop unit and H.265 equivalence", () => {
    const r = cameraConfig({ ...base, codec: "H.265", gopUnit: "frames", gopValue: 100 });
    expect(r.keyframeIntervalSec).toBe(4);
    expect(r.h264EquivBpp).toBeGreaterThan(r.bpp);
  });
  it("zero and invalid input", () => {
    const r = cameraConfig({ ...base, bitrateKbps: 0, fps: NaN, gopValue: -5 });
    expect(r.bandwidthMbps).toBe(0);
    expect(r.fps).toBe(1);
    expect(r.warnings.some((w) => w.id === "zero")).toBe(true);
  });
  it("warns on low fps, starved bitrate, sub stream", () => {
    const r = cameraConfig({ ...base, fps: 5, bitrateKbps: 300, profile: "sub" });
    const ids = r.warnings.map((w) => w.id);
    expect(ids).toContain("fps");
    expect(ids).toContain("sub");
    expect(r.widthPx).toBe(640);
  });
  it("is deterministic", () => expect(cameraConfig(base)).toEqual(cameraConfig(base)));
});

describe("bandwidthStorage", () => {
  const s = { cameras: 10, bitrateKbps: 4000, schedule: "continuous" as const, businessHoursPerDay: 10, motionDutyPct: 30, retentionDays: 30, overheadPct: 0 };
  it("continuous", () => {
    const r = bandwidthStorage(s);
    expect(r.aggregateMbps).toBe(40);
    expect(r.gbPerDay).toBeCloseTo(432, 6);
    expect(r.tbRetention).toBeCloseTo(12.96, 6);
    expect(r.tibRetention).toBeCloseTo(12.96e12 / 2 ** 40, 6);
    expect(r.util100MPct).toBe(40);
    expect(r.util1GPct).toBe(4);
    expect(r.steps).toHaveLength(5);
  });
  it("duty and overhead", () => {
    expect(bandwidthStorage({ ...s, schedule: "motion" }).gbPerDay).toBeCloseTo(129.6, 6);
    expect(bandwidthStorage({ ...s, schedule: "business" }).gbPerDay).toBeCloseTo(180, 6);
    expect(bandwidthStorage({ ...s, overheadPct: 20 }).gbPerDay).toBeCloseTo(518.4, 6);
  });
  it("zero/invalid", () => {
    expect(bandwidthStorage({ ...s, cameras: 0 }).gbRetention).toBe(0);
    expect(bandwidthStorage({ ...s, cameras: NaN, retentionDays: -3 }).tbRetention).toBe(0);
  });
});

describe("gop", () => {
  it("no B: I then P chain", () => {
    const g = buildGop(5, 0);
    expect(g.map((f) => f.type).join("")).toBe("IPPPP");
    expect(g[4]?.refs).toEqual([3]);
  });
  it("2 B frames pattern, closed GOP trailing P", () => {
    expect(buildGop(8, 2).map((f) => f.type).join("")).toBe("IBBPBBPP");
  });
  it("dropping P kills later frames until GOP ends; B drop is local", () => {
    const g = buildGop(7, 1); // IBPBPBP
    const d = decodability(g, new Set([2]));
    expect(d).toEqual([true, false, false, false, false, false, false]);
    const d2 = decodability(buildGop(7, 1), new Set([1]));
    expect(d2.filter((x) => !x)).toHaveLength(1);
    expect(decodability(g, new Set([0])).every((x) => !x)).toBe(true);
    expect(decodability(g, new Set()).every(Boolean)).toBe(true);
  });
  it("seek cost grows along P chain", () => {
    const g = buildGop(10, 0);
    expect(seekDecodeCount(g, 0)).toBe(1);
    expect(seekDecodeCount(g, 9)).toBe(10);
    expect(gopStats(g).worstSeekFrames).toBe(10);
    expect(seekDecodeCount(g, 99)).toBe(0);
  });
  it("clamps", () => expect(buildGop(0, 9)).toHaveLength(1));
});

describe("latencyBudget", () => {
  it("sums and finds dominant", () => {
    const r = latencyBudget([10, 50, -5, NaN]);
    expect(r.totalMs).toBe(60);
    expect(r.dominantIndex).toBe(1);
    expect(r.cumulativeMs).toEqual([10, 60, 60, 60]);
  });
  it("empty/zero", () => expect(latencyBudget([0, 0]).dominantSharePct).toBe(0));
});
