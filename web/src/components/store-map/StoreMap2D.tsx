import {
  SHAPE_KIND_FILL,
  type MapPoint,
  type MapShape,
  type StoreMap,
} from "@/lib/api/store-map";

/** ผังร้านมุมสูง 2D (U-8.3) — อ่านอย่างเดียว
 *
 *  D45 decides the structure, and it is not a detail: not one word goes
 *  inside the <svg>. The drawing holds the room and the things in it as
 *  rectangles, and nothing else.
 *
 *  The markers are HTML on a layer above the drawing, placed by percentage.
 *  Because the drawing keeps its aspect ratio, a percentage lands on exactly
 *  the same spot at any width — no measuring, no resize handler, and the code
 *  on each marker stays the size it was set to instead of shrinking with the
 *  room. On a phone that is the difference between a readable marker and a
 *  6px one.
 *
 *  D34: colour is decoration. Every shape and every marker is named in words
 *  in the tables beside this, which are the real content — the map is the
 *  help, not the other way round.
 *
 *  D46: a thousand markers cannot each be finger-sized on a 375px screen.
 *  With the room 5377mm across, one 44px target covers 690mm of floor, so the
 *  whole room holds about 65 of them. This view is read-only and does not
 *  pretend otherwise: the table below is how a point is looked up, and
 *  picking a point by touch waits for zoom and pan in U-8.4.
 */
export function StoreMap2D({
  map,
  shapes,
  points,
}: {
  map: StoreMap;
  shapes: readonly MapShape[];
  points: readonly MapPoint[];
}) {
  return (
    <div className="relative w-full max-w-3xl">
      <svg
        viewBox={`0 0 ${map.width_mm} ${map.height_mm}`}
        className="block w-full rounded-md bg-slate-50"
        role="img"
        aria-label={`ผัง${map.name} กว้าง ${map.width_mm} มิลลิเมตร ลึก ${map.height_mm} มิลลิเมตร มี ${shapes.length} ชิ้น และ ${points.length} จุด`}
      >
        {/* The room itself. Strokes are non-scaling so a wall stays one line
            wide whether the drawing is 343px or 768px across. */}
        <rect
          x={0}
          y={0}
          width={map.width_mm}
          height={map.height_mm}
          fill="none"
          stroke="#475569"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {shapes.map((shape) => (
          <rect
            key={shape.id}
            x={shape.x_mm}
            y={shape.y_mm}
            width={shape.width_mm}
            height={shape.height_mm}
            transform={
              shape.rotation_deg === 0
                ? undefined
                : `rotate(${shape.rotation_deg} ${shape.x_mm + shape.width_mm / 2} ${shape.y_mm + shape.height_mm / 2})`
            }
            fill={SHAPE_KIND_FILL[shape.kind]}
            stroke="#64748b"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* The markers. HTML, so the code on them is text at a size that does
          not move with the drawing (D45). aria-hidden because every one of
          them is a row in the table below, and a screen reader should read
          that table rather than a scatter of codes. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {points.map((point) => (
          <span
            key={point.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-slate-900 px-1.5 py-0.5 text-xs font-medium text-white"
            style={{
              left: `${(point.x_mm / map.width_mm) * 100}%`,
              top: `${(point.y_mm / map.height_mm) * 100}%`,
            }}
          >
            {point.code}
          </span>
        ))}
      </div>
    </div>
  );
}
