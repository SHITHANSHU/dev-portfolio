"use client";
import { useEffect, useState } from "react";
import { useReducedMotion } from "../useReducedMotion";

/** Step player. Never autoplays; Play is user-initiated. `reduced` reports prefers-reduced-motion so the UI can say so. */
export function usePlayer(length: number, ms = 1300) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setStep((s) => {
        if (s >= length - 1) { setPlaying(false); return s; }
        return s + 1;
      });
    }, ms);
    return () => window.clearInterval(id);
  }, [playing, length, ms]);
  return {
    step, playing, reduced,
    setStep: (s: number) => { setPlaying(false); setStep(Math.min(length - 1, Math.max(0, s))); },
    toggle: () => { if (step >= length - 1) setStep(0); setPlaying((p) => !p); },
    next: () => { setPlaying(false); setStep((s) => (s + 1) % length); },
    reset: () => { setPlaying(false); setStep(0); },
  };
}
