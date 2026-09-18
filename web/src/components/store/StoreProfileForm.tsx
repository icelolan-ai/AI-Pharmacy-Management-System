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

type FormState = {
  name: string;
  address: string;
  phone: string;
  license_no: string;
  tax_id: string;
};

const EMPTY: FormState = { name: "", address: "", phone: "", license_no: "", tax_id: "" };

function fromProfile(profile: StoreProfile | null): FormState {
  if (!profile) return EMPTY;
  return {
    name: profile.name ?? "",
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
  for (const key of ["address", "phone", "license_no", "tax_id"] as const) {
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
  const [form, setForm] = useState<FormState>(() => fromProfile(profile));
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(fromProfile(profile));
  }, [profile]);

  function setField(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setError(null);
    setSaved(false);

    if (!form.name.trim()) {
      setNameError("กรุณากรอกชื่อร้าน");
      return;
    }
    setNameError(null);

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

  const textFields: { key: keyof FormState; label: string; hint?: string }[] = [
    { key: "phone", label: "เบอร์โทร" },
    { key: "license_no", label: "เลขที่ใบอนุญาต", hint: "เช่น ขย.1/2569" },
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
                aria-invalid={Boolean(nameError)}
              />
              {nameError ? <p className="mt-1 text-xs text-red-600">{nameError}</p> : null}
            </div>

            <div>
              <Label htmlFor="store-address">ที่อยู่</Label>
              <Textarea
                id="store-address"
                value={form.address}
                onChange={(event) => setField("address", event.target.value)}
                disabled={saving}
                rows={3}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {textFields.map((field) => (
                <div key={field.key}>
                  <Label htmlFor={`store-${field.key}`}>{field.label}</Label>
                  <Input
                    id={`store-${field.key}`}
                    value={form[field.key]}
                    onChange={(event) => setField(field.key, event.target.value)}
                    disabled={saving}
                  />
                  {field.hint ? <p className="mt-1 text-xs text-slate-500">{field.hint}</p> : null}
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
