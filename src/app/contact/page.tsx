import type { Metadata } from "next";
import { absoluteUrl, site } from "@/lib/site";

export const metadata: Metadata = { title: "Contact", description: "How to reach Shithanshu Mishra.", alternates: { canonical: absoluteUrl("/contact/") } };

export default function Page() {
  return (
    <div className="wrap pt-14 pb-8">
      <p className="section-no">§ Contact</p>
      <h1 className="mt-3 font-serif text-5xl md:text-6xl font-medium tracking-tight leading-[1.02] max-w-3xl">Corrections, questions, and interesting problems.</h1>
      <p className="mt-6 max-w-xl text-ink-2">If an article has a technical error, say so — I would rather fix it publicly. Email is the most reliable channel.</p>
      <dl className="mt-12 max-w-xl divide-y divide-rule border-y border-rule font-sans">
        <div className="flex justify-between gap-4 py-4"><dt className="meta pt-1">Email</dt><dd><a className="link" href={`mailto:${site.email}`}>{site.email}</a></dd></div>
        <div className="flex justify-between gap-4 py-4"><dt className="meta pt-1">LinkedIn</dt><dd><a className="link" rel="me noopener" href={site.linkedin}>linkedin.com/in/shithanshu-mishra</a></dd></div>
        <div className="flex justify-between gap-4 py-4"><dt className="meta pt-1">Based in</dt><dd>{site.location}</dd></div>
      </dl>
    </div>
  );
}
