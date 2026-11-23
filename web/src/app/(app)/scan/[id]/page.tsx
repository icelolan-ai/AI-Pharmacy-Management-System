"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useContext, useState } from "react";

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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ABILITIES, can } from "@/lib/abilities";
import { ApiError } from "@/lib/api/client";
import {
  deleteScan,
  extractScan,
  getScan,
  rejectScan,
  reviewDone,
  touchField,
  type AiField,
  type Correction,
  type DecidedDate,
  type DerivedLine,
  type Extracted,
  type Flag,
  type ScanDetail,
} from "@/lib/api/invoice-scans";
import { formatDateBE, formatDateTimeBE } from "@/lib/format/date";
import {
  bahtOf,
  canConfirm,
  canDelete,
  checkWarning,
  dateNote,
  emptyWord,
  failedWord,
  FIELD_LABELS,
  fieldKind,
  MUST_CHECK_WORD,
  shownFor,
  statusWord,
  untouchedWord,
  whyKept,
  whyWord,
} from "@/lib/scan/review";
import { useSection } from "@/lib/use-section";

/** ตรวจใบส่งของ (6.4).
 *
 *  The photo is always on top, so every field can be held against the paper.
 *  Then the header, the lines in the order of the paper, and the totals.
 *  Each field shows what our code made of the AI's reading (D84) and can be
 *  changed, however sure the AI was. A field a person must touch says
 *  "ต้องตรวจ" in words until touched (D57 · D85 · D87). Not on the paper and
 *  could not be read are said differently (D62).
 *
 *  Every touch is a new row on the server; the AI's answer is never changed
 *  (กฎข้อ 42). "ตรวจเสร็จ ไปต่อ" is refused by the server while any required
 *  field is untouched — the button only says so first.
 */

type Review = {
  extracted: Extracted;
  corrections: Map<string, Correction>;
  untouched: Set<string>;
  editable: boolean;
  save: (path: string, action: "confirmed" | "changed", value?: string | null) => Promise<string | null>;
};

const ReviewContext = createContext<Review | null>(null);

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
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (me && !allowed) {
    return (
      <div className="page-stack">
        <PageHeader title="ตรวจใบส่งของ" />
        <AccessDenied />
      </div>
    );
  }

  const message = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

  async function read() {
    setReading(true);
    setActionError(null);
    try {
      await extractScan(id);
    } catch (error) {
      setActionError(message(error, "อ่านใบไม่สำเร็จ ลองใหม่อีกครั้ง"));
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
      setActionError(message(error, "ลบใบไม่สำเร็จ ลองใหม่อีกครั้ง"));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function save(path: string, action: "confirmed" | "changed", value?: string | null): Promise<string | null> {
    try {
      await touchField(id, { field_path: path, action, person_value: value ?? null });
      scan.reload();
      return null;
    } catch (error) {
      return message(error, "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  }

  async function finish() {
    setBusy(true);
    setActionError(null);
    try {
      await reviewDone(id);
    } catch (error) {
      setActionError(message(error, "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"));
    } finally {
      setBusy(false);
      scan.reload();
    }
  }

  async function reject() {
    setBusy(true);
    setActionError(null);
    try {
      await rejectScan(id, reason);
      setRejecting(false);
      setReason("");
    } catch (error) {
      setActionError(message(error, "ปฏิเสธใบไม่สำเร็จ ลองใหม่อีกครั้ง"));
    } finally {
      setBusy(false);
      scan.reload();
    }
  }

  const detail = scan.data;
  const review: Review | null = detail?.extracted
    ? {
        extracted: detail.extracted,
        corrections: new Map(detail.corrections.map((c) => [c.field_path, c])),
        untouched: new Set(detail.untouched),
        editable: detail.status === "needs_review" && !detail.reviewed_at,
        save,
      }
    : null;
  const rejectable = detail ? ["uploaded", "needs_review", "failed"].includes(detail.status) : false;

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
          <StatusPanel detail={detail} reading={reading} onRead={read} />
          {review ? (
            <ReviewContext.Provider value={review}>
              <Reading />
            </ReviewContext.Provider>
          ) : null}

          {review?.editable ? (
            <div className="surface-card space-y-2 rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-base font-medium text-slate-900" aria-live="polite">
                {review.untouched.size > 0 ? `⚠️ ${untouchedWord(review.untouched.size)}` : `✓ ${untouchedWord(0)}`}
              </p>
              <Button type="button" className="min-h-11 w-full px-4" onClick={finish}
                      disabled={busy || review.untouched.size > 0}>
                ตรวจเสร็จ ไปต่อ
              </Button>
            </div>
          ) : null}

          <div className="space-y-3 border-t border-slate-200 pt-4">
            {rejectable ? (
              <Button type="button" variant="outline" className="min-h-11 w-full px-4" onClick={() => setRejecting(true)}>
                ปฏิเสธใบนี้
              </Button>
            ) : null}
            {canDelete(detail.status) ? (
              <Button type="button" variant="outline" className="min-h-11 w-full px-4" onClick={() => setConfirmDelete(true)}>
                ลบทั้งใบ
              </Button>
            ) : whyKept(detail.status) ? (
              <p className="text-sm text-slate-700">{whyKept(detail.status)}</p>
            ) : null}
          </div>

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

          <Dialog open={rejecting} onOpenChange={busy ? () => {} : setRejecting}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>ปฏิเสธใบนี้?</DialogTitle>
                <DialogDescription>
                  ใบและรูปจะเก็บไว้เป็นหลักฐาน ลบไม่ได้ และจะไม่ถูกนำไปสร้างใบรับสินค้า
                </DialogDescription>
              </DialogHeader>
              <label className="space-y-1">
                <span className="text-sm text-slate-800">เหตุผล (ต้องกรอก)</span>
                <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500}
                          placeholder="เช่น ใบซ้ำกับที่รับไปแล้ว" className="min-h-24 text-base" />
              </label>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" className="min-h-11 px-4" disabled={busy}
                        onClick={() => setRejecting(false)}>
                  ไม่ปฏิเสธ
                </Button>
                <Button type="button" variant="destructive" className="min-h-11 px-4"
                        disabled={busy || !reason.trim()} onClick={reject}>
                  ปฏิเสธใบนี้
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : scan.loading || !me ? (
        <p className="text-sm text-slate-700">กำลังโหลด…</p>
      ) : null}
    </div>
  );
}

function StatusPanel({ detail, reading, onRead }: { detail: ScanDetail; reading: boolean; onRead: () => void }) {
  if (detail.status === "uploaded" || detail.status === "failed") {
    const first = detail.status === "uploaded";
    return (
      <div className="surface-card space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-base text-slate-900" role={first ? undefined : "alert"}>
          {first ? "ใบนี้ยังไม่ได้อ่าน" : failedWord(detail.failed_reason)}
        </p>
        <Button type="button" className="min-h-11 px-4" onClick={onRead} disabled={reading || detail.pages.length === 0}>
          {reading ? "กำลังอ่าน… อาจใช้เวลาถึงครึ่งนาที" : first ? "อ่านใบนี้" : "ลองอ่านใหม่"}
        </Button>
      </div>
    );
  }
  if (detail.status === "extracting") {
    return <p className="text-base text-slate-900">กำลังอ่านใบนี้อยู่ ลองเปิดใหม่อีกครั้งในอีกสักครู่</p>;
  }
  if (detail.status === "rejected") {
    return (
      <p className="rounded-md bg-slate-100 p-3 text-base text-slate-900" role="status">
        ปฏิเสธแล้ว เมื่อ {formatDateTimeBE(detail.rejected_at)} · เหตุผล: {detail.rejected_reason}
      </p>
    );
  }
  if (detail.reviewed_at) {
    return (
      <p className="rounded-md bg-emerald-50 p-3 text-base text-slate-900" role="status">
        ✓ ตรวจเสร็จแล้ว โดย {detail.reviewed_by_name ?? "-"} เมื่อ {formatDateTimeBE(detail.reviewed_at)} ·
        ขั้นต่อไป (จับคู่ยากับคลังยา) จะเปิดในงานถัดไป
      </p>
    );
  }
  if (detail.status === "needs_review") {
    return (
      <p className="rounded-md bg-amber-50 p-3 text-sm text-slate-900">
        เทียบกับรูปทีละช่อง ช่องที่มีป้าย “{MUST_CHECK_WORD}” ต้องกดยืนยันหรือแก้ก่อนไปต่อ ช่องอื่นแก้ได้ทุกช่อง
      </p>
    );
  }
  return null;
}

// --- the reading ---------------------------------------------------------------

const whysFor = (flags: Flag[], field: string) => flags.filter((f) => f.field === field).map((f) => f.why);

/** A decided date as text, or null so the field shows its note instead. */
const dateText = (date: DecidedDate) => (date.value ? formatDateBE(date.value) : null);

/** One field: what is shown, why it must be checked, and the way to touch it. */
function Field({
  path, label, display, note, whys, aiField, options,
}: {
  path: string;
  label: string;
  display: React.ReactNode;
  note?: string | null;
  whys: string[];
  aiField?: AiField;
  options?: { value: string; label: string; suggested?: boolean }[];
}) {
  const review = useContext(ReviewContext)!;
  const touched = review.corrections.get(path);
  const mustCheck = review.untouched.has(path);
  const shown = shownFor(review.extracted, path);
  const kind = fieldKind(path);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function send(action: "confirmed" | "changed", value?: string | null) {
    setSaving(true);
    setError(null);
    const problem = await review.save(path, action, value);
    setSaving(false);
    if (problem) setError(problem);
    else setEditing(false);
  }

  const showValue = touched ? touched.person_value : null;
  return (
    <div className="py-3">
      <dt className="text-sm text-slate-700">{label}</dt>
      <dd className="space-y-1 text-base text-slate-900">
        <div className="flex items-start justify-between gap-3">
          {touched ? (
            <p className="min-w-0">
              {showValue ? (kind === "date" ? formatDateBE(showValue) : showValue) : "ไม่มี"}{" "}
              <Badge variant="secondary">✓ {touched.action === "confirmed" ? "ยืนยันแล้ว" : "แก้แล้ว"}</Badge>
            </p>
          ) : (
            <div className="min-w-0">{display ?? <span className="text-slate-700">{note ?? "-"}</span>}</div>
          )}
          {review.editable && !editing ? (
            <Button type="button" variant="outline" className="min-h-11 shrink-0 px-4" disabled={saving}
                    onClick={() => { setDraft(touched?.person_value ?? shown ?? ""); setEditing(true); }}>
              แก้
            </Button>
          ) : null}
        </div>
        {!touched && display !== null && note ? <p className="text-sm text-slate-700">{note}</p> : null}
        {mustCheck ? (
          <p className="text-sm font-medium text-amber-900">
            <Badge variant="outline" className="mr-1 border-amber-700 text-amber-900">⚠️ {MUST_CHECK_WORD}</Badge>
            {whys.map(whyWord).join(" · ")}
          </p>
        ) : null}

        {review.editable && options && options.length > 0 && !touched ? (
          <fieldset className="flex flex-col gap-2 pt-1">
            <legend className="sr-only">เลือก{label}</legend>
            {options.map((option) => (
              <Button key={option.value} type="button" variant="outline" className="min-h-11 justify-start px-3"
                      disabled={saving} onClick={() => send(option.value === shown ? "confirmed" : "changed", option.value)}>
                เลือก {option.label}{option.suggested ? " (ระบบเลือกไว้ให้)" : ""}
              </Button>
            ))}
          </fieldset>
        ) : null}

        {review.editable && !editing && mustCheck && canConfirm(shown, aiField) && !(options && options.length > 0) ? (
          <Button type="button" className="min-h-11 w-full px-4" disabled={saving} onClick={() => send("confirmed")}>
            ถูกต้อง
          </Button>
        ) : null}

        {editing ? (
          <form className="flex flex-col gap-2 pt-1" onSubmit={(event) => { event.preventDefault(); void send("changed", draft); }}>
            <Input
              aria-label={`แก้${label}`}
              type={kind === "date" ? "date" : "text"}
              inputMode={kind === "count" ? "numeric" : kind === "money" ? "decimal" : undefined}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-11 text-base"
            />
            <div className="flex gap-2">
              <Button type="submit" className="min-h-11 px-4" disabled={saving}>บันทึก</Button>
              <Button type="button" variant="outline" className="min-h-11 px-4" disabled={saving}
                      onClick={() => { setEditing(false); setError(null); }}>
                ยกเลิก
              </Button>
            </div>
          </form>
        ) : null}
        {error ? <p className="text-sm text-red-800" role="alert">{error}</p> : null}
      </dd>
    </div>
  );
}

function dateOptions(date: DecidedDate) {
  if (date.value || !date.ambiguous) return undefined;
  return date.candidates.map((value) => ({ value, label: formatDateBE(value), suggested: date.suggested === value }));
}

function Reading() {
  const { extracted } = useContext(ReviewContext)!;
  const { ai, derived } = extracted;
  const failed = derived.checks.filter((check) => !check.ok);
  return (
    <div className="flex flex-col gap-4">
      <section className="surface-card rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">หัวใบ</h2>
        <dl className="divide-y divide-slate-100">
          {(["supplier_name", "supplier_tax_id", "invoice_no"] as const).map((key) => (
            <Field key={key} path={`header.${key}`} label={FIELD_LABELS[key]} aiField={ai[key]}
                   display={ai[key].state === "read" ? ai[key].text : null}
                   note={emptyWord(ai[key], key)} whys={whysFor(derived.header_flags, key)} />
          ))}
          <Field path="header.doc_date" label={FIELD_LABELS.doc_date} aiField={ai.doc_date}
                 display={dateText(derived.doc_date)}
                 note={dateNote(derived.doc_date) ?? emptyWord(ai.doc_date, "doc_date") ?? `ในใบเขียน ${ai.doc_date.text}`}
                 whys={whysFor(derived.header_flags, "doc_date")} options={dateOptions(derived.doc_date)} />
          {derived.due_date && ai.due_date ? (
            <Field path="header.due_date" label="วันครบกำหนดชำระ" aiField={ai.due_date}
                   display={dateText(derived.due_date)}
                   note={dateNote(derived.due_date) ?? emptyWord(ai.due_date, "due_date")}
                   whys={whysFor(derived.header_flags, "due_date")} options={dateOptions(derived.due_date)} />
          ) : null}
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
              <Field key={index} path={`totals.boxes.${index}`} label={box.label} aiField={box.amount}
                     display={box.amount.state === "read" ? box.amount.text : null}
                     note={emptyWord(box.amount, "total_amount")}
                     whys={derived.totals.flags.filter((f) => f.box === index).map((f) => f.why)} />
            ))}
          </dl>
        )}
        <div className="mt-3 space-y-2">
          {failed.length === 0 ? (
            <p className="text-sm text-slate-700">ตรวจยอดตามที่อ่านได้ {derived.checks.length} ข้อ ตรงกันทั้งหมด</p>
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
  /** "ในใบเขียน …" only when the paper says something other than what is shown. */
  const paper = (name: string, shown: string | null) => {
    const written = text(name);
    return written && written !== shown ? `ในใบเขียน “${written}”` : null;
  };
  const path = (name: string) => `lines.${line.line_no}.${name}`;
  const common = (name: string) => ({ path: path(name), label: FIELD_LABELS[name], aiField: field(name),
    whys: whysFor(line.flags, name) });
  return (
    <article className="surface-card rounded-lg border border-slate-200 bg-white p-4">
      <header className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-700">บรรทัด {line.line_no} · หน้า {line.page_no}</span>
        {line.free_goods ? <Badge className="bg-emerald-700 text-white">🎁 ของแถม</Badge> : null}
      </header>
      <dl className="divide-y divide-slate-100">
        <Field {...common("name")} display={line.name}
               note={line.name_from_line ? `สืบชื่อจากบรรทัด ${line.name_from_line} (ในใบเขียน “${text("name") ?? ""}”)`
                 : emptyWord(field("name"), "name") ?? paper("name", line.name)} />
        <Field {...common("quantity")} whys={[...whysFor(line.flags, "quantity"), ...whysFor(line.flags, "unit")]}
               display={line.quantity !== null ? `${line.quantity} ${line.unit ?? ""}`.trim() : null}
               note={emptyWord(field("quantity"), "quantity") ?? paper("quantity", line.quantity === null ? null : String(line.quantity))} />
        {line.free_goods ? null : (
          <>
            <Field {...common("unit_price")} display={line.unit_price_satang !== null ? bahtOf(line.unit_price_satang) : null}
                   note={emptyWord(field("unit_price"), "unit_price") ?? paper("unit_price", bahtOf(line.unit_price_satang))} />
            <Field {...common("amount")} display={line.amount_satang !== null ? bahtOf(line.amount_satang) : null}
                   note={emptyWord(field("amount"), "amount") ?? paper("amount", bahtOf(line.amount_satang))} />
          </>
        )}
        <Field {...common("lot")} display={line.lot} note={emptyWord(field("lot"), "lot")} />
        <Field {...common("exp")} display={dateText(line.exp)} options={dateOptions(line.exp)}
               note={dateNote(line.exp) ?? emptyWord(field("exp"), "exp") ?? (line.exp.text ? `ในใบเขียน ${line.exp.text}` : null)} />
        {text("remark") ? <Field {...common("remark")} display={text("remark")} /> : null}
      </dl>
    </article>
  );
}
