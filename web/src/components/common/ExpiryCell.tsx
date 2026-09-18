import { describeExpiry } from "@/lib/format/expiry";
import { cn } from "@/lib/utils";

/** The only way an expiry goes on screen (D19 rule 6).
 *  `apiDaysRemaining` is the raw value from the API; all arithmetic and wording
 *  live in lib/format/expiry.ts, never here. Colour is never the only signal:
 *  every state carries an icon and words too (rule 9). */
export function ExpiryCell({
  expiryDate,
  apiDaysRemaining,
  className,
}: {
  expiryDate: string;
  apiDaysRemaining?: number;
  className?: string;
}) {
  const expiry = describeExpiry(expiryDate, apiDaysRemaining);
  return (
    <div className={cn("leading-tight", className)}>
      <p className={cn("text-sm font-medium", expiry.className)}>
        <span aria-hidden="true">{expiry.icon}</span> {expiry.headline}
      </p>
      <p className="text-xs text-slate-500">{expiry.detail}</p>
    </div>
  );
}
