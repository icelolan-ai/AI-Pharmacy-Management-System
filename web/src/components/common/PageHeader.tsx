"use client";

import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { routeFor } from "@/lib/nav/routes";

/** A page's heading, what it is for, and its buttons.
 *
 *  On a phone (D78):
 *  - a heading that only repeats the top bar is hidden (screen readers still
 *    get it); one that says more — a medicine's name — stays;
 *  - on those same pages the line under the heading only explains the page,
 *    and is hidden too (round 3 จ). Hiding it rather than cutting it to one
 *    line: a cut sentence is the cut label D44 forbids. A page whose line is
 *    data, not explanation (the dashboard's "updated at"), says so with
 *    keepDescriptionOnPhone; a detail page's line is always kept;
 *  - the page's main "new …" button is full width under the heading, with
 *    a + and its words (round 3 ง: one rule on every page).
 */
export function PageHeader({
  title,
  description,
  keepDescriptionOnPhone = false,
  action,
  primaryAction,
}: {
  title: string;
  description?: string;
  keepDescriptionOnPhone?: boolean;
  action?: React.ReactNode;
  primaryAction?: { label: string; onClick: () => void };
}) {
  // A page of its own (not one drug, one bill): the top bar already names
  // it, even where the heading words it a little differently ("ยาใกล้หมดอายุ"
  // under "ใกล้หมดอายุ"). A detail page's heading names the thing itself.
  const route = routeFor(usePathname());
  const repeatsTopBar = route !== null && (route.title === title || !route.pattern.includes("["));
  const hideDescription = repeatsTopBar && !keepDescriptionOnPhone;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className={repeatsTopBar ? "sr-only text-xl font-semibold text-slate-900 sm:not-sr-only" : "text-xl font-semibold text-slate-900"}>
          {title}
        </h1>
        {description ? (
          <p className={hideDescription ? "hidden text-sm text-slate-600 sm:block" : "text-sm text-slate-600"}>{description}</p>
        ) : null}
      </div>
      {/* D47-4: shrink-0 held the action row at its full width on a phone,
          so a long label like "พิมพ์ใบรับสินค้า R-690917-001" pushed past
          the edge of the screen. It gives way below sm and holds its
          width from sm up, where there is room. */}
      {action ? <div className="min-w-0 max-w-full sm:shrink-0">{action}</div> : null}
      {primaryAction ? (
        <div className="w-full sm:w-auto sm:shrink-0">
          <Button onClick={primaryAction.onClick} className="primary-action sm:w-auto">
            <Plus aria-hidden="true" className="size-5 sm:hidden" strokeWidth={2.5} />
            {primaryAction.label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
