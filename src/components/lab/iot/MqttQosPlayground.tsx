"use client";
import { useState } from "react";
import { LabShell } from "../LabShell";
import { Segmented, Stat, StatGrid } from "../controls";
import { effectiveQos, packetsOf, simulateQos, type Qos, type QosScenario } from "../../../lib/calc/iot";

const DEFAULT: QosScenario = { pubQos: 1, subQos: 1, dropLeg: "pub", dropIndex: 1, reconnect: true };
const QOS_OPTS = [{ value: 0, label: "QoS 0" }, { value: 1, label: "QoS 1" }, { value: 2, label: "QoS 2" }] as const;

export function MqttQosPlayground() {
  const [s, setS] = useState<QosScenario>(DEFAULT);
  const [shown, setShown] = useState<number | null>(null);
  const upd = (p: Partial<QosScenario>) => { setS({ ...s, ...p }); setShown(null); };
  const r = simulateQos(s);
  const pubPackets = packetsOf(s.pubQos);
  const legPackets = s.dropLeg === "sub" ? packetsOf(r.effective) : pubPackets;
  const legs = [{ name: "Publisher to broker", leg: r.leg1 }, ...(r.leg2 ? [{ name: "Broker to subscriber", leg: r.leg2 }] : [])];
  const limit = (l: number) => (shown === null ? l : Math.min(l, shown));

  return (
    <LabShell
      id="iot-mqtt-qos" label="Lab 5.B" title="MQTT QoS playground" kind="simulation"
      objective="Compare what QoS 0, 1 and 2 do when a packet is lost, and why the effective QoS is the lower of publisher and subscriber."
      assumptions={[
        "Teaching model of one message over two legs (publisher to broker, broker to subscriber); no real MQTT broker or client is used.",
        "Exactly one packet of the chosen leg is lost; the reconnect option assumes a persistent session so the sender retransmits unacknowledged packets.",
        "A QoS 1 retransmission is marked DUP and the receiver cannot tell it was already processed. QoS 2 deduplicates by packet id inside the protocol.",
        "Application crashes, broker restarts and message expiry are out of scope.",
      ]}
      onReset={() => { setS(DEFAULT); setShown(null); }}
      summary={<p>Effective QoS is {r.effective} (min of publisher {s.pubQos} and subscriber {s.subQos}). Outcome: <strong>{r.outcome}</strong>, application received it {r.appDeliveries} time(s). {r.explanation}{" "}Idempotency note: at-least-once delivery means the consumer should upsert by message or device-and-timestamp key so a duplicate is harmless.</p>}
      controls={
        <>
          <Segmented label="Publisher QoS" value={s.pubQos} options={QOS_OPTS} onChange={(v) => upd({ pubQos: v as Qos })} />
          <Segmented label="Subscription QoS" value={s.subQos} options={QOS_OPTS} onChange={(v) => upd({ subQos: v as Qos })} />
          <Segmented label="Link drop on" value={s.dropLeg} options={[{ value: "none", label: "None" }, { value: "pub", label: "Publish leg" }, { value: "sub", label: "Delivery leg" }]} onChange={(v) => upd({ dropLeg: v })} />
          {s.dropLeg !== "none" && (
            <Segmented label="Lost packet" value={Math.min(s.dropIndex, legPackets.length - 1)} options={legPackets.map((p, i) => ({ value: i, label: p }))} onChange={(v) => upd({ dropIndex: v })} />
          )}
          <Segmented label="Client reconnects" value={s.reconnect ? "yes" : "no"} options={[{ value: "yes", label: "Reconnect" }, { value: "no", label: "Stay down" }]} onChange={(v) => upd({ reconnect: v === "yes" })} />
          <div className="flex gap-2">
            <button type="button" className="btn lab-btn" onClick={() => setShown((x) => (x === null ? 1 : x + 1))}>Step packet</button>
            <button type="button" className="btn lab-btn" onClick={() => setShown(null)}>Show all</button>
          </div>
        </>
      }
    >
      <StatGrid>
        <Stat label="Effective QoS" value={String(effectiveQos(s.pubQos, s.subQos))} />
        <Stat label="App deliveries" value={String(r.appDeliveries)} />
        <Stat label="Outcome" value={r.outcome} />
      </StatGrid>
      {legs.map(({ name, leg }) => (
        <div key={name} className="mt-4">
          <h4 className="font-semibold text-[0.9rem]">{name} (QoS {leg.qos})</h4>
          <div className="overflow-x-auto">
            <table className="w-full num text-[0.82rem]">
              <caption className="sr-only">Packet sequence for {name}</caption>
              <thead><tr className="text-left"><th scope="col">#</th><th scope="col">From</th><th scope="col">Packet</th><th scope="col">Status</th><th scope="col">What happens</th></tr></thead>
              <tbody>
                {leg.steps.slice(0, limit(leg.steps.length)).map((st, i) => (
                  <tr key={i} className="border-t border-lab" style={st.lost ? { color: "var(--signal)" } : undefined}>
                    <td>{i + 1}</td><td>{st.from === "S" ? "sender" : st.from === "R" ? "receiver" : "-"}</td>
                    <td>{st.packet}{st.dup ? " (DUP)" : ""}</td><td>{st.lost ? "✕ LOST" : "✓ ok"}</td><td>{st.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {!r.leg2 && <p className="mt-3 text-[0.85rem]">The broker never accepted the message, so there is no delivery leg.</p>}
    </LabShell>
  );
}
