import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { CodeBlock } from "./CodeBlock";
import { Callout, Details, Figure, Metric, PhotoSlot, TableWrap } from "./blocks";
import { FlowDiagram } from "@/components/diagrams/FlowDiagram";
import { Mermaid } from "@/components/diagrams/Mermaid";
import { SequenceDiagram } from "@/components/diagrams/SequenceDiagram";
import { labComponents } from "@/components/lab/registry";

type CodeChild = ReactElement<{ className?: string; children?: ReactNode; title?: string }>;

/** `pre` → highlighted CodeBlock. Fence meta `title="x"` is not available in RSC, so use a leading `// title: x` comment line instead. */
function Pre({ children }: ComponentProps<"pre">) {
  const child = children as CodeChild;
  const raw = typeof child?.props?.children === "string" ? child.props.children : "";
  const lang = /language-(\w+)/.exec(child?.props?.className ?? "")?.[1] ?? "text";
  if (lang === "mermaid") return <Mermaid code={raw} />;
  const m = /^(?:\/\/|#|--)\s*title:\s*(.+)\n/.exec(raw);
  return <CodeBlock code={m ? raw.slice(m[0].length) : raw} lang={lang} title={m?.[1]} />;
}

/** Root-relative images need the deploy basePath (GitHub Pages project hosting). */
function Img({ src, alt, ...rest }: ComponentProps<"img">) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const href = typeof src === "string" && src.startsWith("/") ? `${base}${src}` : src;
  // eslint-disable-next-line @next/next/no-img-element -- static export, images are unoptimized SVG/photos
  return <img src={href} alt={alt ?? ""} loading="lazy" decoding="async" {...rest} />;
}

/** The explicit, typed registry of everything an article may render. Adding a lab = add it to labComponents. */
const components = {
  pre: Pre,
  img: Img,
  table: ({ children }: ComponentProps<"table">) => <TableWrap><table>{children}</table></TableWrap>,
  Callout, Figure, Details, Metric, PhotoSlot, FlowDiagram, SequenceDiagram,
  ...labComponents,
};

export function Mdx({ source }: { source: string }) {
  return (
    <MDXRemote
      source={source}
      components={components}
      // Content is local and trusted; blockJS would strip the array/object props the diagram components need.
      options={{ blockJS: false, mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug] } }}
    />
  );
}
