"use client";

import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { AccessDenied } from "@/components/common/AccessDenied";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { ScanImages } from "@/components/scan/ScanImages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ABILITIES, can } from "@/lib/abilities";
import { ApiError } from "@/lib/api/client";
import {
  deleteScan,
  extractScan,
  getScan,
  type AiField,
  type DecidedDate,
  type DerivedLine,
  type Extracted,
  type Flag,
  type ScanDetail,
} from "@/lib/api/invoice-scans";
import { formatDateBE } from "@/lib/format/date";
import {
  bahtOf,
  canDelete,
  checkWarning,
  dateNote,
  emptyWord,
  failedWord,
  FIELD_LABELS,
  MUST_CHECK_WORD,
  statusWord,
  whyKept,
  whyWord,
} from "@/lib/scan/review";
import { useSection } from "@/lib/use-section";

/** ตรวจใบส่งของ (6.4).
 *
 *  The photo is always on top, so every field can be held against the paper.
 *  Then the header, the lines in the order of the paper, and the totals.
 *  Each field says what the AI read and what our code made of it (D84);
 *  a field a person must touch says "ต้องตรวจ" in words (D57 · D85);
 *  not-on-the-paper and could-not-read are said differently (D62).
 *
 *  This round shows the reading. Changing a value, confirming, rejecting and
 *  "go on" wait for the schema Chat A approves first (6.4 ข้อ 2) — the page
 *  says so rather than offering buttons that would save nothing.
 */
export default function ScanReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useAuth();
  const router = useRouter();
  const allowed = can(me?.role, ABILITIES.receiveStock);
  const scan = useSection((signal) => getScan(id, signal), {
    enabled: allowed,
    errorMessage: "โหลดใบนี้ไม่สำเร็จ",
    deps: [id],
  });
  const [reading, setReading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (me && !allowed) {
    return (
      <div className="page-stack">
        <PageHeader title="ตรวจใบส่งของ" />
        <AccessDenied />
      </div>
    );
  }

  async function read() {
    setReading(true);
    setActionError(null);
    try {
      await extractScan(id);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : "อ่านใบไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setReading(false);
      scan.reload();
    }
  }

  async function remove() {
    setDeleting(true);
    setActionError(null);
    try {
      await deleteScan(id);
      router.push("/scan");
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : "ลบใบไม่สำเร็จ ลองใหม่อีกครั้ง");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const detail = scan.data;
  return (
    <div className="page-stack">
      <PageHeader
        title="ตรวจใบส่งของ"
        description={detail ? `สถานะ: ${statusWord(detail.status)}` : undefined}
        keepDescriptionOnPhone
      />
      {scan.error ? <ErrorState message={scan.error} onRetry={scan.reload} retrying={scan.loading} /> : null}
      {actionError ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">
          {actionError}
        </p>
      ) : null}

      {detail ? (
        <>
          <ScanImages pages={detail.pages} />
          <ReadPanel detail={detail} reading={reading} onRead={read} />
          {detail.extracted ? <Reading extracted={detail.extracted} /> : null}
          <DeletePanel detail={detail} onAsk={() => setConfirmDelete(true)} />
          <Dialog open={confirmDelete} onOpenChange={deleting ? () => {} : setConfirmDelete}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>ลบใบนี้ทั้งใบ?</DialogTitle>
                <DialogDescription>
                  รูป {detail.pages.length} หน้าและผลที่อ่านไว้จะถูกลบทั้งหมด ลบแล้วกู้คืนไม่ได้
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" className="min-h-11 px-4" disabled={deleting}
                        onClick={() => setConfirmDelete(false)}>
                  ไม่ลบ
                </Button>
                <Button type="button" variant="destructive" className="min-h-11 px-4" disabled={deleting} onClick={remove}>
                  {deleting ? "กำลังลบ…" : "ลบทั้งใบ"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : scan.loading ? (
        <p className="text-sm text-slate-700">กำลังโหลด…</p>
      ) : null}
    </div>
  );
}

function ReadPanel({ detail, reading, onRead }: { detail: ScanDetail; reading: boolean; onRead: () => void }) {
  if (detail.status === "uploaded" || detail.status === "failed") {
    const first = detail.status === "uploaded";
    return (
      <div className="surface-card space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-base text-slate-900" role={first ? undefined : "alert"}>
          {first ? "ใบนี้ยังไม่ได้อ่าน" : failedWord(detail.failed_reason)}
        </p>
        <Button type="button" className="min-h-11 px-4" onClick={onRead} disabled={reading || detail.pages.length === 0}>
          {reading ? "กำลังอ่าน… (ประมาณ 10 วินาที)" : first ? "อ่านใบนี้" : "ลองอ่านใหม่"}
        </Button>
      </div>
    );
  }
  if (detail.status === "extracting") {
    return <p className="text-base text-slate-900">กำลังอ่านใบนี้อยู่ ลองเปิดใหม่อีกครั้งในอีกสักครู่</p>;
  }
  if (detail.status === "needs_review") {
    return (
      <p className="rounded-md bg-amber-50 p-3 text-sm text-slate-900">
        ผลที่ระบบอ่านได้อยู่ด้านล่าง เทียบกับรูปทีละช่อง · การแก้ค่า ยืนยัน และปฏิเสธใบ จะเปิดในรอบถัดไป
      </p>
    );
  }
  return null;
}

function DeletePanel({ detail, onAsk }: { detail: ScanDetail; onAsk: () => void }) {
  const kept = whyKept(detail.status);
  return (
    <div className="space-y-2 border-t border-slate-200 pt-4">
      {canDelete(detail.status) ? (
        <Button type="button" variant="outline" className="min-h-11 px-4" onClick={onAsk}>
          ลบทั้งใบ
        </Button>
      ) : kept ? (
        <p className="text-sm text-slate-700">{kept}</p>
      ) : null}
    </div>
  );
}

// --- the reading --------------------------------------------------------------

function MustCheck({ whys }: { whys: string[] }) {
  if (whys.length === 0) return null;
  return (
    <p className="mt-1 text-sm font-medium text-amber-900">
      <Badge variant="outline" className="mr-1 border-amber-700 text-amber-900">⚠️ {MUST_CHECK_WORD}</Badge>
      {whys.map(whyWord).join(" · ")}
    </p>
  );
}

function FieldRow({ label, value, note, whys }: { label: string; value: React.ReactNode; note?: string | null; whys: string[] }) {
  return (
    <div className="py-2">
      <dt className="text-sm text-slate-700">{label}</dt>
      <dd className="text-base text-slate-900">
        {value ?? <span className="text-slate-700">{note ?? "-"}</span>}
        {value !== null && note ? <span className="block text-sm text-slate-700">{note}</span> : null}
        <MustCheck whys={whys} />
      </dd>
    </div>
  );
}

const whysFor = (flags: Flag[], field: string) => flags.filter((f) => f.field === field).map((f) => f.why);

function DateValue({ date }: { date: DecidedDate }) {
  if (date.value) return <>{formatDateBE(date.value)}</>;
  if (date.ambiguous && date.candidates.length > 0) {
    return (
      <ul className="space-y-1">
        {date.candidates.map((candidate) => (
          <li key={candidate}>
            {formatDateBE(candidate)}
            {date.suggested === candidate ? <Badge variant="secondary" className="ml-2">ระบบเลือกไว้ให้</Badge> : null}
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

function Reading({ extracted }: { extracted: Extracted }) {
  const { ai, derived } = extracted;
  const failed = derived.checks.filter((check) => !check.ok);
  const mustCount = derived.must_check.length;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-base font-medium text-slate-900">
        {mustCount > 0 ? `⚠️ ${MUST_CHECK_WORD} ${mustCount} ช่อง` : "ไม่มีช่องที่ระบบไม่แน่ใจ แต่ยังต้องเทียบกับรูปทุกช่อง"}
      </p>

      <section className="surface-card rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">หัวใบ</h2>
        <dl className="divide-y divide-slate-100">
          {(["supplier_name", "supplier_tax_id", "invoice_no"] as const).map((key) => (
            <FieldRow key={key} label={FIELD_LABELS[key]} value={ai[key].state === "read" ? ai[key].text : null}
                      note={emptyWord(ai[key], key)} whys={whysFor(derived.header_flags, key)} />
          ))}
          <FieldRow label={FIELD_LABELS.doc_date} value={<DateValue date={derived.doc_date} />}
                    note={dateNote(derived.doc_date) ?? emptyWord(ai.doc_date, "doc_date") ?? `ในใบเขียน ${ai.doc_date.text}`}
                    whys={whysFor(derived.header_flags, "doc_date")} />
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">รายการ {derived.lines.length} บรรทัด</h2>
        {derived.lines.map((line) => (
          <LineCard key={line.line_no} line={line} aiLine={ai.lines.find((l) => l.line_no === line.line_no)} />
        ))}
      </section>

      <section className="surface-card rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">ยอดเงินท้ายใบ</h2>
        {ai.totals.boxes.length === 0 ? (
          <p className="text-sm text-slate-700">ใบนี้ไม่มีช่องสรุปยอด</p>
        ) : (
          <dl className="divide-y divide-slate-100">
            {ai.totals.boxes.map((box, index) => (
              <FieldRow key={index} label={box.label}
                        value={box.amount.state === "read" ? box.amount.text : null}
                        note={emptyWord(box.amount, "total_amount")}
                        whys={derived.totals.flags.filter((f) => f.box === index).map((f) => f.why)} />
            ))}
          </dl>
        )}
        <div className="mt-3 space-y-2">
          {failed.length === 0 ? (
            <p className="text-sm text-slate-700">
              ตรวจยอดแล้ว {derived.checks.length} ข้อ ตรงกันทั้งหมด
            </p>
          ) : (
            failed.map((check, index) => (
              <p key={index} className="rounded-md bg-amber-50 p-2 text-sm text-slate-900" role="alert">
                ⚠️ {checkWarning(check)}
              </p>
            ))
          )}
          {derived.totals.unknown_labels.length > 0 ? (
            <p className="text-sm text-slate-700">
              มีช่องยอดที่ระบบไม่รู้จัก ไม่ได้ใช้ตรวจ: {derived.totals.unknown_labels.join(" · ")}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function LineCard({ line, aiLine }: { line: DerivedLine; aiLine?: Record<string, unknown> }) {
  const field = (name: string) => aiLine?.[name] as AiField | undefined;
  const text = (name: string) => (field(name)?.state === "read" ? field(name)?.text ?? null : null);
  const name = line.name ?? null;
  return (
    <article className="surface-card rounded-lg border border-slate-200 bg-white p-4">
      <header className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-700">บรรทัด {line.line_no} · หน้า {line.page_no}</span>
        {line.free_goods ? <Badge className="bg-emerald-700 text-white">🎁 ของแถม</Badge> : null}
      </header>
      <dl className="divide-y divide-slate-100">
        <FieldRow
          label={FIELD_LABELS.name}
          value={name}
          note={line.name_from_line ? `สืบชื่อจากบรรทัด ${line.name_from_line} (ในใบเขียน “${text("name") ?? ""}”)`
            : emptyWord(field("name"), "name") ?? (text("name") ? `ในใบเขียน “${text("name")}”` : null)}
          whys={whysFor(line.flags, "name")}
        />
        <FieldRow label={FIELD_LABELS.quantity}
                  value={line.quantity !== null ? `${line.quantity} ${line.unit ?? ""}`.trim() : null}
                  note={emptyWord(field("quantity"), "quantity") ?? (text("quantity") ? `ในใบเขียน “${text("quantity")}”` : null)}
                  whys={[...whysFor(line.flags, "quantity"), ...whysFor(line.flags, "unit")]} />
        {line.free_goods ? null : (
          <>
            <FieldRow label={FIELD_LABELS.unit_price}
                      value={line.unit_price_satang !== null ? bahtOf(line.unit_price_satang) : null}
                      note={emptyWord(field("unit_price"), "unit_price") ?? text("unit_price")}
                      whys={whysFor(line.flags, "unit_price")} />
            <FieldRow label={FIELD_LABELS.amount}
                      value={line.amount_satang !== null ? bahtOf(line.amount_satang) : null}
                      note={emptyWord(field("amount"), "amount") ?? text("amount")}
                      whys={whysFor(line.flags, "amount")} />
          </>
        )}
        <FieldRow label={FIELD_LABELS.lot} value={line.lot} note={emptyWord(field("lot"), "lot")} whys={whysFor(line.flags, "lot")} />
        <FieldRow label={FIELD_LABELS.exp} value={<DateValue date={line.exp} />}
                  note={dateNote(line.exp) ?? emptyWord(field("exp"), "exp") ?? (line.exp.text ? `ในใบเขียน ${line.exp.text}` : null)}
                  whys={whysFor(line.flags, "exp")} />
        {text("remark") ? <FieldRow label={FIELD_LABELS.remark} value={text("remark")} whys={[]} /> : null}
      </dl>
    </article>
  );
}
