"use client";
import { useId } from "react";

type SliderProps = {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** Optional formatter for the displayed value. */
  format?: (v: number) => string;
  hint?: string;
};

export function Slider({ label, unit, value, min, max, step = 1, onChange, format, hint }: SliderProps) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="font-medium">{label}</label>
        <output htmlFor={id} className="num">{format ? format(value) : value}{unit ? ` ${unit}` : ""}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-describedby={hint ? `${id}-h` : undefined} />
      {hint && <p id={`${id}-h`} className="text-[0.78rem] opacity-80">{hint}</p>}
    </div>
  );
}

type NumberProps = { label: string; unit?: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; hint?: string };

/** Number input that clamps to [min,max] on every change; NaN falls back to min. */
export function NumberField({ label, unit, value, min, max, step = 1, onChange, hint }: NumberProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="font-medium block">{label}{unit ? <span className="opacity-70"> ({unit})</span> : null}</label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        className="w-full num"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-describedby={hint ? `${id}-h` : undefined}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);
        }}
      />
      {hint && <p id={`${id}-h`} className="text-[0.78rem] opacity-80">{hint}</p>}
    </div>
  );
}

type SegProps<T extends string | number> = { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void };

export function Segmented<T extends string | number>({ label, value, options, onChange }: SegProps<T>) {
  return (
    <fieldset>
      <legend className="font-medium mb-1">{label}</legend>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button key={String(o.value)} type="button" className="btn lab-btn" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Stat({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="border-t border-lab pt-2">
      <dt className="text-[0.72rem] uppercase tracking-wide opacity-80">{label}</dt>
      <dd className="num text-xl leading-tight">{value}{unit ? <span className="text-sm opacity-70"> {unit}</span> : null}</dd>
      {note && <dd className="text-[0.78rem] opacity-80">{note}</dd>}
    </div>
  );
}

export const StatGrid = ({ children }: { children: React.ReactNode }) => (
  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">{children}</dl>
);
