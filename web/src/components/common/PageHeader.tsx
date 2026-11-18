"use client";

import { usePathname } from "next/navigation";

import { routeFor } from "@/lib/nav/routes";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  // D78: on a phone the top bar already says the page's name. A heading that
  // only repeats it is hidden there (screen readers still get it); one that
  // says something more — a medicine's name on its own page — stays.
  const repeatsTopBar = routeFor(usePathname())?.title === title;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className={repeatsTopBar ? "sr-only text-xl font-semibold text-slate-900 sm:not-sr-only" : "text-xl font-semibold text-slate-900"}>
          {title}
        </h1>
        {description ? <p className="text-sm text-slate-600">{description}</p> : null}
      </div>
      {/* D47-4: shrink-0 held the action row at its full width on a phone,
          so a long label like "พิมพ์ใบรับสินค้า R-690917-001" pushed past
          the edge of the screen. It gives way below sm and holds its
          width from sm up, where there is room. */}
      {action ? <div className="min-w-0 max-w-full sm:shrink-0">{action}</div> : null}
    </div>
  );
}
