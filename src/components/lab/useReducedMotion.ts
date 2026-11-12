"use client";
import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia?.(query);
  m?.addEventListener("change", cb);
  return () => m?.removeEventListener("change", cb);
};

/** True when the user prefers reduced motion. Server snapshot and jsdom (no matchMedia) report false. */
export const useReducedMotion = (): boolean =>
  useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? false, () => false);
