"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { NumberField, Segmented, Slider, Stat, StatGrid } from "../controls";
import { cameraConfig, type CameraConfigInput, type Codec, type ResKey } from "@/lib/calc/camera";

const DEFAULTS: CameraConfigInput = { resolution: "1080p", profile: "main", fps: 25, codec: "H.264", rateControl: "CBR", bitrateKbps: 4000, gopUnit: "seconds", gopValue: 2 };
const RES: ResKey[] = ["720p", "1080p", "4MP", "4K"];
const CODECS: Codec[] = ["H.264", "H.265", "MJPEG"];
const BANDS = ["starved", "low", "adequate", "good", "generous"] as const;

export function CameraConfigPlayground() {
  const [c, setC] = useState<CameraConfigInput>(DEFAULTS);
  const set = <K extends keyof CameraConfigInput>(k: K, v: CameraConfigInput[K]) => setC((p) => ({ ...p, [k]: v }));
  const r = cameraConfig(c);
  const bandIdx = BANDS.indexOf(r.band);

  return (
    <LabShell
      id="lab-camera-config" label="Lab 3.A" title="Camera configuration playground" kind="calculator"
      objective="See how resolution, FPS, codec, bitrate and keyframe interval trade off bandwidth, storage, quality and what an analytics model can read."
      assumptions={[
        "Estimate only; no camera is connected. Defaults are illustrative, not vendor recommendations.",
        "Bitrate is the video elementary stream target in kbit/s (decimal). Audio, RTP/network overhead and container overhead are ignored. VBR is treated as an average.",
        "Storage uses decimal GB (1 GB = 10^9 bytes); 1 hour = 3600 s of continuous recording.",
        "Bits per pixel = bitrate / (width x height x fps). Bands are rough illustrative thresholds on an H.264-equivalent figure.",
        "Codec factor is a rough rule of thumb: H.265 needs roughly 30-50% less bitrate than H.264 for similar quality (modelled as 35% less); MJPEG roughly 4x more. Approximate and content dependent.",
        "Worst-case join latency is about one keyframe interval (wait for the next I-frame); decoder and network delay are extra.",
        "Sub stream is modelled as 640x360 (illustrative). The ANPR note assumes a 50 km/h vehicle and a 5 m plate-legible zone.",
      ]}
      onReset={() => setC(DEFAULTS)}
      summary={
        <p>
          {c.profile === "main" ? c.resolution : "sub stream 640x360"} at {r.fps} fps, {c.codec} {c.rateControl} {r.bitrateKbps} kbit/s: about{" "}
          {r.bandwidthMbps.toFixed(2)} Mbit/s and {r.gbPerDay.toFixed(1)} GB/day. Quality indicator: {r.band} ({r.h264EquivBpp.toFixed(3)} bits/pixel, H.264-equivalent).
          Keyframe every {r.keyframeIntervalSec.toFixed(2)} s, so a new viewer may wait up to that long for a picture. {r.warnings.filter((w) => w.severity === "warn").length} warning(s) for analytics.
        </p>
      }
      controls={<>
        <Segmented label="Stream profile" value={c.profile} options={[{ value: "main", label: "Main" }, { value: "sub", label: "Sub" }]} onChange={(v) => set("profile", v)} />
        <Segmented label={c.profile === "sub" ? "Resolution (main only)" : "Resolution"} value={c.resolution} options={RES.map((x) => ({ value: x, label: x }))} onChange={(v) => set("resolution", v)} />
        <Slider label="Frame rate" unit="fps" value={c.fps} min={5} max={60} onChange={(v) => set("fps", v)} />
        <Segmented label="Codec" value={c.codec} options={CODECS.map((x) => ({ value: x, label: x }))} onChange={(v) => set("codec", v)} />
        <Segmented label="Rate control" value={c.rateControl} options={[{ value: "CBR", label: "CBR" }, { value: "VBR", label: "VBR" }]} onChange={(v) => set("rateControl", v)} />
        <Slider label="Bitrate" unit="kbit/s" value={c.bitrateKbps} min={128} max={16000} step={64} onChange={(v) => set("bitrateKbps", v)} />
        <Segmented label="Keyframe interval unit" value={c.gopUnit} options={[{ value: "seconds", label: "Seconds" }, { value: "frames", label: "Frames" }]}
          onChange={(u) => setC((p) => ({ ...p, gopUnit: u, gopValue: u === "seconds" ? Math.max(0.1, Math.round((r.gopFrames / r.fps) * 10) / 10) : r.gopFrames }))} />
        <NumberField label="Keyframe (GOP) interval" unit={c.gopUnit} value={c.gopValue} min={c.gopUnit === "seconds" ? 0.1 : 1} max={c.gopUnit === "seconds" ? 10 : 600} step={c.gopUnit === "seconds" ? 0.5 : 1} onChange={(v) => set("gopValue", v)} />
      </>}
    >
      <StatGrid>
        <Stat label="Bandwidth (this stream)" value={r.bandwidthMbps.toFixed(2)} unit="Mbit/s" note={c.rateControl === "VBR" ? `peak allowance ~${r.peakMbps.toFixed(1)} Mbit/s (illustrative 1.5x)` : "constant"} />
        <Stat label="Storage per hour" value={r.gbPerHour.toFixed(2)} unit="GB (decimal)" />
        <Stat label="Storage per day" value={r.gbPerDay.toFixed(1)} unit="GB (decimal)" />
        <Stat label="Bits per pixel" value={r.bpp.toFixed(3)} note={`H.264-equiv. ${r.h264EquivBpp.toFixed(3)}`} />
        <Stat label="Keyframe interval" value={r.keyframeIntervalSec.toFixed(2)} unit="s" note={`${r.gopFrames} frames`} />
        <Stat label="Worst-case join latency" value={`~${r.worstJoinLatencySec.toFixed(1)}`} unit="s" note="about one GOP; excludes network/decode" />
      </StatGrid>

      <div className="mt-4">
        <p className="font-medium">Quality indicator (bits per pixel): <span className="num">{r.band}</span></p>
        <ol className="mt-1 grid grid-cols-5 gap-px text-center text-[0.72rem]" aria-label="Quality band scale">
          {BANDS.map((b, i) => (
            <li key={b} className="border border-lab px-1 py-1" style={i === bandIdx ? { background: "var(--lab)", color: "var(--paper)", fontWeight: 700 } : undefined} aria-current={i === bandIdx ? "true" : undefined}>
              {i === bandIdx ? "▶ " : ""}{b}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[0.8rem] opacity-80">
          Codec rule of thumb (approximate, content dependent): {c.codec} needs about {r.codecSavingVsH264Pct >= 0 ? `${r.codecSavingVsH264Pct}% less` : `${-r.codecSavingVsH264Pct}% more`} bitrate than H.264 for similar quality.
        </p>
      </div>

      <div className="mt-4">
        <p className="font-medium">Analytics implications and warnings</p>
        {r.warnings.length === 0 ? <p>No warnings for this configuration.</p> : (
          <ul className="mt-1 space-y-1">
            {r.warnings.map((w) => (
              <li key={w.id} className="border-l-2 pl-2" style={{ borderColor: w.severity === "warn" ? "var(--signal)" : "var(--lab)" }}>
                <span className="num font-semibold">{w.severity === "warn" ? "[WARN]" : "[NOTE]"}</span> {w.text}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[0.8rem] opacity-80">ANPR geometry (illustrative): {r.metresPerFrame.toFixed(2)} m of travel per frame at 50 km/h; ~{r.framesInZone.toFixed(1)} frames in a 5 m zone.</p>
      </div>
    </LabShell>
  );
}
