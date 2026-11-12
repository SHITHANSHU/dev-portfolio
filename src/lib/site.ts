/** Deployment-specific values. Override via env at build time; never hardcode a domain. */
export const site = {
  name: "Shithanshu Mishra",
  title: "Shithanshu Mishra — Engineering Notes",
  tagline: "Backend, streaming and video systems, written down.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://your-domain.example").replace(/\/$/, ""),
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  email: "shithanshu@hotmail.com",
  linkedin: "https://www.linkedin.com/in/shithanshu-mishra",
  location: "Bengaluru, India",
} as const;

export const absoluteUrl = (path: string): string => `${site.url}${site.basePath}${path}`;
