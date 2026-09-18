import { formatMoney } from "@/lib/format/money";

/** Renders a money string from the API. Never does arithmetic itself. */
export function MoneyText({
  value,
  placeholder = "-",
  withUnit = false,
  className,
}: {
  value: string | null | undefined;
  placeholder?: string;
  withUnit?: boolean;
  className?: string;
}) {
  const text = formatMoney(value, placeholder);
  const showUnit = withUnit && text !== placeholder;
  return (
    <span className={className}>
      <span className="tabular-nums">{text}</span>
      {showUnit ? <span className="ml-1 text-slate-500">บาท</span> : null}
    </span>
  );
}
