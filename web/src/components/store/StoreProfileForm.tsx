"use client";

import { useEffect, useState } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { ReceiptHeaderPreview } from "@/components/store/ReceiptHeaderPreview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { updateStoreProfile, type StoreProfile, type StoreProfilePayload } from "@/lib/api/store";
import { formatDateTimeBE } from "@/lib/format/date";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";

type FormState = {
  name: string;
  owner_name: string;
  address: string;
  phone: string;
  license_no: string;
  tax_id: string;
};

const EMPTY: FormState = {
  name: "",
  owner_name: "",
  address: "",
  phone: "",
  license_no: "",
  tax_id: "",
};

function fromProfile(profile: StoreProfile | null): FormState {
  if (!profile) return EMPTY;
  return {
    name: profile.name ?? "",
    owner_name: profile.owner_name ?? "",
    address: profile.address ?? "",
    phone: profile.phone ?? "",
    license_no: profile.license_no ?? "",
    tax_id: profile.tax_id ?? "",
  };
}

/** Only the fields the owner actually changed, so an unchanged save is not sent. */
function changedFields(form: FormState, profile: StoreProfile | null): StoreProfilePayload {
  const saved = fromProfile(profile);
  const payload: StoreProfilePayload = {};
  if (form.name.trim() !== saved.name) payload.name = form.name.trim();
  for (const key of ["owner_name", "address", "phone", "license_no", "tax_id"] as const) {
    const value = form[key].trim();
    if (value !== saved[key]) payload[key] = value || null;
  }
  return payload;
}

export function StoreProfileForm({
  profile,
  onSaved,
}: {
  profile: StoreProfile | null;
  onSaved: (profile: StoreProfile) => void;
}) {
  // Keyed on the saved profile by the caller, so a fresh profile remounts this
  // form with the stored values instead of resetting it in an effect.
  const [form, setForm] = useState<FormState>(() => fromProfile(profile));
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);


  function setField(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  // Unsaved when the form no longer matches what the server holds.
  const saved_ = fromProfile(profile);
  const dirty = (Object.keys(form) as (keyof FormState)[]).some(
    (key) => form[key].trim() !== saved_[key],
  );
  useUnsavedChangesWarning(dirty && !saving);

  async function save() {
    setError(null);
    setSaved(false);

    // The backend only insists on a name; the receipt header needs these three.
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) errors.name = "กรุณากรอกชื่อร้าน";
    if (!form.address.trim()) errors.address = "กรุณากรอกที่อยู่ร้าน";
    if (!form.phone.trim()) errors.phone = "กรุณากรอกเบอร์โทร";
    setFieldError(errors);
    if (Object.keys(errors).length > 0) return;

    const payload = changedFields(form, profile);
    if (Object.keys(payload).length === 0) {
      setSaved(true); // nothing to send; the form already matches what is stored
      return;
    }

    setSaving(true);
    try {
      onSaved(await updateStoreProfile(payload));
      setSaved(true);
    } catch (saveError) {
      // Show the backend's Thai message as-is.
      setError(saveError instanceof ApiError ? saveError.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  // Ctrl+S / Cmd+S saves, like the rest of the desk work the owner does.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!saving) void save();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const textFields: {
    key: keyof FormState;
    label: string;
    hint?: string;
    required?: boolean;
  }[] = [
    {
      key: "owner_name",
      label: "ชื่อเจ้าของร้าน",
      hint: "มีหลายคนได้ — พิมพ์รวมในช่องเดียว เช่น คั่นด้วย และ",
    },
    { key: "phone", label: "เบอร์โทร", required: true },
    {
      key: "license_no",
      label: "เลขที่ใบอนุญาตขายยา",
      hint: "มาตรฐานร้านยา — แสดงบนใบเสร็จ",
    },
    { key: "tax_id", label: "เลขประจำตัวผู้เสียภาษี" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ข้อมูลร้าน</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div>
              <Label htmlFor="store-name">ชื่อร้าน *</Label>
              <Input
                id="store-name"
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
                disabled={saving}
                aria-invalid={Boolean(fieldError.name)}
              />
              {fieldError.name ? (
                <p className="mt-1 text-xs text-red-600">{fieldError.name}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">แสดงบนหัวใบเสร็จและใบรับสินค้า</p>
              )}
            </div>

            <div>
              <Label htmlFor="store-address">ที่อยู่ร้าน *</Label>
              <Textarea
                id="store-address"
                value={form.address}
                onChange={(event) => setField("address", event.target.value)}
                disabled={saving}
                rows={3}
                aria-invalid={Boolean(fieldError.address)}
              />
              {fieldError.address ? (
                <p className="mt-1 text-xs text-red-600">{fieldError.address}</p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {textFields.map((field) => (
                <div key={field.key}>
                  <Label htmlFor={`store-${field.key}`}>
                    {field.label}
                    {field.required ? " *" : ""}
                  </Label>
                  <Input
                    id={`store-${field.key}`}
                    value={form[field.key]}
                    onChange={(event) => setField(field.key, event.target.value)}
                    disabled={saving}
                    aria-invalid={Boolean(fieldError[field.key])}
                  />
                  {fieldError[field.key] ? (
                    <p className="mt-1 text-xs text-red-600">{fieldError[field.key]}</p>
                  ) : field.hint ? (
                    <p className="mt-1 text-xs text-slate-500">{field.hint}</p>
                  ) : null}
                </div>
              ))}
            </div>

            {error ? <ErrorState message={error} /> : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
              <span className="text-xs text-slate-500">กด Ctrl+S เพื่อบันทึก</span>
              {saved && !saving ? (
                <span className="text-xs text-emerald-600" role="status">
                  บันทึกแล้ว
                </span>
              ) : null}
            </div>

            {/* D21 — ข้อความนี้กำหนดไว้ใน docs/05-web-spec.md ข้อ 5.8ข ห้ามแก้ถ้อยคำ */}
            <p className="text-xs text-slate-500">
              ใบเสร็จจะใช้ข้อมูลร้านล่าสุดเสมอ — ถ้าแก้ที่อยู่ ใบเสร็จเก่าที่พิมพ์ซ้ำจะขึ้นที่อยู่ใหม่
            </p>

            <p className="text-xs text-slate-500">
              {profile?.updated_at
                ? `แก้ไขล่าสุด ${formatDateTimeBE(profile.updated_at)} น. โดย ${
                    profile.updated_by_name ?? "ไม่ทราบชื่อ"
                  }`
                : "ยังไม่เคยบันทึกข้อมูลร้าน"}
            </p>
          </form>
        </CardContent>
      </Card>

      <ReceiptHeaderPreview store={form} />
    </div>
  );
}
