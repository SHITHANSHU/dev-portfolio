"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { Segmented } from "../controls";

type Sev = "mild" | "severe";
type Scenario = {
  id: string; label: string; symptoms: string[]; causes: string[]; checks: string[]; remedies: string[];
  see: string; log: (s: Sev) => string[];
};
const pick = <T,>(s: Sev, a: T, b: T) => (s === "mild" ? a : b);

const SCENARIOS: Scenario[] = [
  { id: "loss", label: "Packet loss (UDP)", see: "Grey smears, green blocks or frozen frames that clear at the next keyframe.",
    symptoms: ["Intermittent corruption or freezes", "Artifacts persist until the next I-frame", "Worse on Wi-Fi or congested links"],
    causes: ["Lossy or congested network path", "UDP transport with no retransmission", "Switch/Wi-Fi buffer overflow", "Long GOP making each loss last longer"],
    checks: ["Compare the same stream over TCP-interleaved transport", "Check RTP sequence-number gaps in client stats", "Ping/iperf the path for loss and jitter", "Check switch port error counters"],
    remedies: ["Use RTSP over TCP (interleaved) where latency allows", "Shorten the keyframe interval", "Fix the congested/lossy link or add QoS", "Use a wired connection"],
    log: (s) => [`[synthetic] rtp: seq gap expected=${pick(s, 1042, 3310)} got=${pick(s, 1044, 3331)}`, `[synthetic] rtp: ${pick(s, "0.8", "6.5")}% packets lost in last 10 s`, "[synthetic] decoder: corrupt access unit, waiting for keyframe"] },
  { id: "jitter", label: "High latency / jitter", see: "Picture is seconds behind real time, or stutters then bursts forward.",
    symptoms: ["Constant delay behind real life", "Stutter followed by fast catch-up", "Audio/video drift"],
    causes: ["Large jitter buffer configured", "Bursty network delivery", "Client buffering several frames", "Long GOP with B-frame reorder"],
    checks: ["Measure inter-arrival jitter in the client stats", "Check the player buffer/latency setting", "Compare against a direct local viewer", "Check CPU load on the client"],
    remedies: ["Reduce jitter-buffer size gradually", "Lower-latency player settings", "Fix bursty network paths", "Fewer B-frames and shorter GOP"],
    log: (s) => [`[synthetic] jitterbuf: depth=${pick(s, 120, 900)} ms, late_packets=${pick(s, 2, 47)}`, `[synthetic] player: end-to-end delay ~${pick(s, "0.6", "4.2")} s`, `[synthetic] rtp: interarrival jitter=${pick(s, 8, 85)} ms`] },
  { id: "bitrate", label: "Insufficient bitrate (blocky)", see: "Blocky, smeared detail on motion or busy scenes; clean frames when the scene is still.",
    symptoms: ["Macroblocking on movement", "Plates/faces smeared", "Quality drops at night or in busy scenes"],
    causes: ["Bitrate too low for resolution x fps", "CBR starving busy scenes", "Noisy night scene consuming bits", "Aggressive rate-control profile"],
    checks: ["Compute bits per pixel (see Lab 3.A)", "Compare quality in still vs busy scenes", "Check the rate-control mode and bitrate cap", "Look at gain/noise at night"],
    remedies: ["Raise the bitrate or use VBR with a sensible cap", "Lower FPS or resolution", "Switch to H.265 if the whole chain supports it", "Reduce noise (lighting, noise reduction)"],
    log: (s) => [`[synthetic] encoder-stats: target=${pick(s, 2000, 600)} kbit/s, bpp=${pick(s, "0.040", "0.012")}`, `[synthetic] encoder-stats: avg_qp=${pick(s, 36, 46)}`, "[synthetic] note: quantiser high, expect visible blocking"] },
  { id: "codec", label: "Unsupported codec / profile", see: "Black frame or error immediately, though the connection itself succeeds.",
    symptoms: ["Connects but shows black or no video", "Decoder error at start", "Works in the vendor viewer but not in your player"],
    causes: ["Player or hardware decoder lacks H.265 or the High 10 / level in use", "SDP advertises a codec the pipeline cannot depay", "Missing SPS/PPS", "Browser does not play RTSP/H.265 directly"],
    checks: ["Read the SDP from DESCRIBE for codec and profile-level-id", "Probe the stream with ffprobe", "Test an alternate stream (sub stream or H.264)", "Check decoder capability on the target hardware"],
    remedies: ["Switch the camera stream to H.264 Main/High", "Update the player or decoder", "Transcode in the pipeline (costs CPU)", "Use the sub stream for compatibility"],
    log: () => ["[synthetic] sdp: m=video 0 RTP/AVP 96; a=rtpmap:96 H265/90000", "[synthetic] decoder: unsupported codec H265 on this device", "[synthetic] pipeline: no suitable depayloader/decoder, aborting"] },
  { id: "decoder", label: "Decoder overload", see: "Frame rate drops, video lags further behind over time, or frames are skipped.",
    symptoms: ["Delay grows steadily", "Dropped frames", "CPU/GPU pegged"],
    causes: ["Too many streams per decoder", "Software decode of high-res H.265", "Resolution/FPS higher than analytics needs", "Hardware decoder session limit reached"],
    checks: ["Check CPU/GPU decoder utilisation", "Count concurrent streams per device", "Compare decoded FPS with stream FPS", "Check hardware decoder session limits"],
    remedies: ["Use hardware decode", "Decode the sub stream where it is enough", "Skip frames to the analytics FPS", "Spread streams across more devices"],
    log: (s) => [`[synthetic] decoder: input ${pick(s, "25", "25")} fps, decoded ${pick(s, "21", "9")} fps`, `[synthetic] decoder: queue depth=${pick(s, 18, 240)} frames`, `[synthetic] pipeline: dropping ${pick(s, "late", "stale")} frames to catch up`] },
  { id: "auth", label: "NAT / auth failure", see: "Player reports unauthorized, or connects then times out waiting for video.",
    symptoms: ["RTSP 401 Unauthorized", "Connects but no video: RTP never arrives", "Works on the LAN, not across NAT/VPN"],
    causes: ["Wrong username/password or digest/basic mismatch", "Special characters unescaped in the URL", "RTP UDP ports blocked or not forwarded by NAT/firewall", "Session expired (454 Session Not Found) because keep-alives were not sent"],
    checks: ["Test credentials on the LAN first", "Check the RTSP reply codes in a verbose client log", "Retry with TCP-interleaved transport (single TCP port)", "Check firewall/NAT rules for RTSP and RTP"],
    remedies: ["Correct the credentials, URL-encode special characters", "Use RTSP over TCP through NAT/VPN", "Open or forward the required ports", "Send keep-alives within the session timeout"],
    log: (s) => ["[synthetic] >> DESCRIBE rtsp://camera.example/stream1 RTSP/1.0", pick(s, "[synthetic] << RTSP/1.0 401 Unauthorized", "[synthetic] << RTSP/1.0 401 Unauthorized (retry 3, giving up)"), pick(s, "[synthetic] note: after SETUP over UDP, no RTP received for 10 s", "[synthetic] << RTSP/1.0 454 Session Not Found (session expired)")] },
];

export function StreamTroubleshootingSimulator() {
  const [id, setId] = useState(SCENARIOS[0]?.id ?? "loss");
  const [sev, setSev] = useState<Sev>("mild");
  const [done, setDone] = useState<string[]>([]);
  const sc = SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
  if (!sc) return null;
  const doneHere = sc.checks.filter((c) => done.includes(c)).length;
  const toggle = (c: string) => setDone((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  return (
    <LabShell
      id="lab-camera-trouble" label="Lab 3.E" title="Stream troubleshooting simulator" kind="simulation"
      objective="Match what you see on screen and in logs to likely causes, then work through diagnostic checks in a sensible order."
      assumptions={[
        "Scenarios and log lines are synthetic and hand-written; nothing connects to a real camera, RTSP server or network.",
        "Real symptoms overlap; several causes often combine. Treat the lists as a starting checklist, not a diagnosis.",
        "RTSP codes used are standard: 401 Unauthorized and 454 Session Not Found. Behaviour varies by camera: some close the connection or return other codes.",
        "Severity changes the illustrative numbers in the synthetic logs only.",
      ]}
      onReset={() => { setId(SCENARIOS[0]?.id ?? "loss"); setSev("mild"); setDone([]); }}
      summary={<p>Scenario: {sc.label} ({sev}). You would see: {sc.see} {doneHere} of {sc.checks.length} diagnostic checks ticked. Work from the cheapest check (usually transport/credentials) to the most invasive.</p>}
      controls={<>
        <Segmented label="Scenario" value={id} options={SCENARIOS.map((s) => ({ value: s.id, label: s.label }))} onChange={setId} />
        <Segmented label="Severity (synthetic logs)" value={sev} options={[{ value: "mild", label: "Mild" }, { value: "severe", label: "Severe" }]} onChange={setSev} />
      </>}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <section><h4 className="font-semibold">Symptoms</h4><ul className="list-disc pl-5">{sc.symptoms.map((x) => <li key={x}>{x}</li>)}</ul></section>
        <section><h4 className="font-semibold">Likely causes</h4><ul className="list-disc pl-5">{sc.causes.map((x) => <li key={x}>{x}</li>)}</ul></section>
        <section>
          <h4 className="font-semibold">Diagnostic checks ({doneHere}/{sc.checks.length})</h4>
          <ul>{sc.checks.map((c) => (
            <li key={c}><label className="flex items-start gap-2 min-h-9 py-1 cursor-pointer"><input type="checkbox" className="mt-1" checked={done.includes(c)} onChange={() => toggle(c)} /><span className={done.includes(c) ? "line-through opacity-70" : ""}>{c}</span></label></li>
          ))}</ul>
        </section>
        <section><h4 className="font-semibold">Remedies</h4><ul className="list-disc pl-5">{sc.remedies.map((x) => <li key={x}>{x}</li>)}</ul></section>
      </div>
      <div className="mt-4 border border-lab p-3">
        <p className="font-semibold">What you would see <span className="meta">(synthetic)</span></p>
        <p className="mt-1">{sc.see}</p>
        <pre className="num mt-2 overflow-x-auto p-2 text-[0.78rem]" style={{ background: "var(--code-bg)" }} aria-label="Synthetic log output">{sc.log(sev).join("\n")}</pre>
      </div>
    </LabShell>
  );
}
