/** Pure camera/video maths. Units in names; decimal GB (1e9 B) and binary TiB (2^40 B) labelled. */

const clamp = (v: number, lo: number, hi: number): number =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;

export type ResKey = "720p" | "1080p" | "4MP" | "4K";
export const RESOLUTIONS: Record<ResKey, { w: number; h: number }> = {
  "720p": { w: 1280, h: 720 },
  "1080p": { w: 1920, h: 1080 },
  "4MP": { w: 2688, h: 1520 },
  "4K": { w: 3840, h: 2160 },
};
/** Illustrative sub-stream frame size (not a standard; vendors differ). */
export const SUB_STREAM = { w: 640, h: 360 };

export type Codec = "H.264" | "H.265" | "MJPEG";
/** Rough rule of thumb: bits needed for similar quality relative to H.264. Approximate, content dependent. */
export const CODEC_BITS_RATIO: Record<Codec, number> = { "H.264": 1, "H.265": 0.65, MJPEG: 4 };

export type Band = "starved" | "low" | "adequate" | "good" | "generous";
export type Warning = { id: string; severity: "info" | "warn"; text: string };

export type CameraConfigInput = {
  resolution: ResKey;
  profile: "main" | "sub";
  fps: number;
  codec: Codec;
  rateControl: "CBR" | "VBR";
  bitrateKbps: number;
  gopUnit: "frames" | "seconds";
  gopValue: number;
};

export function bandFor(h264EquivBpp: number): Band {
  if (h264EquivBpp < 0.03) return "starved";
  if (h264EquivBpp < 0.06) return "low";
  if (h264EquivBpp < 0.12) return "adequate";
  if (h264EquivBpp < 0.25) return "good";
  return "generous";
}

export function cameraConfig(inp: CameraConfigInput) {
  const fps = clamp(inp.fps, 1, 60);
  const bitrateKbps = clamp(inp.bitrateKbps, 0, 100_000);
  const { w, h } = inp.profile === "sub" ? SUB_STREAM : RESOLUTIONS[inp.resolution] ?? RESOLUTIONS["1080p"];
  const gopFrames = Math.max(
    1,
    Math.round(inp.gopUnit === "frames" ? clamp(inp.gopValue, 1, 600) : clamp(inp.gopValue, 0.1, 10) * fps),
  );
  const bitsPerSec = bitrateKbps * 1000;
  const bytesPerHour = (bitsPerSec * 3600) / 8;
  const bpp = bitsPerSec / (w * h * fps);
  const h264EquivBpp = bpp / CODEC_BITS_RATIO[inp.codec];
  const keyframeIntervalSec = gopFrames / fps;
  // ponytail: VBR peak = 1.5x average is an illustrative planning factor, not a measured one.
  const peakMbps = (bitsPerSec * (inp.rateControl === "VBR" ? 1.5 : 1)) / 1e6;

  // Illustrative ANPR geometry: 50 km/h vehicle, 5 m of road where the plate is legible.
  const speedMps = 50 / 3.6;
  const framesInZone = (5 / speedMps) * fps;
  const metresPerFrame = speedMps / fps;

  const warnings: Warning[] = [];
  if (bitrateKbps === 0) warnings.push({ id: "zero", severity: "warn", text: "Bitrate is 0: nothing would be encoded." });
  const band = bandFor(h264EquivBpp);
  if (bitrateKbps > 0 && (band === "starved" || band === "low"))
    warnings.push({ id: "bpp", severity: "warn", text: `Bits per pixel is ${band} (${h264EquivBpp.toFixed(3)} H.264-equivalent): expect blocking/smearing on detail, which hurts plate reads and small-object detection.` });
  if (framesInZone < 3)
    warnings.push({ id: "fps", severity: "warn", text: `At ${fps} fps a 50 km/h vehicle moves ${metresPerFrame.toFixed(1)} m per frame: only ~${framesInZone.toFixed(1)} frames fall in a 5 m plate zone (illustrative), so ANPR may get no sharp frame. Motion blur itself is set by shutter time, not fps.` });
  if (fps > 30 && band !== "good" && band !== "generous")
    warnings.push({ id: "fps-bpp", severity: "info", text: "High FPS spreads the same bitrate over more frames; raise bitrate or drop FPS if quality suffers." });
  if (keyframeIntervalSec > 4)
    warnings.push({ id: "gop-long", severity: "info", text: `Keyframe every ${keyframeIntervalSec.toFixed(1)} s: worst-case join/seek wait is about that long, and a lost packet can corrupt video up to that long.` });
  if (keyframeIntervalSec < 0.5 && bitrateKbps > 0)
    warnings.push({ id: "gop-short", severity: "info", text: "Very frequent keyframes are large; at fixed bitrate they leave fewer bits for the other frames." });
  if (inp.codec === "MJPEG")
    warnings.push({ id: "mjpeg", severity: "info", text: "MJPEG is intra-only: no GOP dependency, but roughly several times the bitrate of H.264 for similar quality (rule of thumb)." });
  if (inp.profile === "sub")
    warnings.push({ id: "sub", severity: "info", text: `Sub stream is modelled as ${SUB_STREAM.w}x${SUB_STREAM.h} (illustrative): fine for live preview, usually too small for plate reading; run ANPR on the main stream or a crop.` });
  if (inp.codec === "H.265" && inp.profile === "main")
    warnings.push({ id: "h265", severity: "info", text: "H.265 saves bitrate but check decoder/browser/GPU support and CPU cost downstream." });
  if (inp.rateControl === "CBR")
    warnings.push({ id: "cbr", severity: "info", text: "CBR keeps bandwidth predictable but lets quality drop on busy scenes; VBR varies bandwidth with scene activity." });

  return {
    widthPx: w, heightPx: h, fps, bitrateKbps, gopFrames, bitsPerSec,
    bandwidthMbps: bitsPerSec / 1e6, peakMbps,
    gbPerHour: bytesPerHour / 1e9, gbPerDay: (bytesPerHour * 24) / 1e9,
    bpp, h264EquivBpp, band,
    keyframeIntervalSec, worstJoinLatencySec: keyframeIntervalSec,
    codecSavingVsH264Pct: Math.round((1 - CODEC_BITS_RATIO[inp.codec]) * 100),
    framesInZone, metresPerFrame, warnings,
  };
}

export type Schedule = "continuous" | "business" | "motion";
export type StorageInput = {
  cameras: number;
  bitrateKbps: number;
  schedule: Schedule;
  businessHoursPerDay: number;
  motionDutyPct: number;
  retentionDays: number;
  overheadPct: number;
};

export function bandwidthStorage(inp: StorageInput) {
  const cameras = Math.round(clamp(inp.cameras, 0, 10_000));
  const bitrateKbps = clamp(inp.bitrateKbps, 0, 100_000);
  const retentionDays = clamp(inp.retentionDays, 0, 3650);
  const overheadPct = clamp(inp.overheadPct, 0, 200);
  const hours = clamp(inp.businessHoursPerDay, 0, 24);
  const duty = inp.schedule === "continuous" ? 1 : inp.schedule === "business" ? hours / 24 : clamp(inp.motionDutyPct, 0, 100) / 100;

  const perCameraBytesPerSec = (bitrateKbps * 1000) / 8;
  const aggregateBitsPerSec = cameras * bitrateKbps * 1000;
  const aggregateMbps = aggregateBitsPerSec / 1e6;
  const recordedSecPerDay = 86_400 * duty;
  const bytesPerDay = (aggregateBitsPerSec / 8) * recordedSecPerDay * (1 + overheadPct / 100);
  const bytesRetention = bytesPerDay * retentionDays;
  const steps = [
    `Per camera: ${bitrateKbps} kbit/s x 1000 = ${(bitrateKbps * 1000).toLocaleString("en-US")} bit/s; / 8 = ${perCameraBytesPerSec.toLocaleString("en-US")} B/s (bits to bytes).`,
    `Aggregate: ${cameras} cameras x ${bitrateKbps} kbit/s = ${(cameras * bitrateKbps).toLocaleString("en-US")} kbit/s = ${aggregateMbps.toFixed(2)} Mbit/s (decimal, 1 Mbit = 10^6 bit).`,
    `Recorded time/day: 86 400 s x duty ${(duty * 100).toFixed(1)}% = ${Math.round(recordedSecPerDay).toLocaleString("en-US")} s.`,
    `Bytes/day: ${(aggregateBitsPerSec / 8).toLocaleString("en-US")} B/s x ${Math.round(recordedSecPerDay).toLocaleString("en-US")} s x (1 + ${overheadPct}%) = ${(bytesPerDay / 1e9).toFixed(2)} GB (decimal, 1 GB = 10^9 B).`,
    `Retention: ${(bytesPerDay / 1e9).toFixed(2)} GB/day x ${retentionDays} days = ${(bytesRetention / 1e12).toFixed(3)} TB (10^12 B) = ${(bytesRetention / 2 ** 40).toFixed(3)} TiB (2^40 B).`,
  ];
  return {
    cameras, perCameraBytesPerSec, aggregateBitsPerSec, aggregateMbps, duty,
    gbPerDay: bytesPerDay / 1e9, tbPerDay: bytesPerDay / 1e12,
    tbRetention: bytesRetention / 1e12, gbRetention: bytesRetention / 1e9, tibRetention: bytesRetention / 2 ** 40,
    util100MPct: (aggregateMbps / 100) * 100, util1GPct: (aggregateMbps / 1000) * 100, steps,
  };
}

export type FrameType = "I" | "P" | "B";
export type GopFrame = { index: number; type: FrameType; refs: number[] };
/** Illustrative relative sizes only; real ratios vary with content and encoder. */
export const FRAME_SIZE_WEIGHT: Record<FrameType, number> = { I: 10, P: 3, B: 1 };

/** Closed-GOP display-order pattern. B frames reference the previous and next anchor (I/P); B are non-reference. */
export function buildGop(gopLength: number, bFrames: number): GopFrame[] {
  const n = Math.round(clamp(gopLength, 1, 120));
  const b = Math.round(clamp(bFrames, 0, 3));
  const step = b + 1;
  const prevAnchor = (i: number) => Math.floor(i / step) * step;
  const frames: GopFrame[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) frames.push({ index: 0, type: "I", refs: [] });
    else if (i % step === 0) frames.push({ index: i, type: "P", refs: [i - step] });
    else {
      const next = prevAnchor(i) + step;
      if (next < n) frames.push({ index: i, type: "B", refs: [prevAnchor(i), next] });
      else frames.push({ index: i, type: "P", refs: [prevAnchor(i)] }); // closed GOP: no next anchor, so P
    }
  }
  return frames;
}

/** Which frames decode given dropped frames. Dropped frame = lost packet(s). Resets at next I (next GOP not modelled). */
export function decodability(frames: GopFrame[], dropped: ReadonlySet<number>): boolean[] {
  const memo = new Map<number, boolean>();
  const ok = (i: number): boolean => {
    const hit = memo.get(i);
    if (hit !== undefined) return hit;
    const f = frames[i];
    const r = f !== undefined && !dropped.has(i) && f.refs.every(ok);
    memo.set(i, r);
    return r;
  };
  return frames.map((_, i) => ok(i));
}

/** Frames that must be decoded to display frame `target` starting from the GOP's I-frame. */
export function seekDecodeCount(frames: GopFrame[], target: number): number {
  const need = new Set<number>();
  const visit = (i: number) => {
    if (need.has(i)) return;
    need.add(i);
    frames[i]?.refs.forEach(visit);
  };
  if (frames[target]) visit(target);
  return need.size;
}

export function gopStats(frames: GopFrame[]) {
  const total = frames.reduce((s, f) => s + FRAME_SIZE_WEIGHT[f.type], 0);
  const iShare = total === 0 ? 0 : FRAME_SIZE_WEIGHT.I / total;
  const worst = frames.reduce((m, f) => Math.max(m, seekDecodeCount(frames, f.index)), 0);
  const avg = frames.length === 0 ? 0 : frames.reduce((s, f) => s + seekDecodeCount(frames, f.index), 0) / frames.length;
  return { iShare, worstSeekFrames: worst, avgSeekFrames: avg };
}

export function latencyBudget(msByStage: readonly number[]) {
  const ms = msByStage.map((v) => clamp(v, 0, 10_000));
  let acc = 0;
  const cumulativeMs = ms.map((v) => (acc += v));
  const totalMs = acc;
  let dominantIndex = 0;
  ms.forEach((v, i) => { if (v > (ms[dominantIndex] ?? 0)) dominantIndex = i; });
  return { ms, cumulativeMs, totalMs, dominantIndex, dominantSharePct: totalMs === 0 ? 0 : ((ms[dominantIndex] ?? 0) / totalMs) * 100 };
}
