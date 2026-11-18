"use client";

import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { AccessDenied } from "@/components/common/AccessDenied";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { ABILITIES, can } from "@/lib/abilities";
import { ApiError } from "@/lib/api/client";
import { createScan, deleteScanPage, uploadScanPage, type Scan } from "@/lib/api/invoice-scans";
import { prepareForUpload } from "@/lib/scan/device-resize";
import { formatBytes, sniffFile, type SniffedFormat } from "@/lib/scan/sniff";

/** ถ่ายรูปใบส่งของ (งาน 6.2)
 *
 *  Each photo is sent as soon as it is taken, one at a time and in the order
 *  taken, so the pages keep their order. Every page shows where it is:
 *  checking, waiting, sending (with how far along), sent, or not sent — and a
 *  page that failed can be sent again or deleted on its own.
 *
 *  What a file is gets read from its first bytes (D69). A HEIC or PDF is not
 *  sent at all: the backend would refuse it, and on a phone connection there
 *  is no point pushing megabytes up to hear no. The message says what to do
 *  instead — the "ถ่ายรูป" button always gives a JPEG (tested on a real
 *  iPhone). The backend checks again regardless; this only saves the wait.
 *
 *  The scan itself is created with the first photo, not on opening the page,
 *  so looking at this screen leaves nothing behind.
 *
 *  D75: before sending, a large photo is shrunk on the phone to the
 *  backend's own evidence-copy size (lib/scan/device-resize.ts), so far
 *  fewer bytes cross the network; if that cannot be done safely the
 *  original goes, and the backend shrinks it as before.
 *
 *  🔧 Temporary, for measuring D75 (D72) — removed once the numbers are
 *  reported: each sent page shows its bytes and timings, and adding
 *  ?resize=off to the address turns phone shrinking off, so the same photo
 *  can be timed both ways on the same connection.
 *
 *  Nothing here is on the path of receiving stock by hand.
 */

/** 🔧 Temporary (D75 measurement). */
type Measure = {
  originalBytes: number;
  sentBytes: number;
  note: string;
  shrinkMs: number;
  sendMs: number;
  serverMs: number;
};

type Status =
  | { kind: "checking" }
  | { kind: "refused"; message: string }
  | { kind: "queued" }
  | { kind: "shrinking" }
  | { kind: "sending"; progress: number }
  | { kind: "failed"; message: string }
  | { kind: "sent"; pageNo: number; measure: Measure }
  | { kind: "deleting"; pageNo: number; measure: Measure };

type Page = {
  id: number;
  file: File;
  /** Object URL for the preview; revoked when the page is removed. */
  previewUrl: string;
  previewFailed: boolean;
  status: Status;
};

const SENDABLE: readonly SniffedFormat[] = ["jpeg", "png", "webp"];

/** The same words the backend uses for the same refusals, so a person sees
 *  one message whichever side caught it. */
const REFUSAL: Partial<Record<SniffedFormat, string>> = {
  heic: "รูปนี้เป็นรูปแบบที่ยังเปิดไม่ได้ ลองกดถ่ายรูปแทนการเลือกจากคลังรูป",
  pdf: "ไฟล์ PDF ยังใช้ไม่ได้ ให้กดถ่ายรูปใบส่งของแทน",
};
const REFUSAL_OTHER = "ไฟล์นี้ไม่ใช่รูปที่ระบบเปิดได้ ลองกดถ่ายรูปแทน";

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : "ส่งรูปไม่สำเร็จ ลองใหม่อีกครั้ง";
}

let nextId = 1;

export default function ScanPage() {
  const { me } = useAuth();
  const allowed = can(me?.role, ABILITIES.receiveStock);
  const [pages, setPages] = useState<Page[]>([]);
  const [scanId, setScanId] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  // Several photos picked at once must still make one scan, not several.
  const scanPromise = useRef<Promise<Scan> | null>(null);

  function update(id: number, status: Status) {
    setPages((current) => current.map((p) => (p.id === id ? { ...p, status } : p)));
  }

  // Object URLs hold the file in memory until revoked. The ref mirrors the
  // current list so the unmount cleanup sees the latest pages.
  const pagesRef = useRef<Page[]>([]);
  useEffect(() => {
    pagesRef.current = pages;
  });
  useEffect(() => () => pagesRef.current.forEach((page) => URL.revokeObjectURL(page.previewUrl)), []);

  function ensureScan(): Promise<Scan> {
    if (!scanPromise.current) {
      scanPromise.current = createScan().then(
        (scan) => {
          setScanId(scan.id);
          return scan;
        },
        (error) => {
          scanPromise.current = null; // let the next try create it again
          throw error;
        },
      );
    }
    return scanPromise.current;
  }

  // One upload at a time, oldest first: the backend numbers pages in the
  // order they arrive. The queue lives in a ref and is worked from events
  // (a photo picked, "ส่งใหม่" pressed), never from a render.
  const queue = useRef<{ id: number; file: File }[]>([]);
  const running = useRef(false);

  function enqueue(id: number, file: File) {
    update(id, { kind: "queued" });
    queue.current.push({ id, file });
    void pump();
  }

  async function pump() {
    if (running.current) return;
    running.current = true;
    try {
      for (let item = queue.current.shift(); item; item = queue.current.shift()) {
        const { id, file } = item;
        try {
          const scan = await ensureScan();
          update(id, { kind: "shrinking" });
          const started = performance.now();
          const measuringWithoutShrink = new URLSearchParams(window.location.search).get("resize") === "off";
          const prepared = measuringWithoutShrink
            ? { body: file, resizedOnDevice: false, note: "ส่งตามเดิม (ปิดการย่อในมือถือเพื่อวัดผล)" }
            : await prepareForUpload(file, scan.device_resize);
          const shrunkAt = performance.now();
          let sentAt = shrunkAt;
          update(id, { kind: "sending", progress: 0 });
          const uploaded = await uploadScanPage(scan.id, prepared.body, {
            resizedOnDevice: prepared.resizedOnDevice,
            onProgress: (progress) => update(id, { kind: "sending", progress }),
            onSent: () => {
              sentAt = performance.now();
            },
          });
          const doneAt = performance.now();
          update(id, {
            kind: "sent",
            pageNo: uploaded.page_no,
            measure: {
              originalBytes: file.size,
              sentBytes: prepared.body.size,
              note: prepared.note,
              shrinkMs: shrunkAt - started,
              sendMs: sentAt - shrunkAt,
              serverMs: doneAt - sentAt,
            },
          });
        } catch (error) {
          update(id, { kind: "failed", message: messageOf(error) });
        }
      }
    } finally {
      running.current = false;
    }
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const added: Page[] = Array.from(list).map((file) => ({
      id: nextId++,
      file,
      previewUrl: URL.createObjectURL(file),
      previewFailed: false,
      status: { kind: "checking" },
    }));
    setPages((current) => [...current, ...added]);
    // Checked in parallel, but queued in the order picked: page order must
    // not depend on which file happened to be read first.
    void Promise.all(added.map((page) => sniffFile(page.file))).then((formats) =>
      added.forEach((page, index) => {
        const format = formats[index];
        if (SENDABLE.includes(format)) enqueue(page.id, page.file);
        else update(page.id, { kind: "refused", message: REFUSAL[format] ?? REFUSAL_OTHER });
      }),
    );
  }

  function forget(id: number) {
    queue.current = queue.current.filter((item) => item.id !== id);
    setPages((current) => {
      const gone = current.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return current.filter((p) => p.id !== id);
    });
  }

  function removePage(page: Page) {
    if (page.status.kind !== "sent") {
      forget(page.id);
      return;
    }
    const { pageNo, measure } = page.status;
    if (!scanId) return;
    update(page.id, { kind: "deleting", pageNo, measure });
    deleteScanPage(scanId, pageNo).then(
      () => forget(page.id),
      (error) => {
        update(page.id, { kind: "sent", pageNo, measure });
        window.alert(messageOf(error));
      },
    );
  }

  function startOver() {
    pages.forEach((page) => URL.revokeObjectURL(page.previewUrl));
    queue.current = [];
    setPages([]);
    setScanId(null);
    scanPromise.current = null;
  }

  if (me && !allowed) {
    return (
      <div className="page-stack">
        <PageHeader title="ถ่ายรูปใบส่งของ" />
        <AccessDenied />
      </div>
    );
  }

  const sentCount = pages.filter((p) => p.status.kind === "sent").length;
  const busy = pages.some((p) =>
    ["checking", "queued", "shrinking", "sending", "deleting"].includes(p.status.kind),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="ถ่ายรูปใบส่งของ" description="ถ่ายทีละหน้า ใบที่มีหลายหน้าให้ถ่ายครบทุกหน้า" />

      <div className="flex flex-wrap gap-3">
        <Button type="button" className="min-h-11 px-4" onClick={() => cameraInput.current?.click()}>
          📷 ถ่ายรูป
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 px-4"
          onClick={() => libraryInput.current?.click()}
        >
          🖼️ เลือกจากคลังรูป
        </Button>
        {/* Hidden inputs, reset after each pick so the same photo can be
            chosen twice in a row. Images only: PDF is not accepted yet. */}
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={libraryInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      <p className="text-sm text-slate-700" aria-live="polite">
        {pages.length === 0
          ? "ยังไม่มีรูป"
          : busy
            ? `กำลังส่ง… ส่งแล้ว ${sentCount} จาก ${pages.length} หน้า`
            : `ส่งแล้ว ${sentCount} จาก ${pages.length} หน้า`}
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
                <PageStatus status={page.status} />
              </div>

              <div className="flex flex-wrap gap-2 sm:flex-col sm:self-center">
                {page.status.kind === "failed" ? (
                  <Button
                    type="button"
                    className="min-h-11 px-4"
                    onClick={() => enqueue(page.id, page.file)}
                  >
                    ส่งใหม่
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 px-4"
                  disabled={page.status.kind === "sending" || page.status.kind === "deleting"}
                  onClick={() => removePage(page)}
                >
                  {page.status.kind === "deleting" ? "กำลังลบ…" : "ลบหน้านี้"}
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {sentCount > 0 && !busy ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm text-slate-700">
            เก็บรูปไว้แล้ว {sentCount} หน้า ส่วนการอ่านรายการยาจากรูปยังไม่เปิดใช้
          </p>
          <Button type="button" variant="outline" className="min-h-11 px-4" onClick={startOver}>
            เริ่มใบใหม่
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PageStatus({ status }: { status: Status }) {
  switch (status.kind) {
    case "checking":
      return <p className="text-sm text-slate-600">กำลังตรวจรูป…</p>;
    case "queued":
      return <p className="text-sm text-slate-600">รอส่ง</p>;
    case "shrinking":
      return <p className="text-sm text-slate-700">กำลังย่อรูป…</p>;
    case "sending": {
      const percent = Math.round(status.progress * 100);
      return (
        <div className="space-y-1">
          <p className="text-sm text-slate-700">กำลังส่ง {percent}%</p>
          <div
            className="h-2 w-full overflow-hidden rounded bg-slate-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="ส่งรูป"
          >
            <div className="h-full bg-slate-700" style={{ width: `${percent}%` }} />
          </div>
        </div>
      );
    }
    case "sent":
    case "deleting":
      return (
        <div className="space-y-1">
          <p className="text-sm font-medium text-emerald-700">✓ ส่งแล้ว</p>
          <MeasureLine measure={status.measure} />
        </div>
      );
    case "failed":
      return (
        <p className="text-sm text-red-700" role="alert">
          ส่งไม่สำเร็จ: {status.message}
        </p>
      );
    case "refused":
      return (
        <p className="text-sm text-red-700" role="alert">
          {status.message}
        </p>
      );
  }
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} วินาที`;

/** 🔧 Temporary (D75 measurement, D72) — removed once the numbers are in. */
function MeasureLine({ measure }: { measure: Measure }) {
  return (
    <p className="rounded bg-amber-50 p-2 text-sm text-slate-800">
      ส่งไป {formatBytes(measure.sentBytes)} จาก {formatBytes(measure.originalBytes)} · {measure.note}
      <br />
      ย่อ {seconds(measure.shrinkMs)} · ส่ง {seconds(measure.sendMs)} · รอระบบ {seconds(measure.serverMs)}
    </p>
  );
}
