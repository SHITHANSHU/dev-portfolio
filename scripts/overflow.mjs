// Reports elements wider than the viewport at 390px. Usage: node scripts/overflow.mjs <url>...
import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
for (const url of process.argv.slice(2)) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(url, { waitUntil: "networkidle" });
  const r = await p.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const bad = [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > W + 1 && !e.closest("[class*=overflow-x],.table-scroll,.code-wrap,pre")).slice(0, 6).map((e) => `${e.tagName}.${String(e.className).slice(0, 50)} w=${Math.round(e.getBoundingClientRect().width)}`);
    return { scrollW: document.documentElement.scrollWidth, W, bad };
  });
  console.log(url, JSON.stringify(r));
}
await b.close();
