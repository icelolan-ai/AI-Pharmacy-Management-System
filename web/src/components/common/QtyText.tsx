import { formatQty } from "@/lib/format/number";
import { cn } from "@/lib/utils";

/** Quantity with optional unit and a low-stock highlight. */
export function QtyText({
  value,
  unit,
  placeholder = "-",
  low = false,
  className,
}: {
  value: number | null | undefined;
  unit?: string;
  placeholder?: string;
  low?: boolean;
  className?: string;
}) {
  const text = formatQty(value, placeholder);
  return (
    <span className={cn("tabular-nums", low ? "font-medium text-amber-700" : undefined, className)}>
      {text}
      {unit && text !== placeholder ? <span className="ml-1 text-slate-500">{unit}</span> : null}
    </span>
  );
}
