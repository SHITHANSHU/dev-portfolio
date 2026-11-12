import type { NextConfig } from "next";

// Static export keeps the site hosting-neutral (GitHub Pages, Cloudflare Pages, Vercel, any CDN).
// Set NEXT_PUBLIC_BASE_PATH for project-page hosting, e.g. "/engineering-journal".
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default config;
