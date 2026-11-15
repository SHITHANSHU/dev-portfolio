"use client";
import { useEffect, useId, useState } from "react";

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Renders a ```mermaid fence client-side. The library loads only on pages that have a diagram; without JS the source stays visible. */
export function Mermaid({ code }: { code: string }) {
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const render = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          fontFamily: "var(--font-sans)",
          themeVariables: {
            background: cssVar("--paper"),
            primaryColor: cssVar("--paper-2"),
            primaryTextColor: cssVar("--ink"),
            primaryBorderColor: cssVar("--ink"),
            secondaryColor: cssVar("--lab-soft"),
            tertiaryColor: cssVar("--paper-3"),
            lineColor: cssVar("--muted"),
            textColor: cssVar("--ink"),
            noteBkgColor: cssVar("--signal-soft"),
            noteTextColor: cssVar("--ink"),
            noteBorderColor: cssVar("--signal"),
            actorBkg: cssVar("--paper-2"),
            actorBorder: cssVar("--ink"),
            signalColor: cssVar("--ink"),
            signalTextColor: cssVar("--ink"),
          },
        });
        const out = await mermaid.render(id, code);
        if (alive) { setSvg(out.svg); setFailed(false); }
      } catch {
        if (alive) setFailed(true);
      }
    };
    void render();
    // Re-render with the new palette when the theme picker changes data-theme.
    const mo = new MutationObserver(() => void render());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { alive = false; mo.disconnect(); };
  }, [code, id]);

  if (!svg || failed) {
    return (
      <pre className="mermaid-src" aria-label={failed ? "Diagram source (rendering failed)" : "Diagram source"}>
        <code>{code}</code>
      </pre>
    );
  }
  return (
    <div className="mermaid-diagram" role="region" aria-label="Diagram" tabIndex={0} dangerouslySetInnerHTML={{ __html: svg }} />
  );
}
