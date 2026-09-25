"use client";

import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { AccessDenied } from "@/components/common/AccessDenied";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { ABILITIES, can } from "@/lib/abilities";
import { formatBytes, sniffFile, type SniffedFormat } from "@/lib/scan/sniff";

/** ถ่ายรูปใบส่งของ (งาน 6.2 — ส่วนแรก)
 *
 *  This first part only picks photos and shows them. Nothing is uploaded yet:
 *  its job right now is to find out what a real phone hands the browser,
 *  because whether the backend must convert HEIC depends on it (Chat A: do
 *  not write conversion code until it is known to be needed).
 *
 *  So every page shows three things side by side: the label the browser gave
 *  the file, what its first bytes say it really is, and its size. On an
 *  iPhone those can disagree, and the disagreement is the finding.
 *
 *  Two ways in, tested separately on purpose: "ถ่ายรูป" opens the camera
 *  directly, "เลือกจากคลังรูป" opens the photo library. An iPhone can behave
 *  differently for each.
 *
 *  Nothing here is on the path of receiving stock by hand. If this page is
 *  never opened, receiving works exactly as before.
 */

type Page = {
  id: number;
  file: File;
  /** Object URL for the preview; revoked when the page is removed. */
  previewUrl: string;
  /** What the first bytes say. null while still being read. */
  sniffed: SniffedFormat | null;
  /** Set when the browser could not draw the picture — itself a finding. */
  previewFailed: boolean;
  /** How the file arrived, so the test can tell camera from library. */
  source: "camera" | "library";
};

const FORMAT_LABEL: Record<SniffedFormat, string> = {
  jpeg: "JPEG",
  png: "PNG",
  webp: "WebP",
  heic: "HEIC",
  avif: "AVIF",
  pdf: "PDF",
  unknown: "ไม่รู้จัก",
};

let nextId = 1;

export default function ScanPage() {
  const { me } = useAuth();
  const allowed = can(me?.role, ABILITIES.receiveStock);
  const [pages, setPages] = useState<Page[]>([]);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  // Object URLs hold the file in memory until revoked. The ref mirrors the
  // current list so the unmount cleanup sees the latest pages, not the ones
  // from the first render.
  const pagesRef = useRef<Page[]>([]);
  useEffect(() => {
    pagesRef.current = pages;
  });
  useEffect(() => () => pagesRef.current.forEach((page) => URL.revokeObjectURL(page.previewUrl)), []);

  function addFiles(list: FileList | null, source: Page["source"]) {
    if (!list || list.length === 0) return;
    const added: Page[] = Array.from(list).map((file) => ({
      id: nextId++,
      file,
      previewUrl: URL.createObjectURL(file),
      sniffed: null,
      previewFailed: false,
      source,
    }));
    setPages((current) => [...current, ...added]);
    for (const page of added) {
      void sniffFile(page.file).then((sniffed) =>
        setPages((current) => current.map((p) => (p.id === page.id ? { ...p, sniffed } : p))),
      );
    }
  }

  function removePage(id: number) {
    setPages((current) => {
      const gone = current.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return current.filter((p) => p.id !== id);
    });
  }

  if (me && !allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="ถ่ายรูปใบส่งของ" />
        <AccessDenied />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="ถ่ายรูปใบส่งของ"
        description="ถ่ายทีละหน้า ใบที่มีหลายหน้าให้ถ่ายครบทุกหน้า"
      />

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => cameraInput.current?.click()}>
          📷 ถ่ายรูป
        </Button>
        <Button type="button" variant="outline" onClick={() => libraryInput.current?.click()}>
          🖼️ เลือกจากคลังรูป
        </Button>
        {/* Hidden inputs, reset after each pick so the same photo can be
            chosen twice in a row. */}
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files, "camera");
            event.target.value = "";
          }}
        />
        <input
          ref={libraryInput}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files, "library");
            event.target.value = "";
          }}
        />
      </div>

      <p className="text-sm text-slate-700">
        {pages.length === 0 ? "ยังไม่มีรูป" : `ถ่ายไปแล้ว ${pages.length} หน้า`}
      </p>

      {pages.length > 0 ? (
        <ol className="space-y-3">
          {pages.map((page, index) => (
            <li
              key={page.id}
              className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row"
            >
              <div className="flex h-40 w-full shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100 sm:w-32">
                {page.previewFailed ? (
                  <p className="px-2 text-center text-sm text-slate-600">แสดงตัวอย่างไม่ได้</p>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not a remote image
                  <img
                    src={page.previewUrl}
                    alt={`หน้า ${index + 1}`}
                    className="h-full w-full object-contain"
                    onError={() =>
                      setPages((current) =>
                        current.map((p) => (p.id === page.id ? { ...p, previewFailed: true } : p)),
                      )
                    }
                  />
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-semibold text-slate-900">หน้า {index + 1}</p>
                <p className="text-sm text-slate-700">ขนาด {formatBytes(page.file.size)}</p>

                {/* Temporary, for the HEIC test only — removed once the
                    finding is in. It is the one place on this screen that
                    shows technical words, on purpose. */}
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded bg-amber-50 p-2 text-sm text-slate-800">
                  <dt className="text-slate-600">ได้มาจาก</dt>
                  <dd>{page.source === "camera" ? "ถ่ายรูป" : "คลังรูป"}</dd>
                  <dt className="text-slate-600">เบราว์เซอร์บอกว่า</dt>
                  <dd className="break-all">{page.file.type || "(ไม่ได้บอก)"}</dd>
                  <dt className="text-slate-600">ไฟล์จริงเป็น</dt>
                  <dd>{page.sniffed === null ? "กำลังตรวจ…" : FORMAT_LABEL[page.sniffed]}</dd>
                  <dt className="text-slate-600">ชื่อไฟล์</dt>
                  <dd className="break-all">{page.file.name}</dd>
                  <dt className="text-slate-600">ขนาดจริง</dt>
                  <dd>{page.file.size.toLocaleString("th-TH")} ไบต์</dd>
                </dl>
              </div>

              <div className="sm:self-center">
                <Button type="button" variant="outline" onClick={() => removePage(page.id)}>
                  ลบหน้านี้
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <p className="text-sm text-slate-600">
        ตอนนี้ยังไม่ส่งรูปขึ้นระบบ หน้านี้ใช้ทดสอบว่ามือถือส่งรูปแบบไหนมา
      </p>
    </div>
  );
}
