"use client";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { StoreMap2D } from "@/components/store-map/StoreMap2D";
import { Skeleton } from "@/components/ui/skeleton";
import { getStoreMap, SHAPE_KIND_FILL, SHAPE_KIND_LABEL } from "@/lib/api/store-map";
import { useSection } from "@/lib/use-section";

/** ผังร้าน (U-8.3) — อ่านอย่างเดียว
 *
 *  Every signed-in role may open this: a cashier has to be able to find where
 *  a medicine sits. Only the owner may change it, and changing it is not
 *  built yet (U-8.4).
 *
 *  Chat A's rule for this feature, and the reason the tables come before the
 *  drawing on a phone: the list is the real thing and the map is the help.
 *  A person must be able to finish the job without touching the drawing once.
 *
 *  Nothing here is on the path of scanning, receiving or selling. If this
 *  page fails to load, none of those screens notice.
 */
export default function StoreMapPage() {
  const view = useSection((signal) => getStoreMap({ signal }), {
    errorMessage: "โหลดผังร้านไม่สำเร็จ",
  });

  const map = view.data?.map ?? null;
  const shapes = view.data?.shapes ?? [];
  const points = view.data?.points ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="ผังร้าน"
        description="ดูว่ายาแต่ละจุดอยู่ตรงไหนในร้าน — เป็นตัวช่วย ไม่จำเป็นต้องใช้ก็ทำงานได้ตามปกติ"
      />

      {view.error ? (
        <ErrorState message={view.error} onRetry={view.reload} retrying={view.loading} />
      ) : view.loading && view.data === null ? (
        <Skeleton className="h-64 w-full" />
      ) : map === null ? (
        // Never draw an empty room: an outline with nothing in it looks like a
        // map that failed to load rather than one that was never drawn.
        <EmptyState
          title="ยังไม่มีผังร้านในระบบ"
          description="เมื่อเจ้าของร้านวาดผังแล้ว ผังและรายชื่อจุดจะขึ้นที่นี่ · ระหว่างนี้ทุกหน้ายังใช้งานได้ตามปกติ พิมพ์ชื่อยาหรือยิงบาร์โค้ดได้เหมือนเดิม"
        />
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">
              {map.name} — กว้าง {map.width_mm} มม. · ลึก {map.height_mm} มม.
            </h2>
            <StoreMap2D map={map} shapes={shapes} points={points} />
            <p className="max-w-3xl text-sm text-slate-600">
              จุดบนผังเขียนไว้เป็นรหัสสั้น ๆ · ชื่อเต็มของทุกจุดอยู่ในตารางด้านล่าง
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">
              จุดทั้งหมด ({points.length} จุด)
            </h2>
            {points.length === 0 ? (
              <p className="text-sm text-slate-600">ผังนี้ยังไม่มีจุดที่ทำเครื่องหมายไว้</p>
            ) : (
              <table className="w-full max-w-3xl text-sm">
                <caption className="sr-only">รายชื่อจุดทั้งหมดในผังร้าน</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th scope="col" className="py-1 font-medium">
                      รหัส
                    </th>
                    <th scope="col" className="py-1 font-medium">
                      ชื่อจุด
                    </th>
                    <th scope="col" className="py-1 font-medium">
                      รายละเอียด
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      ยาที่จุดนี้
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((point) => (
                    <tr key={point.id} className="border-b border-slate-100">
                      <th scope="row" className="py-2 pr-2 text-left font-medium text-slate-900">
                        {point.code}
                      </th>
                      <td className="py-2 pr-2 text-slate-800">{point.name}</td>
                      <td className="py-2 pr-2 text-slate-600">{point.detail ?? "-"}</td>
                      <td className="py-2 text-right tabular-nums">
                        {point.medicine_count} รายการ
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">
              ของในร้าน ({shapes.length} ชิ้น)
            </h2>
            {shapes.length === 0 ? (
              <p className="text-sm text-slate-600">ผังนี้ยังไม่มีชั้นวางหรือของอื่นในห้อง</p>
            ) : (
              <ul className="max-w-3xl space-y-1">
                {shapes.map((shape) => (
                  <li key={shape.id} className="flex flex-wrap items-center gap-2 text-sm">
                    {/* The swatch is decoration; the two names beside it are
                        what tells one shape from another (D34). */}
                    <span
                      aria-hidden="true"
                      className="inline-block h-3 w-3 shrink-0 rounded-sm border border-slate-300"
                      style={{ backgroundColor: SHAPE_KIND_FILL[shape.kind] }}
                    />
                    <span className="font-medium text-slate-900">{shape.label}</span>
                    <span className="text-slate-600">{SHAPE_KIND_LABEL[shape.kind]}</span>
                    <span className="text-slate-500">
                      {shape.width_mm} × {shape.height_mm} มม.
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
