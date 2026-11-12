export type SeqMessage = { from: string; to: string; label: string; dashed?: boolean; note?: string };

/** SVG sequence diagram. Actors are columns; messages are rows. Provides a text list for assistive tech. */
export function SequenceDiagram({ title, actors, messages }: { title: string; actors: string[]; messages: SeqMessage[] }) {
  const colW = 150, rowH = 44, top = 44, pad = 20;
  const w = pad * 2 + colW * actors.length;
  const h = top + rowH * messages.length + 16;
  const x = (a: string) => pad + colW * Math.max(0, actors.indexOf(a)) + colW / 2;
  return (
    <figure role="group" aria-label={title}>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${title} (scrollable)`}>
        <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="min-w-[36rem] max-w-none" style={{ color: "var(--ink)" }} aria-hidden>
          <defs>
            <marker id="seq-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L8 4 L0 8 z" fill="currentColor" />
            </marker>
          </defs>
          {actors.map((a) => (
            <g key={a}>
              <text x={x(a)} y={20} textAnchor="middle" fontFamily="var(--font-sans)" fontSize="12" fontWeight="600" fill="currentColor">{a}</text>
              <line x1={x(a)} x2={x(a)} y1={28} y2={h - 6} stroke="var(--rule)" strokeDasharray="3 4" />
            </g>
          ))}
          {messages.map((m, i) => {
            const y = top + rowH * i + 22;
            const x1 = x(m.from), x2 = x(m.to);
            const self = m.from === m.to;
            return (
              <g key={`${i}-${m.label}`}>
                {self ? (
                  <path d={`M${x1} ${y - 8} h26 v16 h-26`} fill="none" stroke="currentColor" markerEnd="url(#seq-arrow)" />
                ) : (
                  <line x1={x1} x2={x2 + (x2 > x1 ? -2 : 2)} y1={y} y2={y} stroke="currentColor" strokeDasharray={m.dashed ? "5 3" : undefined} markerEnd="url(#seq-arrow)" />
                )}
                <text x={self ? x1 + 32 : (x1 + x2) / 2} y={y - 6} textAnchor={self ? "start" : "middle"} fontFamily="var(--font-sans)" fontSize="11" fill="currentColor">
                  {i + 1}. {m.label}
                </text>
                {m.note && <text x={self ? x1 + 32 : (x1 + x2) / 2} y={y + 13} textAnchor={self ? "start" : "middle"} fontFamily="var(--font-sans)" fontSize="10" fill="var(--muted)">{m.note}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <ol className="sr-only">
        {messages.map((m, i) => <li key={i}>{m.from} to {m.to}: {m.label}{m.note ? ` (${m.note})` : ""}</li>)}
      </ol>
    </figure>
  );
}
