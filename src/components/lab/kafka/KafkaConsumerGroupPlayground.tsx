"use client";
import { useCallback, useEffect, useState } from "react";
import { LabShell } from "../LabShell";
import { Segmented, Slider } from "../controls";

type RecordItem = { offset: number; key: string };
type CommitMode = "manual" | "automatic";

const PARTITIONS = 4;
const MAX_TICKS = 20;
const DEFAULTS = { consumers: 2, produce: 3, capacity: 2, commitMode: "manual" as CommitMode };
const COMMIT_MODES = [
  { value: "manual", label: "Manual" },
  { value: "automatic", label: "Auto each tick" },
] as const;

function seedLog(): RecordItem[][] {
  return Array.from({ length: PARTITIONS }, (_, partition) =>
    Array.from({ length: 3 }, (_, offset) => ({ offset, key: `device-${partition}-${offset}` })),
  );
}

function eventSeed(): string[] {
  return ["t=0 · topic seeded with 3 records per partition; group starts at offset 0"];
}

export function KafkaConsumerGroupPlayground() {
  const [consumers, setConsumers] = useState(DEFAULTS.consumers);
  const [produceRate, setProduceRate] = useState(DEFAULTS.produce);
  const [capacity, setCapacity] = useState(DEFAULTS.capacity);
  const [commitMode, setCommitMode] = useState<CommitMode>(DEFAULTS.commitMode);
  const [tick, setTick] = useState(0);
  const [logs, setLogs] = useState<RecordItem[][]>(seedLog);
  const [position, setPosition] = useState<number[]>(() => Array(PARTITIONS).fill(0));
  const [committed, setCommitted] = useState<number[]>(() => Array(PARTITIONS).fill(0));
  const [events, setEvents] = useState<string[]>(eventSeed);
  const [playing, setPlaying] = useState(false);

  const advance = useCallback(() => {
    if (tick >= MAX_TICKS) { setPlaying(false); return; }
    const nextTick = tick + 1;
    const nextLogs = logs.map((partition) => [...partition]);
    const actions: string[] = [];

    for (let i = 0; i < produceRate; i++) {
      const partition = ((nextTick - 1) * produceRate + i) % PARTITIONS;
      const records = nextLogs[partition];
      if (!records) continue;
      const record: RecordItem = { offset: records.length, key: `device-${(nextTick + i) % 8}` };
      records.push(record);
      actions.push(`t=${nextTick} · produced ${record.key} → P${partition} offset ${record.offset}`);
    }

    const nextPosition = [...position];
    const activeConsumers = Math.min(consumers, PARTITIONS);
    for (let consumer = 0; consumer < activeConsumers; consumer++) {
      const assigned = Array.from({ length: PARTITIONS }, (_, p) => p).filter((p) => p % activeConsumers === consumer);
      let cursor = 0;
      let handled = 0;
      while (handled < capacity && assigned.length > 0) {
        let found = false;
        for (let checked = 0; checked < assigned.length; checked++) {
          const partition = assigned[cursor % assigned.length];
          cursor++;
          if (partition === undefined) continue;
          const current = nextPosition[partition] ?? 0;
          const records = nextLogs[partition] ?? [];
          if (current >= records.length) continue;
          const record = records[current];
          if (!record) continue;
          nextPosition[partition] = current + 1;
          actions.push(`t=${nextTick} · consumer-${consumer + 1} processed P${partition} offset ${record.offset}`);
          handled++;
          found = true;
          break;
        }
        if (!found) break;
      }
    }

    setTick(nextTick);
    setLogs(nextLogs);
    setPosition(nextPosition);
    if (commitMode === "automatic") {
      setCommitted(nextPosition);
      actions.push(`t=${nextTick} · automatic commit advanced to the next processed offset`);
    }
    if (actions.length === 0) actions.push(`t=${nextTick} · no records produced or processed`);
    setEvents((current) => [...actions.reverse(), ...current].slice(0, 32));
  }, [capacity, commitMode, consumers, logs, position, produceRate, tick]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => advance(), 850);
    return () => window.clearInterval(timer);
  }, [advance, playing]);

  const commit = () => {
    setCommitted(position);
    setEvents((current) => [`t=${tick} · manual commit saved the next offsets for all four partitions`, ...current].slice(0, 32));
  };

  const recover = () => {
    setPlaying(false);
    setPosition(committed);
    setEvents((current) => [`t=${tick} · consumer restarted at committed offsets; uncommitted records can be delivered again`, ...current].slice(0, 32));
  };

  const replay = () => {
    setPlaying(false);
    setPosition(Array(PARTITIONS).fill(0));
    setCommitted(Array(PARTITIONS).fill(0));
    setEvents((current) => [`t=${tick} · group offsets reset to the beginning; retained records will replay`, ...current].slice(0, 32));
  };

  const reset = () => {
    setPlaying(false); setConsumers(DEFAULTS.consumers); setProduceRate(DEFAULTS.produce); setCapacity(DEFAULTS.capacity);
    setCommitMode(DEFAULTS.commitMode); setTick(0); setLogs(seedLog());
    setPosition(Array(PARTITIONS).fill(0)); setCommitted(Array(PARTITIONS).fill(0)); setEvents(eventSeed());
  };

  const lagByPartition = logs.map((records, p) => Math.max(0, records.length - (committed[p] ?? 0)));
  const totalLag = lagByPartition.reduce((sum, lag) => sum + lag, 0);
  const activeConsumers = Math.min(consumers, PARTITIONS);
  const idleConsumers = Math.max(0, consumers - PARTITIONS);
  const allProcessed = position.every((offset, p) => offset >= (logs[p]?.length ?? 0));

  return (
    <LabShell
      id="lab-kafka-consumer-offsets" label="Lab" title="Kafka consumer group and offset playground" kind="simulation"
      objective="Watch records append to partition logs, see a consumer group process assigned partitions, and compare processed positions with committed offsets and lag."
      assumptions={[
        "Four synthetic partitions are seeded with three records each. New keyless records are distributed round-robin; real keyed producers use a partitioner and may distribute differently.",
        "Partitions are assigned round-robin across consumers at each tick. This is a simplified stable assignment, not a simulation of Kafka's group protocol, rebalances, cooperative assignment or static membership.",
        "Each consumer processes at most the selected number of records per tick across its assigned partitions. Consumers beyond the partition count are idle; one partition is owned by at most one consumer in this group.",
        "Position is the next record the consumer would read. Committed offset is also modeled as the next record to read. Lag shown here is log end offset minus committed offset, so processing without committing still counts as lag.",
        "The manual crash action restarts from committed offsets and can redeliver already-processed records. Replay resets this group's offsets to the start; it does not delete or mutate topic records. No real Kafka cluster, broker I/O, transactions or network failures are involved.",
      ]}
      onReset={reset}
      summary={<p>Tick {tick} of {MAX_TICKS}. {PARTITIONS} partitions, {consumers} consumers ({activeConsumers} active{idleConsumers ? `, ${idleConsumers} idle` : ""}), {totalLag} records of committed-offset lag. {commitMode === "manual" ? "Manual commits are selected" : "Offsets commit at the end of each tick"}; {allProcessed ? "the current read positions have caught up to the log end" : "some records remain to be processed or committed"}.</p>}
      controls={
        <>
          <Slider label="Consumer group members" value={consumers} min={1} max={6} onChange={setConsumers} hint="There are four partitions; extra consumers have no assignment." />
          <Slider label="Produce rate" unit="records / tick" value={produceRate} min={0} max={8} onChange={setProduceRate} />
          <Slider label="Per-consumer processing capacity" unit="records / tick" value={capacity} min={0} max={6} onChange={setCapacity} />
          <Segmented label="Offset commit mode" value={commitMode} options={COMMIT_MODES} onChange={setCommitMode} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn lab-btn" onClick={() => setPlaying((current) => !current)} disabled={tick >= MAX_TICKS}>{playing ? "Pause" : "Play"}</button>
            <button type="button" className="btn lab-btn" onClick={() => { setPlaying(false); advance(); }} disabled={tick >= MAX_TICKS}>Step</button>
            <button type="button" className="btn lab-btn" onClick={commit} disabled={commitMode === "automatic"}>Commit processed</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn lab-btn" onClick={recover}>Crash → recover</button>
            <button type="button" className="btn lab-btn" onClick={replay}>Replay from start</button>
          </div>
          <p className="text-[0.78rem] opacity-80">Play advances discrete simulated ticks and stops at tick {MAX_TICKS}. Playback never starts automatically.</p>
        </>
      }
    >
      <div className="space-y-4">
        <section aria-label="Topic partitions">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="font-semibold">Topic log · telemetry</h4>
            <span className="meta">Group: device-indexer</span>
          </div>
          <div className="grid gap-3 mt-2 md:grid-cols-2">
            {logs.map((records, partition) => {
              const owner = partition % activeConsumers;
              const nextOffset = position[partition] ?? 0;
              const committedOffset = committed[partition] ?? 0;
              return (
                <section key={partition} aria-label={`Partition ${partition}`} className="border border-lab bg-paper p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h5 className="font-mono text-sm font-semibold">P{partition}</h5>
                    <span className="text-xs">consumer-{owner + 1}</span>
                  </div>
                  <p className="num text-xs mt-1">end {records.length} · position {nextOffset} · committed {committedOffset} · lag {lagByPartition[partition] ?? 0}</p>
                  <ol className="mt-2 max-h-40 overflow-y-auto space-y-1" aria-label={`Records in partition ${partition}`}>
                    {records.map((record) => {
                      const state = record.offset < committedOffset ? "committed" : record.offset < nextOffset ? "processed, not committed" : "waiting";
                      const className = record.offset < committedOffset
                        ? "border-rule bg-paper-2 opacity-70"
                        : record.offset < nextOffset
                          ? "border-signal bg-signal/10"
                          : "border-lab bg-lab-soft";
                      return (
                        <li key={record.offset} className={`flex items-center justify-between gap-2 border px-2 py-1 text-[0.72rem] ${className}`}>
                          <span className="font-mono">o{record.offset} · {record.key}</span>
                          <span>{state}</span>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </div>
        </section>

        <section aria-label="Consumer group activity">
          <h4 className="font-semibold mb-2">Consumer event log</h4>
          <ol className="max-h-44 overflow-y-auto border border-lab bg-paper p-2 font-mono text-[0.72rem] space-y-1" tabIndex={0} aria-label="Kafka consumer group events">
            {events.map((event, index) => <li key={`${index}-${event}`}>{event}</li>)}
          </ol>
        </section>
      </div>
    </LabShell>
  );
}
