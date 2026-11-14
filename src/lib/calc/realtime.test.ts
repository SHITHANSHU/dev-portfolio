import { describe, expect, it } from "vitest";
import {
  backoffDelayTicks, expectedPodsPerRoom, fanoutModel, mulberry32, outputBufferTimeline, resumeOutcome, samplePublishPods,
  simulateStorm, stormStats, MIB, STORM_CLIENTS, STORM_MAX_TICKS,
  type FanoutInput, type SlowSubInput, type StormParams,
} from "./realtime";

const base: FanoutInput = {
  pods: 200, membersPerRoom: 40, rooms: 50_000, publishesPerSec: 20_000, payloadBytes: 500,
  strategy: "perRoom", routing: "roundRobin", topology: "standalone", shards: 6, replicas: 1, connMemKB: 20,
};

describe("expectedPodsPerRoom", () => {
  it("matches the worked example", () => expect(expectedPodsPerRoom(200, 40, "roundRobin", 10_000)).toBeCloseTo(36.34, 1));
  it("one member touches one pod", () => expect(expectedPodsPerRoom(200, 1, "roundRobin", 10_000)).toBeCloseTo(1, 9));
  it("huge rooms touch every pod", () => expect(expectedPodsPerRoom(200, 100_000, "roundRobin", 10_000)).toBeCloseTo(200, 6));
  it("single pod", () => expect(expectedPodsPerRoom(1, 50, "roundRobin", 10)).toBe(1));
  it("affinity is 1 for normal rooms and ceil(M/cap) for big ones", () => {
    expect(expectedPodsPerRoom(200, 40, "affinity", 10_000)).toBe(1);
    expect(expectedPodsPerRoom(200, 25_000, "affinity", 10_000)).toBe(3);
    expect(expectedPodsPerRoom(2, 25_000, "affinity", 10_000)).toBe(2);
  });
  it("clamps garbage input", () => expect(expectedPodsPerRoom(NaN, -5, "roundRobin", NaN)).toBe(1));
});

describe("fanoutModel", () => {
  it("global channel delivers R x P, room affinity R", () => {
    expect(fanoutModel({ ...base, strategy: "global" }).redisEgressMsgsPerSec).toBe(20_000 * 200);
    expect(fanoutModel({ ...base, routing: "affinity" }).redisEgressMsgsPerSec).toBeCloseTo(20_000, 6);
  });
  it("reproduces the worked example numbers", () => {
    const g = fanoutModel({ ...base, strategy: "global" });
    expect(g.redisEgressBytesPerSec).toBe(2_000_000_000);
    expect(g.perPodIngressMsgsPerSec).toBe(20_000);
    expect(g.wastedFraction).toBeCloseTo(0.82, 2);
    const rr = fanoutModel(base);
    expect(rr.redisEgressMsgsPerSec).toBeGreaterThan(726_000);
    expect(rr.redisEgressMsgsPerSec).toBeLessThan(728_000);
    expect(rr.channelSubscriptions).toBeGreaterThan(1.8e6);
    expect(rr.clientEgressMsgsPerSec).toBe(800_000);
    expect(rr.perPodClientEgressMsgsPerSec).toBe(4_000);
    expect(rr.clientEgressBytesPerSec).toBe(400_000_000);
  });
  it("per-connection deliveries equal members", () => expect(fanoutModel({ ...base, strategy: "perConnection" }).deliveriesPerPublish).toBe(40));
  it("sharded per-primary is R/S, classic is R, bus differs", () => {
    expect(fanoutModel({ ...base, topology: "clusterSharded" }).perPrimaryPublishesPerSec).toBe(20_000 / 6);
    const c = fanoutModel({ ...base, topology: "clusterClassic" });
    expect(c.perPrimaryPublishesPerSec).toBe(20_000);
    expect(c.clusterBusMsgsPerSec).toBe(20_000 * (6 * 2 - 1));
    expect(fanoutModel({ ...base, topology: "clusterSharded" }).clusterBusMsgsPerSec).toBe(20_000);
  });
  it("zero publish rate gives zero load", () => {
    const v = fanoutModel({ ...base, publishesPerSec: 0 });
    expect(v.redisEgressMsgsPerSec).toBe(0);
    expect(v.clientEgressMsgsPerSec).toBe(0);
    expect(v.clusterBusMsgsPerSec).toBe(0);
  });
  it("single pod is fine and NaN/negative inputs clamp", () => {
    expect(fanoutModel({ ...base, pods: 1, strategy: "global" }).wastedFraction).toBe(0);
    const v = fanoutModel({ ...base, pods: NaN, membersPerRoom: -3, rooms: -1, publishesPerSec: -9, payloadBytes: NaN });
    expect(Number.isFinite(v.redisEgressBytesPerSec)).toBe(true);
    expect(v.connections).toBe(1);
  });
  it("per-connection subscriptions exceed maxclients", () => expect(fanoutModel({ ...base, strategy: "perConnection" }).exceedsMaxclients).toBe(true));
  it("a global channel at huge publish rate is flagged as a Redis bottleneck", () => {
    expect(["redisEgress", "redisPublishCpu"]).toContain(fanoutModel({ ...base, strategy: "global", publishesPerSec: 500_000 }).bottleneck);
    expect(fanoutModel({ ...base, pods: 3, membersPerRoom: 100_000, rooms: 1, routing: "affinity", publishesPerSec: 1_000 }).bottleneck).toBe("clientEgress");
  });
});

describe("fanoutModel affinity capacity", () => {
  it("a small room fits one pod regardless of N; a huge room spans pods", () => {
    const a = (m: number, n: number) => fanoutModel({ ...base, routing: "affinity", membersPerRoom: m, rooms: n }).podsPerRoom;
    expect(a(40, 1)).toBe(1);
    expect(a(40, 50_000)).toBe(1);
    expect(a(100_000, 1)).toBe(2);
  });
});

describe("samplePublishPods", () => {
  it("is deterministic per seed and differs across seeds", () => {
    expect(samplePublishPods(200, 40, "roundRobin", 7)).toEqual(samplePublishPods(200, 40, "roundRobin", 7));
    expect(samplePublishPods(200, 40, "roundRobin", 7)).not.toEqual(samplePublishPods(200, 40, "roundRobin", 8));
  });
  it("affinity hits one pod, huge rooms hit all", () => {
    expect(samplePublishPods(200, 40, "affinity", 3, 10_000)).toHaveLength(1);
    expect(samplePublishPods(10, 100_000, "roundRobin", 3)).toHaveLength(10);
    expect(samplePublishPods(200, 1, "roundRobin", 3)).toHaveLength(1);
  });
});

const storm: StormParams = { event: "crash", policy: "immediate", capTicks: 8, acceptLimit: 3, bufferMsgs: 8, triggerAt: 5, seed: 1 };

describe("storm", () => {
  it("is deterministic", () => expect(simulateStorm(storm, 30)).toEqual(simulateStorm(storm, 30)));
  it("no event means no attempts", () => expect(simulateStorm({ ...storm, triggerAt: null }, 20).peakAttempts).toBe(0));
  it("immediate retry spikes at least as high as jitter", () => {
    const a = stormStats(simulateStorm(storm, 39), storm).peakAttempts;
    const j = { ...storm, policy: "jitter" as const };
    const b = stormStats(simulateStorm(j, 39), j).peakAttempts;
    expect(a).toBe(20);
    expect(a).toBeGreaterThanOrEqual(b);
  });
  it("accept limit causes rejections for a 20-client crash", () => {
    expect(stormStats(simulateStorm(storm, 39), storm).rejected).toBeGreaterThan(0);
    const roomy = { ...storm, acceptLimit: 40 };
    expect(stormStats(simulateStorm(roomy, 39), roomy).rejected).toBe(0);
  });
  it("jitter respects the cap", () => {
    for (let i = 0; i < 200; i++) {
      const d = backoffDelayTicks("jitter", 9, 6, mulberry32(i));
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(6);
    }
  });
  it("all clients reconnect within the tick budget for every default event", () => {
    for (const event of ["crash", "drain", "rolling"] as const) {
      for (const policy of ["immediate", "fixed", "jitter"] as const) {
        const p = { ...storm, event, policy, triggerAt: 2, acceptLimit: 10 };
        const s = simulateStorm(p, STORM_MAX_TICKS - 1);
        expect(s.clients.filter((c) => c.pod === -1)).toHaveLength(0);
        expect(s.clients).toHaveLength(STORM_CLIENTS);
      }
    }
  });
  it("rolling deploy ends with every pod up", () => {
    const p = { ...storm, event: "rolling" as const, triggerAt: 2 };
    expect(simulateStorm(p, 39).pods.every((x) => x.status === "up")).toBe(true);
  });
  it("without a buffer messages are lost, with one they are replayed", () => {
    const none = { ...storm, bufferMsgs: null };
    expect(stormStats(simulateStorm(none, 39), none).lostMsgs).toBeGreaterThan(0);
    const big = { ...storm, bufferMsgs: 20 };
    const sb = stormStats(simulateStorm(big, 39), big);
    expect(sb.lostMsgs).toBe(0);
    expect(sb.replayedMsgs).toBeGreaterThan(0);
  });
  it("invalid params clamp", () => {
    const s = simulateStorm({ ...storm, acceptLimit: NaN, capTicks: -1, triggerAt: 9999 }, 9999);
    expect(s.tick).toBe(STORM_MAX_TICKS - 1);
  });
});

describe("resumeOutcome", () => {
  it("maps missed vs buffer", () => {
    expect(resumeOutcome(3, null)).toBe("lost");
    expect(resumeOutcome(3, 8)).toBe("replayed");
    expect(resumeOutcome(8, 8)).toBe("replayed");
    expect(resumeOutcome(9, 8)).toBe("resync");
  });
});

const slow: SlowSubInput = {
  incomingMsgsPerSec: 2_000, msgBytes: 1_000, podDrainMsgsPerSec: 5_000, slowClientMsgsPerSec: 50, stallSec: 0,
  policy: "headOfLine", queueLimit: 1_000, hardMiB: 32, softMiB: 8, softSeconds: 60, resubscribeGapSec: 2,
};

describe("outputBufferTimeline", () => {
  it("head-of-line writes hit the hard limit first at defaults", () => {
    const v = outputBufferTimeline(slow);
    expect(v.disconnectReason).toBe("hard");
    // 1,950 msgs/s x 1,000 B = 1.95 MB/s; 32 MiB = 33.55 MB is crossed in second 18.
    expect(v.disconnectSec).toBe(18);
    expect(v.lostMsgsAllClients).toBeGreaterThan(0);
    expect(v.disconnectCount).toBeGreaterThan(1);
  });
  it("drop-oldest keeps the pod healthy and only hurts the slow client", () => {
    const v = outputBufferTimeline({ ...slow, policy: "dropOldest" });
    expect(v.disconnectSec).toBeNull();
    expect(v.lostMsgsAllClients).toBe(0);
    expect(v.droppedMsgsSlowClient).toBeGreaterThan(0);
    expect(Math.max(...v.bufferBytes)).toBe(0);
  });
  it("keep-latest bounds the queue and disconnect-slow removes the client", () => {
    expect(Math.max(...outputBufferTimeline({ ...slow, policy: "keepLatest" }).slowQueueMsgs)).toBeLessThanOrEqual(20);
    const d = outputBufferTimeline({ ...slow, policy: "disconnectSlow" });
    expect(d.slowClientDisconnected).toBe(true);
    expect(d.disconnectSec).toBeNull();
  });
  it("a 20 s stall grows the buffer; a 5 s stall at defaults recovers", () => {
    const long = outputBufferTimeline({ ...slow, policy: "dropOldest", stallSec: 20 });
    expect(long.disconnectReason).toBe("hard");
    const short = outputBufferTimeline({ ...slow, policy: "dropOldest", stallSec: 5 });
    expect(short.disconnectSec).toBeNull();
    expect(short.maxBufferBytes).toBeGreaterThan(8 * MIB);
    expect(short.bufferBytes[119]).toBe(0);
  });
  it("zero incoming means no buffer", () => {
    const v = outputBufferTimeline({ ...slow, incomingMsgsPerSec: 0 });
    expect(v.maxBufferBytes).toBe(0);
    expect(v.disconnectSec).toBeNull();
  });
  it("soft limit needs continuity: a dip below resets the timer", () => {
    // Over the soft limit only during a 5 s stall (< 60 s): never disconnects, timer returns to 0.
    const v = outputBufferTimeline({ ...slow, policy: "dropOldest", stallSec: 5 });
    expect(Math.max(...v.softOverSec)).toBeLessThan(60);
    expect(v.softOverSec[119]).toBe(0);
  });
  it("soft limit disconnects after softSeconds above it", () => {
    const v = outputBufferTimeline({ ...slow, slowClientMsgsPerSec: 1_800, hardMiB: 1_000, softMiB: 1, softSeconds: 10 });
    expect(v.disconnectReason).toBe("soft");
  });
  it("hard fires before soft when growth is fast", () => {
    expect(outputBufferTimeline({ ...slow, incomingMsgsPerSec: 50_000, podDrainMsgsPerSec: 100, policy: "dropOldest", stallSec: 20, msgBytes: 16_000 }).disconnectReason).toBe("hard");
  });
  it("slow rate 0 means no slow client under every per-client policy", () => {
    for (const policy of ["dropOldest", "keepLatest", "disconnectSlow"] as const) {
      const v = outputBufferTimeline({ ...slow, policy, slowClientMsgsPerSec: 0 });
      expect(v.droppedMsgsSlowClient).toBe(0);
      expect(v.slowClientDisconnected).toBe(false);
    }
  });
  it("hard below soft fires the hard limit", () => {
    expect(outputBufferTimeline({ ...slow, hardMiB: 4, softMiB: 8 }).disconnectReason).toBe("hard");
  });
  it("is deterministic and clamps", () => {
    expect(outputBufferTimeline(slow)).toEqual(outputBufferTimeline(slow));
    const v = outputBufferTimeline({ ...slow, incomingMsgsPerSec: NaN, msgBytes: -1, hardMiB: -1, softMiB: NaN });
    expect(v.bufferBytes).toHaveLength(120);
    expect(Number.isFinite(v.maxBufferBytes)).toBe(true);
  });
});
