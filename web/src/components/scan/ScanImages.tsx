"use client";

import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ScanPage } from "@/lib/api/invoice-scans";

/** The original photo, always on top of the review page (Chat A 6.4):
 *  a person checks every field against the paper.
 *
 *  Pages sit side by side and swipe with a finger. A tap opens the page full
 *  screen, where two fingers zoom (or the + and − buttons, for anyone who
 *  cannot pinch) and one finger moves around the enlarged page. Every button
 *  is 44px and says what it does in words (D34).
 */
export function ScanImages({ pages }: { pages: ScanPage[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (pages.length === 0) return <p className="text-sm text-slate-700">ใบนี้ยังไม่มีรูป</p>;
  return (
    <>
      <div className="scan-strip flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2" aria-label="รูปใบส่งของ">
        {pages.map((page, index) => (
          <button
            key={page.page_no}
            type="button"
            className="relative w-full shrink-0 snap-center overflow-hidden rounded-lg border border-slate-300 bg-slate-100 sm:w-80"
            onClick={() => setOpen(index)}
            aria-label={`เปิดรูปหน้า ${page.page_no} เต็มจอ`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link, not a static asset */}
            <img src={page.image_url} alt={`ใบส่งของ หน้า ${page.page_no}`} className="max-h-[60vh] w-full object-contain" />
            <span className="absolute bottom-2 left-2 rounded bg-slate-900/80 px-2 py-1 text-sm text-white">
              หน้า {page.page_no}/{pages.length} · แตะเพื่อขยาย
            </span>
          </button>
        ))}
      </div>
      {open !== null ? <Viewer pages={pages} start={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

function Viewer({ pages, start, onClose }: { pages: ScanPage[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const [zoom, setZoom] = useState(1);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const page = pages[index];

  const clamp = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  const distance = (touches: React.TouchList) =>
    Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

  function go(step: number) {
    setIndex((current) => Math.min(pages.length - 1, Math.max(0, current + step)));
    setZoom(1);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950" role="dialog" aria-modal="true"
         aria-label={`รูปหน้า ${page.page_no} จาก ${pages.length}`}>
      <div className="flex flex-wrap items-center gap-2 p-2 text-white">
        <Button type="button" variant="secondary" className="min-h-11 px-3" onClick={onClose}>
          <X className="size-5" aria-hidden /> ปิด
        </Button>
        <span className="text-base">หน้า {page.page_no}/{pages.length}</span>
        <span className="ml-auto flex gap-2">
          <Button type="button" variant="secondary" className="min-h-11 px-3" onClick={() => setZoom((z) => clamp(z - 0.5))}
                  disabled={zoom <= MIN_ZOOM}>
            <ZoomOut className="size-5" aria-hidden /> ย่อ
          </Button>
          <Button type="button" variant="secondary" className="min-h-11 px-3" onClick={() => setZoom((z) => clamp(z + 0.5))}
                  disabled={zoom >= MAX_ZOOM}>
            <ZoomIn className="size-5" aria-hidden /> ขยาย
          </Button>
        </span>
      </div>
      <div
        className="flex-1 overflow-auto"
        style={{ touchAction: "pan-x pan-y" }}
        onTouchStart={(event) => {
          if (event.touches.length === 2) pinch.current = { distance: distance(event.touches), zoom };
        }}
        onTouchMove={(event) => {
          if (event.touches.length === 2 && pinch.current) {
            setZoom(clamp(pinch.current.zoom * (distance(event.touches) / pinch.current.distance)));
          }
        }}
        onTouchEnd={() => {
          pinch.current = null;
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link */}
        <img src={page.image_url} alt={`ใบส่งของ หน้า ${page.page_no}`} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} />
      </div>
      {pages.length > 1 ? (
        <div className="flex justify-between gap-2 p-2">
          <Button type="button" variant="secondary" className="min-h-11 px-3" onClick={() => go(-1)} disabled={index === 0}>
            <ChevronLeft className="size-5" aria-hidden /> หน้าก่อน
          </Button>
          <Button type="button" variant="secondary" className="min-h-11 px-3" onClick={() => go(1)}
                  disabled={index === pages.length - 1}>
            หน้าถัดไป <ChevronRight className="size-5" aria-hidden />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
