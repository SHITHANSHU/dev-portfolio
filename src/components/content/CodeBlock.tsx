import { bundledLanguages, codeToHtml } from "shiki";
import { CopyButton } from "./CopyButton";

const labels: Record<string, string> = { sql: "SQL", json: "JSON", yaml: "YAML", bash: "Shell", sh: "Shell", ts: "TypeScript", typescript: "TypeScript", java: "Java", python: "Python", properties: "Properties", ini: "INI", text: "Text", sdp: "SDP", cpp: "C++", http: "HTTP" };

/** Server-side highlighted block with a language label, optional filename and copy control. */
export async function CodeBlock({ code, lang = "text", title }: { code: string; lang?: string; title?: string }) {
  const html = await codeToHtml(code.replace(/\n$/, ""), {
    lang: lang in bundledLanguages ? lang : "text",
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
  return (
    <figure className="bleed my-6">
      <figcaption className="flex items-center justify-between border border-rule bg-paper-2 px-3">
        <span className="meta py-1.5">{title ? `${title} · ` : ""}{labels[lang] ?? lang}</span>
        <CopyButton text={code} />
      </figcaption>
      <div className="code-wrap" tabIndex={0} role="region" aria-label={`${title ?? "Code"} (${labels[lang] ?? lang})`}>
        <div className="[&_pre]:font-mono [&_pre]:text-[0.8125rem] [&_pre]:leading-relaxed [&_pre]:overflow-x-auto [&_pre]:p-4 [&_pre]:bg-[var(--code-bg)] [&_pre]:border [&_pre]:border-t-0 [&_pre]:border-rule [&_pre]:m-0" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </figure>
  );
}
