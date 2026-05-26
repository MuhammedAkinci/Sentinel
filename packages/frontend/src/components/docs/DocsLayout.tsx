"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Logo } from "~/components/shared/Logo";

export interface DocsSection {
  id: string;
  title: string;
  /** Optional sub-anchors rendered as a nested list. */
  children?: ReadonlyArray<{ id: string; title: string }>;
}

interface DocsLayoutProps {
  sections: ReadonlyArray<DocsSection>;
  children: React.ReactNode;
}

/**
 * Two-column docs shell: sticky sidebar table-of-contents on the left,
 * long-form content on the right. The TOC tracks the most recently
 * scrolled-past heading via IntersectionObserver so the brand-green
 * highlight always matches what the reader is looking at.
 */
export function DocsLayout({ sections, children }: DocsLayoutProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const allIds: string[] = [];
    for (const section of sections) {
      allIds.push(section.id);
      if (section.children) for (const c of section.children) allIds.push(c.id);
    }
    const targets: HTMLElement[] = [];
    for (const id of allIds) {
      const el = document.getElementById(id);
      if (el) targets.push(el);
    }
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry whose top edge crossed the viewport-top band
        // most recently. We bias toward entries above the viewport
        // center so the highlight tracks reading position, not the
        // last one off-screen.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: [0, 1] },
    );

    for (const t of targets) observer.observe(t);
    return () => observer.disconnect();
  }, [sections]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-6 py-4 sm:px-10">
          <Link href="/" className="flex items-center gap-3" aria-label="Sentinel home">
            <Logo size={26} />
            <span className="text-sm font-medium tracking-tight">Sentinel</span>
          </Link>
          <span className="font-mono text-xs uppercase tracking-[0.32em] text-muted-foreground">
            Documentation
          </span>
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-2 border border-primary/60 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-background"
          >
            Open Dashboard
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl gap-12 px-6 py-12 sm:px-10 lg:py-16">
        <aside className="sticky top-24 hidden h-[calc(100vh-8rem)] w-56 shrink-0 self-start overflow-y-auto lg:block">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.32em] text-muted-foreground">
            On this page
          </p>
          <ul className="space-y-1 text-sm">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className={`block border-l-2 py-1.5 pl-3 transition-colors ${
                    activeId === section.id
                      ? "border-primary text-primary"
                      : "border-border text-foreground/70 hover:border-foreground/40 hover:text-foreground"
                  }`}
                >
                  {section.title}
                </a>
                {section.children ? (
                  <ul className="ml-3 mt-1 space-y-1 border-l border-border">
                    {section.children.map((child) => (
                      <li key={child.id}>
                        <a
                          href={`#${child.id}`}
                          className={`block py-1 pl-3 text-[12px] transition-colors ${
                            activeId === child.id
                              ? "text-primary"
                              : "text-foreground/60 hover:text-foreground"
                          }`}
                        >
                          {child.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

/**
 * Major section heading with a brand-colored kicker. The kicker keeps
 * the page scannable even when section bodies grow long.
 */
export function DocsSectionHeading({
  id,
  kicker,
  title,
  description,
}: {
  id: string;
  kicker: string;
  title: string;
  description?: string;
}) {
  return (
    <header id={id} className="scroll-mt-24">
      <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-primary">{kicker}</p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {description ? (
        <p className="mt-3 max-w-2xl text-foreground/70">{description}</p>
      ) : null}
    </header>
  );
}

export function DocsSubheading({ id, title }: { id: string; title: string }) {
  return (
    <h3 id={id} className="scroll-mt-24 mt-10 text-lg font-semibold tracking-tight">
      {title}
    </h3>
  );
}

export function DocsParagraph({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 leading-relaxed text-foreground/80">{children}</p>;
}

export function DocsCallout({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "primary" | "warn" }) {
  const palette =
    tone === "primary"
      ? "border-primary/40 bg-primary/[0.06] text-foreground/90"
      : tone === "warn"
        ? "border-danger/40 bg-danger/[0.06] text-foreground/90"
        : "border-border bg-muted/40 text-foreground/85";
  return (
    <div className={`mt-5 border-l-2 ${palette} px-4 py-3 text-sm leading-relaxed`}>
      {children}
    </div>
  );
}
