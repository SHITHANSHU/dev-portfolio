"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

/** Below this scroll offset the header always shows. */
const SHOW_NEAR_TOP_PX = 80;
/** Mouse within this distance of the viewport top reveals the header. */
const REVEAL_ZONE_PX = 72;

/**
 * Hide the header once the reader scrolls down; bring it back when the mouse moves to the top edge.
 * Touch screens have no mouse, so there it returns on scroll up. Keyboard focus reveals it via CSS.
 */
function useAutoHide(): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const touch = window.matchMedia?.("(hover: none)").matches ?? false;
    let lastY = window.scrollY;
    let mouseNearTop = false;
    const update = (scrollingUp = false) => {
      const y = window.scrollY;
      if (y < SHOW_NEAR_TOP_PX || mouseNearTop) setHidden(false);
      else setHidden(touch ? !scrollingUp : true);
    };
    const onScroll = () => {
      const y = window.scrollY;
      update(y < lastY);
      lastY = y;
    };
    const onMouseMove = (e: MouseEvent) => {
      const near = e.clientY <= REVEAL_ZONE_PX;
      if (near !== mouseNearTop) { mouseNearTop = near; update(); }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("mousemove", onMouseMove); };
  }, []);
  return hidden;
}

const nav = [
  { href: "/journal/", label: "Journal" },
  { href: "/projects/", label: "Projects" },
  { href: "/about/", label: "About" },
  { href: "/contact/", label: "Contact" },
];

export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const hidden = useAutoHide() && !open;
  const active = (href: string) => path.startsWith(href);
  return (
    <header
      data-hidden={hidden || undefined}
      className={`sticky top-0 z-40 border-b border-rule bg-paper/95 backdrop-blur-none no-print transition-transform duration-200 ${hidden ? "-translate-y-full" : ""} focus-within:translate-y-0`}
    >
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
