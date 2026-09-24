export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
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
