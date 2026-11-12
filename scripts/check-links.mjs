// Verifies every internal href/src in the static export resolves to a file. Run after `next build`.
import fs from "node:fs";
import path from "node:path";

const out = path.resolve("out");
if (!fs.existsSync(out)) { console.error("out/ missing: run `npm run build` first"); process.exit(2); }
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : p.endsWith(".html") && files.push(p); } })(out);

const exists = (url) => {
  let p = url.split("#")[0].split("?")[0];
  if (base && p.startsWith(base)) p = p.slice(base.length);
  if (!p.startsWith("/")) return true;
  const f = path.join(out, p);
  return fs.existsSync(f) && (fs.statSync(f).isFile() || fs.existsSync(path.join(f, "index.html")));
};
let bad = 0, checked = 0;
for (const f of files) {
  const html = fs.readFileSync(f, "utf8");
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#][^"]*|\/)"/g)) {
    checked++;
    if (!exists(m[1])) { bad++; console.error(`BROKEN ${m[1]}  (in ${path.relative(out, f)})`); }
  }
  // in-page anchors
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/href="#([^"]+)"/g)) { checked++; if (!ids.has(m[1])) { bad++; console.error(`BROKEN anchor #${m[1]} (in ${path.relative(out, f)})`); } }
}
console.log(`${files.length} pages, ${checked} links checked, ${bad} broken`);
process.exit(bad ? 1 : 0);
