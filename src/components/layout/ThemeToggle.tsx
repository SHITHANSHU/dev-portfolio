"use client";
import { useSyncExternalStore } from "react";

const themes = [
  { id: "light", label: "White" },
  { id: "dark", label: "Night" },
] as const;
type Theme = (typeof themes)[number]["id"];

const isTheme = (value: string | undefined): value is Theme =>
  themes.some((theme) => theme.id === value);
const read = (): Theme => {
  const value = document.documentElement.dataset.theme;
  return isTheme(value) ? value : "light";
};
const subscribe = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
};

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);
  return (
    <label className="theme-picker">
      <span className="meta">Theme</span>
      <select
        aria-label="Color theme"
        className="theme-select"
        value={theme}
        onChange={(event) => {
          const next = event.currentTarget.value;
          if (!isTheme(next)) return;
          document.documentElement.dataset.theme = next;
          try { localStorage.setItem("theme", next); } catch { /* storage may be blocked */ }
        }}
      >
        {themes.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}
