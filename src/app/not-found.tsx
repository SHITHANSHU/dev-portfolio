import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap pt-24 pb-12">
      <p className="section-no">404</p>
      <h1 className="mt-3 font-serif text-5xl tracking-tight max-w-2xl">This page isn’t in the index.</h1>
      <p className="mt-4 max-w-lg text-ink-2">The link may be stale, or the article was renamed. Try the <Link className="link" href="/journal/">journal</Link>, the <Link className="link" href="/projects/">projects</Link>, or <Link className="link" href="/search/">search</Link>.</p>
    </div>
  );
}
