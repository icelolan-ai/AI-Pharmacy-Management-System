"use client";

import { useEffect, useState } from "react";

import { ErrorState } from "@/components/common/ErrorState";
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
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { createMedicine, updateMedicine, type Medicine, type MedicinePayload } from "@/lib/api/medicines";
import { isValidOptionalInteger, parseOptionalInteger } from "@/lib/format/number";
import { isValidMoney, normalizeMoneyInput } from "@/lib/format/money";

type FormState = {
  name: string;
  strength: string;
  dosage_form: string;
  manufacturer: string;
  category: string;
  barcode: string;
  selling_price: string;
  reorder_point: string;
};

const EMPTY: FormState = {
  name: "",
  strength: "",
  dosage_form: "",
  manufacturer: "",
  category: "",
  barcode: "",
  selling_price: "",
  reorder_point: "",
};

function fromMedicine(medicine: Medicine): FormState {
  return {
    name: medicine.name,
    strength: medicine.strength ?? "",
    dosage_form: medicine.dosage_form ?? "",
    manufacturer: medicine.manufacturer ?? "",
    category: medicine.category ?? "",
    barcode: medicine.barcode ?? "",
    selling_price: medicine.selling_price ?? "",
    reorder_point: medicine.reorder_point === null ? "" : String(medicine.reorder_point),
  };
}

/** Add or edit a medicine. `canSetPrice` is false for staff: the price field is
 *  not rendered at all and never sent. */
export function MedicineFormDialog({
  open,
  onOpenChange,
  medicine,
  canSetPrice,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medicine?: Medicine | null;
  canSetPrice: boolean;
  onSaved: (medicine: Medicine) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(medicine ? fromMedicine(medicine) : EMPTY);
      setError(null);
      setFieldError({});
    }
  }, [open, medicine]);

  function setField(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validate(): MedicinePayload | null {
    const errors: Partial<Record<keyof FormState, string>> = {};
    const name = form.name.trim();
    if (!name) errors.name = "กรุณากรอกชื่อยา";

    if (canSetPrice) {
      const price = form.selling_price.trim();
      if (!price) errors.selling_price = "กรุณากรอกราคาขาย";
      else if (!isValidMoney(price)) errors.selling_price = "ราคาขายต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง";
    }

    if (!isValidOptionalInteger(form.reorder_point)) {
      errors.reorder_point = "จุดสั่งซื้อต้องเป็นจำนวนเต็ม หรือเว้นว่างไว้";
    }

    setFieldError(errors);
    if (Object.keys(errors).length > 0) return null;

    const payload: MedicinePayload = {
      name,
      strength: form.strength.trim() || null,
      dosage_form: form.dosage_form.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      category: form.category.trim() || null,
      barcode: form.barcode.trim() || null,
      reorder_point: parseOptionalInteger(form.reorder_point),
    };
    if (canSetPrice) {
      payload.selling_price = normalizeMoneyInput(form.selling_price);
    }
    return payload;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const payload = validate();
    if (!payload) return;

    setSaving(true);
    try {
      const saved = medicine
        ? await updateMedicine(medicine.id, payload)
        : await createMedicine(payload);
      onSaved(saved);
      onOpenChange(false);
    } catch (submitError) {
      // Show the backend's Thai message as-is.
      setError(submitError instanceof ApiError ? submitError.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  const fields: { key: keyof FormState; label: string; required?: boolean; hint?: string }[] = [
    { key: "name", label: "ชื่อยา", required: true },
    { key: "strength", label: "ความแรง", hint: "เช่น 500 mg" },
    { key: "dosage_form", label: "รูปแบบ", hint: "เช่น เม็ด แคปซูล น้ำเชื่อม" },
    { key: "manufacturer", label: "ผู้ผลิต" },
    { key: "category", label: "หมวดหมู่" },
    { key: "barcode", label: "บาร์โค้ด" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{medicine ? "แก้ไขข้อมูลยา" : "เพิ่มยาใหม่"}</DialogTitle>
          <DialogDescription>ช่องที่มี * ต้องกรอก</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key} className={field.key === "name" ? "sm:col-span-2" : undefined}>
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required ? " *" : ""}
                </Label>
                <Input
                  id={field.key}
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

            {canSetPrice ? (
              <div>
                <Label htmlFor="selling_price">ราคาขาย (บาท) *</Label>
                <Input
                  id="selling_price"
                  inputMode="decimal"
                  value={form.selling_price}
                  onChange={(event) => setField("selling_price", event.target.value)}
                  disabled={saving}
                  aria-invalid={Boolean(fieldError.selling_price)}
                />
                {fieldError.selling_price ? (
                  <p className="mt-1 text-xs text-red-600">{fieldError.selling_price}</p>
                ) : null}
              </div>
            ) : null}

            <div>
              <Label htmlFor="reorder_point">จุดสั่งซื้อ</Label>
              <Input
                id="reorder_point"
                inputMode="numeric"
                value={form.reorder_point}
                onChange={(event) => setField("reorder_point", event.target.value)}
                disabled={saving}
                aria-invalid={Boolean(fieldError.reorder_point)}
              />
              {fieldError.reorder_point ? (
                <p className="mt-1 text-xs text-red-600">{fieldError.reorder_point}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">เว้นว่างไว้ = ไม่เตือนยาตัวนี้</p>
              )}
            </div>
          </div>

          {error ? <ErrorState message={error} /> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
