"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

const nav = [
  { href: "/journal/", label: "Journal" },
  { href: "/projects/", label: "Projects" },
  { href: "/about/", label: "About" },
  { href: "/contact/", label: "Contact" },
];

export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => path.startsWith(href);
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/95 backdrop-blur-none no-print">
      <div className="wrap flex h-14 items-center justify-between">
        <Link href="/" className="flex items-baseline gap-2" onClick={() => setOpen(false)}>
          <span className="font-serif text-lg font-semibold tracking-tight">S. Mishra</span>
          <span className="meta hidden sm:inline">Engineering notes</span>
        </Link>
        <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 md:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? "page" : undefined}
              className={`meta min-h-11 px-3 inline-flex items-center border-b-2 ${active(n.href) ? "border-signal text-ink" : "border-transparent hover:text-ink"}`}
            >
              {n.label}
            </Link>
          ))}
          <Link href="/search/" className="meta min-h-11 px-3 inline-flex items-center hover:text-ink">Search</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-2">
          <ThemeToggle />
          <button
            type="button"
            className="meta md:hidden min-h-11 px-2"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Primary" className="md:hidden border-t border-rule bg-paper">
          <ul className="wrap py-2">
            {[...nav, { href: "/search/", label: "Search" }].map((n) => (
              <li key={n.href} className="border-b border-rule last:border-0">
                <Link href={n.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center font-serif text-xl">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
