"use client";

import { useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { createSupplier, updateSupplier, type Supplier, type SupplierPayload } from "@/lib/api/suppliers";
import { isValidOptionalInteger, parseOptionalInteger } from "@/lib/format/number";

type FormState = {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  lead_time_days: string;
};

const EMPTY: FormState = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  lead_time_days: "",
};

function fromSupplier(supplier: Supplier): FormState {
  return {
    name: supplier.name,
    contact_person: supplier.contact_person ?? "",
    phone: supplier.phone ?? "",
    email: supplier.email ?? "",
    address: supplier.address ?? "",
    lead_time_days: supplier.lead_time_days === null ? "" : String(supplier.lead_time_days),
  };
}

export function SupplierFormDialog({
  open,
  onOpenChange,
  supplier,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
  onSaved: (supplier: Supplier) => void;
}) {
  // Mounted only while open (see the caller), so the initial value IS the reset.
  const [form, setForm] = useState<FormState>(() =>
    supplier ? fromSupplier(supplier) : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);


  function setField(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const errors: Partial<Record<keyof FormState, string>> = {};
    const name = form.name.trim();
    if (!name) errors.name = "กรุณากรอกชื่อผู้จำหน่าย";
    if (!isValidOptionalInteger(form.lead_time_days)) {
      errors.lead_time_days = "ระยะเวลาส่งของต้องเป็นจำนวนเต็ม (วัน) หรือเว้นว่างไว้";
    }
    setFieldError(errors);
    if (Object.keys(errors).length > 0) return;

    const payload: SupplierPayload = {
      name,
      contact_person: form.contact_person.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      lead_time_days: parseOptionalInteger(form.lead_time_days),
    };

    setSaving(true);
    try {
      const saved = supplier
        ? await updateSupplier(supplier.id, payload)
        : await createSupplier(payload);
      onSaved(saved);
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{supplier ? "แก้ไขผู้จำหน่าย" : "เพิ่มผู้จำหน่าย"}</DialogTitle>
          <DialogDescription>ช่องที่มี * ต้องกรอก</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="supplier-name">ชื่อผู้จำหน่าย *</Label>
              <Input
                id="supplier-name"
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
                disabled={saving}
                aria-invalid={Boolean(fieldError.name)}
              />
              {fieldError.name ? <p className="mt-1 text-xs text-red-600">{fieldError.name}</p> : null}
            </div>

            <div>
              <Label htmlFor="supplier-contact">ผู้ติดต่อ</Label>
              <Input
                id="supplier-contact"
                value={form.contact_person}
                onChange={(event) => setField("contact_person", event.target.value)}
                disabled={saving}
              />
            </div>

            <div>
              <Label htmlFor="supplier-phone">เบอร์โทร</Label>
              <Input
                id="supplier-phone"
                inputMode="tel"
                value={form.phone}
                onChange={(event) => setField("phone", event.target.value)}
                disabled={saving}
              />
            </div>

            <div>
              <Label htmlFor="supplier-email">อีเมล</Label>
              <Input
                id="supplier-email"
                type="email"
                value={form.email}
                onChange={(event) => setField("email", event.target.value)}
                disabled={saving}
              />
            </div>

            <div>
              <Label htmlFor="supplier-lead">ระยะเวลาส่งของ (วัน)</Label>
              <Input
                id="supplier-lead"
                inputMode="numeric"
                value={form.lead_time_days}
                onChange={(event) => setField("lead_time_days", event.target.value)}
                disabled={saving}
                aria-invalid={Boolean(fieldError.lead_time_days)}
              />
              {fieldError.lead_time_days ? (
                <p className="mt-1 text-xs text-red-600">{fieldError.lead_time_days}</p>
              ) : null}
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="supplier-address">ที่อยู่</Label>
              <Textarea
                id="supplier-address"
                rows={3}
                value={form.address}
                onChange={(event) => setField("address", event.target.value)}
                disabled={saving}
              />
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
