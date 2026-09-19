# Web Dashboard Implementation Spec — Phase 5

**เจ้าของเอกสาร:** Chat C — Web Dashboard
**อนุมัติโดย:** Chat A (`decision-A-phase5-answers.md` 18 ก.ย. 2569)
**ฉบับ:** 3.0 (ฉบับสมบูรณ์ — แก้ครบทั้ง 8 รายการตามข้อ 6 ของคำวินิจฉัย)
**วันที่:** 18 กันยายน 2569
**ยึดตาม:** D10 · D11 · D13 · D14 · D15 · D16 · D17 · D18 · **D19 · D20 · D21 · D22 · D23** · Q1 · Q2 · Q4
**แหล่งอ้างอิงชื่อฟิลด์:** `docs/03-api-spec.md` และ `docs/03-api-openapi.json` — **เอกสาร 2 ฉบับนี้เป็น Source of Truth ของชื่อฟิลด์ ห้ามเดา**

---

## บันทึกการแก้ไขจากฉบับที่ 2

| # | รายการที่ Chat A สั่งแก้ | แก้แล้วที่ |
|---|---|---|
| 1 | `invoice_quantity` / `received_quantity` → **`quantity_invoiced` / `quantity_actual`** | 5.5 · 5.10 |
| 2 | ตัด `has_quantity_mismatch` → ใช้ `status === 'discrepancy'` · เพิ่ม `'discrepancy'` เข้า `PurchaseStatus` | 5.5 · 5.7 |
| 3 | `AdjustmentInput` → `{ transaction_type, quantity_change, reason }` + ตารางแปลงเหตุผล | 5.3 |
| 4 | ตัด `last_supplier_name` / `last_unit_cost` ออกจาก `LowStockRow` | 5.6 |
| 5 | ตัด `entity_label` → ใช้ `table_name` + `record_id` + `old_value`/`new_value` | 5.7 |
| 6 | ตัด `must_change_password` และข้อความบังคับเปลี่ยนรหัสผ่าน (D22) · คง U-6 | 5.8ก |
| 7 | แก้ข้อ 5.0.6 และชุดทดสอบ D18 ให้ตรงกับ **D19** (Backend ส่ง 12 · หน้าจอแสดง 11) | 5.0.6 · 5.10 |
| 8 | ใส่ D19–D22 ลงในเอกสาร | ข้อ 0 |

> **แก้เพิ่มโดย Chat A ตอนบันทึกเข้า Repository:** ข้อ 5.0.13 เปลี่ยนเป็น `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ให้ตรงกับ `web/.env.local` จริง · เพิ่ม **ภาคผนวก D23** ท้ายเอกสาร

---

# 0. คำตัดสินใจที่เอกสารนี้ยึด

| # | เรื่อง | สาระ |
|---|---|---|
| **D10** | ขายได้เมื่อ | `expiry_date > วันนี้ (เวลาไทย)` |
| **D11** | สิทธิ์ | staff ไม่เห็นต้นทุนและมูลค่า · แก้ราคา/ส่วนลดไม่ได้ |
| **D15** | หน้าตา | Tailwind CSS + shadcn/ui |
| **D16** | วันหมดอายุ | กรอกเดือน/ปี → เก็บวันสุดท้ายของเดือน · แสดงกลับเป็นเดือน/ปี พ.ศ. |
| **D17** | ข้อมูลร้าน | เก็บในฐานข้อมูล ไม่ฮาร์ดโค้ด |
| **D18** | การขายกับสิ้นเดือน | EXP `09/2569` → เก็บ `2026-09-30` → **ขายได้ถึง 29 ก.ย. 2569** · หน้าจอต้องเขียน `ขายได้ถึง <วันก่อนวันสุดท้ายของเดือน>` |
| **D19** | **นิยาม "เหลือกี่วัน"** | Backend เป็นเจ้าของ `expiry_date` และ `risk_level` · `days_remaining` ที่ API คืน = **`expiry_date − วันนี้` (ค่าดิบ)** · **ตัวเลขที่ผู้ใช้เห็น = `days_remaining − 1`** แปลงที่เดียวใน `lib/format/expiry.ts` · **ห้ามหน้าไหนแสดงค่าดิบ** · `risk_level` ยังคิดจากค่าดิบของ Backend (30/90/180) ไม่ต้องแก้ |
| **D20** | `GET /reports/inventory-value` | **owner เท่านั้น** (ยึด D11 ทับตาราง 7.2 เดิมของ Phase 3) |
| **D21** | ใบเสร็จกับข้อมูลร้าน | ใช้ข้อมูลร้าน **ปัจจุบัน** เสมอ ไม่เก็บสำเนา ณ วันขาย — เป็นพฤติกรรมที่ตั้งใจของ MVP ไม่ใช่บั๊ก |
| **D22** | บังคับเปลี่ยนรหัสผ่านครั้งแรก | **ไม่ทำใน Phase 5** · มีเฉพาะ U-6 (เปลี่ยนรหัสผ่านของตัวเอง) · **ห้ามมีข้อความบังคับเปลี่ยนรหัสผ่านบนหน้าจอใด ๆ** · ยกนโยบายรหัสผ่านทั้งชุดไป Phase 10 |
| **D23** | ปรับ Stock พร้อมกัน | `POST /lots/{id}/adjustments` รับฟิลด์ `quantity_before` เพิ่ม → ไม่ตรงกับของจริง = 409 (ดูภาคผนวกท้ายเอกสาร) |
| **Q1 · Q2 · Q4** | ใบเสร็จ | A5 แนวตั้ง · ใช้คำว่า "ใบเสร็จรับเงิน" เท่านั้น · แสดง Lot/EXP |

## ลำดับงาน (ตาม Q-C1)

```
5.1 ✅ → 5.2 ✅ → 5.3 ✅ → 5.8ข ✅ (ข้อมูลร้าน) → 5.6 → 5.4 → 5.5 → 5.7 → 5.8ก (ผู้ใช้)

สลับ 5.6 ขึ้นก่อน 5.4 (Chat A, 19 ก.ย. 2569): ใบเสร็จในงาน 5.4 ต้องใช้ข้อมูลร้านจริง
ซึ่งเจ้าของร้านยังไม่ได้กรอก · งาน 5.6 ไม่ต้องใช้ จึงทำก่อนได้
```

---

# 5.0 ภาพรวมสถาปัตยกรรมฝั่งเว็บ

## 5.0.1 โครงสร้างโฟลเดอร์ `web/`

```
web/
├── .env.local.example · next.config.ts · tailwind.config.ts · components.json · package.json
└── src/
    ├── app/
    │   ├── layout.tsx · globals.css · page.tsx        ← เปลี่ยนเส้นทางตาม role
    │   ├── (auth)/login/page.tsx
    │   ├── (app)/
    │   │   ├── layout.tsx                              ← AppShell + ยามเฝ้าสิทธิ์
    │   │   ├── dashboard/page.tsx
    │   │   ├── sell/page.tsx
    │   │   ├── receiving/page.tsx · receiving/[id]/page.tsx
    │   │   ├── stock/page.tsx · stock/[id]/page.tsx
    │   │   ├── expiry/page.tsx
    │   │   ├── reports/expired/page.tsx
    │   │   ├── reports/low-stock/page.tsx
    │   │   ├── reports/inventory-value/page.tsx        ← owner เท่านั้น (D20)
    │   │   ├── suppliers/page.tsx · suppliers/[id]/page.tsx
    │   │   ├── history/sales/page.tsx · history/sales/[id]/page.tsx
    │   │   ├── history/purchases/page.tsx · history/purchases/[id]/page.tsx
    │   │   ├── audit/page.tsx                          ← owner เท่านั้น
    │   │   ├── account/password/page.tsx               ← U-6 เปลี่ยนรหัสผ่านตัวเอง (ทุก role)
    │   │   └── settings/
    │   │       ├── store/page.tsx                      ← owner เท่านั้น (D17 · งาน 5.8ข)
    │   │       └── users/page.tsx                      ← owner เท่านั้น (งาน 5.8ก)
    │   └── (print)/
    │       ├── layout.tsx
    │       └── print/sale/[id]/page.tsx                ← A5 (Q1)
    │           print/purchase/[id]/page.tsx            ← A4
    │
    ├── components/
    │   ├── ui/          ← shadcn/ui ล้วน ห้ามแก้มือ
    │   ├── layout/      ← AppShell · TopBar · SideNav · UserMenu · GlobalSearch
    │   ├── common/      ← ข้อ 5.0.10
    │   ├── sell/ · receiving/ · stock/ · dashboard/ · reports/ · suppliers/
    │   ├── users/ · store/ · account/
    │   └── print/       ← SaleReceipt · PurchaseNote · PrintHelpNote
    │
    ├── lib/
    │   ├── supabase/client.ts
    │   ├── api/client.ts · medicines.ts · suppliers.ts · lots.ts · purchases.ts
    │   │        · sales.ts · reports.ts · audit.ts · users.ts · store.ts · account.ts
    │   ├── auth/session-provider.tsx · auth/permissions.ts
    │   ├── store/store-provider.tsx
    │   ├── format/money.ts · date.ts · expiry.ts · number.ts
    │   ├── hooks/use-api.ts · use-mutation.ts · use-debounced.ts
    │   │        · use-hotkey.ts · use-local-draft.ts
    │   └── constants.ts    ← ข้อความไทย · เกณฑ์ความเสี่ยง · ตารางแปล table_name/action
    └── types/api.ts · types/domain.ts · types/ui.ts
```

**หลักการ:** ทุกการเรียก Backend ผ่าน `lib/api/*` เท่านั้น — **ห้าม `fetch()` ในไฟล์ component**

## 5.0.2 Session และ Token

```
signInWithPassword() → Supabase เก็บ session ใน localStorage
  → SessionProvider เรียก GET /api/v1/me → { id, email, full_name, role, is_active }
  → React Context → useSession()
```

- **ทุกหน้าเป็น Client Component** · **ห้ามใช้ `@supabase/ssr` · ห้ามใช้ middleware ทำยามเฝ้าประตู · ห้ามสร้าง API Route ใน Next.js เป็นตัวกลาง** (กฎข้อ 10)
- ยามเฝ้าประตูอยู่ที่ `(app)/layout.tsx` · ระหว่างยังไม่รู้ผลให้แสดงโครงกระดูก ไม่ใช่หน้าเปล่า
- `role` ใช้ซ่อน/แสดงเท่านั้น ตัวจริงคือ Backend ที่ตอบ 403
- 401 → `signOut()` แล้ว redirect ไป `/login?next=` พร้อม `เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง` (ตาม commit `5b9474e` ที่อนุมัติแล้ว)

```ts
export type Role = 'owner' | 'pharmacist' | 'staff';
export interface SessionUser {
  id: string; email: string; full_name: string; role: Role; is_active: boolean;
}
```

## 5.0.3 การเรียก API แบบรวมศูนย์

```ts
export class ApiError extends Error {
  code: ApiErrorCode; details?: unknown; status: number;
}
export type ApiErrorCode =
  | 'VALIDATION_ERROR' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'INSUFFICIENT_STOCK' | 'DUPLICATE' | 'INVALID_STATE' | 'INTERNAL_ERROR'
  | 'NETWORK';                                   // ของฝั่งเว็บเอง

export async function apiFetch<T>(
  path: string,
  init?: { method?: 'GET'|'POST'|'PATCH'|'PUT'|'DELETE'; body?: unknown; signal?: AbortSignal }
): Promise<T>;
```

**กติกาที่ยืนยันแล้ว (B-1 · B-2 · B-3 · B-12):**
- **Response สำเร็จไม่มีกล่อง `data` ครอบ** — คืนวัตถุตรง ๆ
- รายการแบ่งหน้าคืน `{ items, total, limit, offset }` · `limit` สูงสุด 200 · **เว็บใช้ 25**
- ชื่อฟิลด์เป็น **snake_case** · เงินเป็น **string 2 ตำแหน่ง** · วันที่ `YYYY-MM-DD` · เวลาเป็น ISO 8601 พร้อม timezone · ID เป็น UUID
- Error: `{"error":{"code","message","details"}}` — **ใช้ `message` ของ Backend แสดงตรง ๆ เพราะเป็นภาษาไทยอยู่แล้ว ห้ามเขียนทับ**
- `INSUFFICIENT_STOCK.details` มี `medicine_id` / `requested` / `available` → ใช้ชี้ไปที่การ์ดรายการนั้นในหน้าขาย
- เชื่อมต่อไม่ได้ → `NETWORK` + `เชื่อมต่อไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่`

```ts
export interface Paginated<T> { items: T[]; total: number; limit: number; offset: number; }
```

> **หมายเหตุบังคับ:** ก่อนเขียน `types/api.ts` ให้ยึด `docs/03-api-openapi.json` ที่ Claude Code export เป็นหลัก — ชื่อฟิลด์ในเอกสารนี้เป็นค่าที่ Chat A ยืนยันแล้ว แต่ถ้าขัดกับ OpenAPI ให้ยึด OpenAPI และรายงาน Chat A

> **กฎชี้ขาดชื่อฟิลด์ (Chat A, 19 ก.ย. 2569):** **ถ้าสเปกขัดกับ OpenAPI ให้ยึด OpenAPI เสมอ และแก้สเปกให้ตรง ห้ามเปลี่ยนชื่อฟิลด์ใน Backend** — `docs/03-api-openapi.json` คือ Source of Truth เพียงแหล่งเดียวของชื่อฟิลด์ เอกสารนี้เป็นฝ่ายปรับตาม

## 5.0.4 สถานะโหลด / ว่าง / ผิดพลาด

```ts
export function useApi<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: unknown[],
  opts?: { enabled?: boolean }
): { data?: T; error?: ApiError; isLoading: boolean; isRefreshing: boolean; reload: () => void };

export function useMutation<TArg, TRes>(fn: (arg: TArg) => Promise<TRes>):
  { run: (arg: TArg) => Promise<TRes | undefined>; isRunning: boolean; error?: ApiError; reset: () => void };
```

| สถานะ | สิ่งที่แสดง |
|---|---|
| โหลดครั้งแรก | `<SkeletonTable>` / `<SkeletonCards>` — **ห้ามวงกลมหมุนกลางจอ** |
| โหลดซ้ำ | ข้อมูลเดิมอยู่ + แถบเส้นบางด้านบน — **ห้ามบังทั้งหน้า** |
| ว่าง | `<EmptyState>` ข้อความตามรายหน้า |
| ผิดพลาด | `<ErrorState>` + `error.message` + ปุ่ม `ลองใหม่` |

**ข้อผิดพลาดของการเขียน ห้ามใช้ `<ErrorState>` ทั้งหน้า** ต้องแสดงในกล่องยืนยันหรือการ์ดนั้น

## 5.0.5 การซ่อนข้อมูลตาม Role

```ts
export type Ability =
  | 'view_cost' | 'view_inventory_value' | 'edit_price'
  | 'manage_medicines' | 'manage_suppliers' | 'receive_goods' | 'adjust_stock'
  | 'view_dashboard' | 'view_history' | 'view_audit'
  | 'manage_users' | 'manage_store';
export function can(role: Role, ability: Ability): boolean;
```

| Ability | owner | pharmacist | staff |
|---|:---:|:---:|:---:|
| view_cost | ✅ | ✅ | ❌ |
| **view_inventory_value** (D20 — Backend บังคับ 403 ด้วย) | ✅ | ❌ | ❌ |
| edit_price | ✅ | ✅ | ❌ |
| manage_medicines · manage_suppliers | ✅ | ✅ | ❌ |
| receive_goods · adjust_stock | ✅ | ✅ | ❌ |
| view_dashboard · view_history | ✅ | ✅ | ❌ |
| view_audit · manage_users · manage_store | ✅ | ❌ | ❌ |

**บังคับ 3 ระดับ:** เมนู (ซ่อนหายไปเลย ไม่ใช่สีเทา · กลุ่ม ⚙️ ตั้งค่า เห็นเฉพาะ owner) → หน้า (`🔒 หน้านี้สำหรับเจ้าของร้านเท่านั้น` + ปุ่มกลับ **ห้ามแสดงตารางเปล่า**) → คอลัมน์/องค์ประกอบ (`<RequireAbility>` ครอบทั้งคอลัมน์รวมหัวตาราง **ห้ามแสดง `***`**)

## 5.0.6 วันหมดอายุ — D16 + D18 + **D19**

### กฎที่ยึด

```
กรอก 09 / 2569
  → D16  เก็บวันสุดท้ายของเดือน      expiry_date = 2026-09-30
  → D10  ขายได้เมื่อ expiry_date > วันนี้
  → D18  ⇒ ขายได้ถึง 29 ก.ย. 2569 · ขายไม่ได้ตั้งแต่ 30 ก.ย. 2569 00:00 น. เวลาไทย
  → D19  Backend ส่ง days_remaining = 12  (ณ 18 ก.ย. 2569 — ค่าดิบ)
         หน้าจอแสดง 12 − 1 = "เหลือ 11 วัน · ขายได้ถึง 29 ก.ย. 2569"
```

| วันนี้ | `days_remaining` จาก API | หน้าจอแสดง | ขายได้ไหม |
|---|---:|---|:---:|
| 18 ก.ย. 69 | 12 | `🔴 เหลือ 11 วัน · ขายได้ถึง 29 ก.ย. 2569` | ✅ |
| 29 ก.ย. 69 | 1 | `🔴 ขายได้ถึงวันนี้ (29 ก.ย. 2569) — วันสุดท้าย` | ✅ |
| 30 ก.ย. 69 | 0 | `⛔ ขายไม่ได้แล้ว (ขายได้ถึง 29 ก.ย. 2569)` | ❌ |
| 5 ต.ค. 69 | −5 | `⛔ ขายไม่ได้แล้ว (ขายได้ถึง 29 ก.ย. 2569 · ผ่านมาแล้ว 6 วัน)` | ❌ |

### ฟังก์ชัน

```ts
// lib/format/date.ts
export const TZ = 'Asia/Bangkok';
export function todayBangkok(): Date;
export function beYear(ce: number): number;
export function formatDateBE(iso: string): string;         // '17 ก.ย. 2569'
export function formatDateNumericBE(iso: string): string;  // '17/09/2569'
export function formatDateTimeBE(iso: string): string;     // '17 ก.ย. 2569 14:22'
export function formatExpiryBE(iso: string): string;       // '2027-06-30' → '06/2570'
export function monthYearBEToISO(month: number, yearBE: number): string;
//   (6,2570) → '2027-06-30'  ·  (2,2571) → '2028-02-29'
export function isoToMonthYearBE(iso: string): { month: number; yearBE: number };

// lib/format/expiry.ts  ★ จุดเดียวที่บังคับใช้ D18 + D19 ทั้งระบบ
/** ค่าดิบแบบเดียวกับที่ Backend ส่ง: expiry_date − วันนี้ */
export function rawDaysRemaining(expiryIso: string): number;
/** ★ D19 — ตัวเลขที่ผู้ใช้เห็น = ค่าดิบ − 1 · รับได้ทั้งค่าจาก API และคำนวณเองเมื่อ API ไม่ส่งมา */
export function daysLeftToSell(expiryIso: string, apiDaysRemaining?: number): number;
//   daysLeftToSell('2026-09-30', 12) === 11
//   daysLeftToSell('2026-09-30')     === 11   (คำนวณเองเมื่อ API ไม่ส่ง)
/** วันขายได้วันสุดท้าย = expiry_date − 1 วัน */
export function lastSellableDate(expiryIso: string): string;   // '2026-09-30' → '2026-09-29'
/** ขายได้ไหม (D10) — expiry_date > วันนี้ */
export function isSellable(expiryIso: string): boolean;

export type RiskLevel = 'critical' | 'high_risk' | 'warning' | 'normal' | 'expired';
/** ★ คิดจาก "ค่าดิบ" ตาม D19 เพื่อให้ตรงกับ Backend — ใช้เป็นตัวสำรองเท่านั้น */
export function riskFromExpiry(expiryIso: string): RiskLevel;  // ≤30 / 31–90 / 91–180 / >180 / ขายไม่ได้แล้ว

/** ข้อความมาตรฐาน — ห้ามเขียนเองในแต่ละหน้า */
export function sellableUntilText(expiryIso: string): string;  // 'ขายได้ถึง 29 มิ.ย. 2570'
export function expiryHelperText(expiryIso: string): string;
//  'หมดอายุ 30 มิ.ย. 2570 · ขายได้ถึง 29 มิ.ย. 2570 (อีก 3 ปี 9 เดือน)'
export function humanRemaining(expiryIso: string, apiDaysRemaining?: number): string;
//  ≤60 วัน → 'เหลือ 11 วัน' · >60 วัน → 'เหลือ 2 เดือน' / 'เหลือ 1 ปี 9 เดือน'
//  0 → 'ขายได้ถึงวันนี้ — วันสุดท้าย' · <0 → 'ขายไม่ได้แล้ว (ผ่านมา 6 วัน)'

export const RISK_META: Record<RiskLevel, { label: string; icon: string; className: string }>;
```

### กฎเหล็ก 9 ข้อ
1. **ห้ามใช้ `new Date()` ตรง ๆ ในไฟล์ component** ต้องผ่าน `todayBangkok()`
2. หน้าจอแสดง **พ.ศ.** ทุกจุด · ส่ง Backend เป็น ค.ศ. `YYYY-MM-DD` เสมอ
3. ช่องวันหมดอายุเป็น **2 ช่องแยก เดือน / ปี** (`<MonthYearInput>`) ห้ามใช้ date picker มาตรฐาน
4. ช่องปีรับ พ.ศ. 4 หลัก · พิมพ์ 2 หลักเติม `25` ให้ตอนออกจากช่อง
5. **ห้ามหน้าไหนคำนวณวันเอง** ต้องเรียกฟังก์ชันใน `lib/format/expiry.ts` เท่านั้น
6. **★ D19 — ห้ามหน้าไหนแสดง `days_remaining` ดิบจาก API** ต้องผ่าน `daysLeftToSell()` / `humanRemaining()` ทุกครั้ง
7. `risk_level` ใช้ค่าจาก Backend ก่อนเสมอ · `riskFromExpiry()` เป็นตัวสำรอง และคิดจากค่าดิบเช่นกัน
8. ทุกจุดที่แสดงวันหมดอายุต้องมีบรรทัด `ขายได้ถึง ...` กำกับ (ในตารางที่แคบให้แสดงเมื่อชี้เมาส์ค้าง)
9. **ห้ามใช้สีอย่างเดียวสื่อความหมาย** ต้องมีไอคอน + ข้อความเสมอ

### `<MonthYearInput>` — ข้อความและการบล็อก

| เงื่อนไข | สี | ข้อความ | บล็อกยืนยันใบรับสินค้า |
|---|---|---|---|
| `isSellable() === false` | 🔴 | `ขายไม่ได้แล้ว — ขายได้ถึง 30 ส.ค. 2569 · รับเข้าคลังไม่ได้ กรุณาตรวจสอบกับผู้ส่งสินค้า` | ✅ **บล็อก** |
| เหลือ ≤ 30 วัน | 🔴 | `หมดอายุ 30 ก.ย. 2569 · ขายได้ถึง 29 ก.ย. 2569 (อีก 11 วัน) — รับเข้าได้ แต่ควรทักท้วงผู้ส่ง` | ไม่บล็อก |
| เหลือ 31–180 วัน | 🟠/🟡 | `หมดอายุ 31 ธ.ค. 2569 · ขายได้ถึง 30 ธ.ค. 2569 (อีก 3 เดือน)` | ไม่บล็อก |
| ปกติ | 🟢 | `หมดอายุ 30 มิ.ย. 2570 · ขายได้ถึง 29 มิ.ย. 2570 (อีก 3 ปี 9 เดือน)` | ไม่บล็อก |
| เกิน 10 ปี | 🟠 | `วันหมดอายุห่างจากวันนี้ 12 ปี ตรวจสอบอีกครั้ง` | ไม่บล็อก |

## 5.0.7 การจัดการเงินแบบ string

**ห้ามใช้ `parseFloat` / `Number()` กับเงินเด็ดขาด**

```ts
export type Money = string;                      // '95.00' เสมอ 2 ตำแหน่ง
export function toSatang(m: Money): number;
export function fromSatang(n: number): Money;
export function addMoney(...m: Money[]): Money;
export function mulQty(price: Money, qty: number): Money;
export function formatMoney(m: Money): string;           // '1,600.00'
export function formatMoneyWithUnit(m: Money): string;   // '1,600.00 บาท'
export function parseMoneyInput(raw: string): Money | null;
```

- คำนวณในหน่วย **สตางค์ (integer)** แล้วแปลงกลับตอนแสดง
- **ยอดที่ Backend คำนวณ (`subtotal` · `total_amount` · `line_total`) ใช้ค่าของ Backend เสมอ** เว็บคำนวณเองได้เฉพาะ "ยอดประมาณการก่อนกดยืนยัน"
- เงินในตารางชิดขวา + `tabular-nums` · คำว่า "บาท" อยู่ที่หัวคอลัมน์

## 5.0.8 ข้อมูลร้าน (D17 · D21)

```ts
export function useStoreProfile(): { store?: StoreProfile; isLoading: boolean; reload(): void };
```
- `StoreProvider` เรียก `GET /api/v1/store` ครั้งเดียวตอนเข้าแอป · หน้าพิมพ์ (แท็บใหม่) เรียกของตัวเองอีกครั้ง
- **D21:** ใบเสร็จดึงข้อมูลร้านปัจจุบันเสมอ — ไม่เก็บสำเนา ณ วันขาย
- ยังไม่ตั้งค่า → หน้าพิมพ์แสดงแถบเหลือง `ยังไม่ได้ตั้งค่าข้อมูลร้าน — ใบเสร็จจะไม่มีหัวกระดาษ` + ลิงก์ไป `/settings/store` (เฉพาะ owner) · **ห้ามพิมพ์ค่าตัวอย่างหลอก ๆ ลงกระดาษ**

## 5.0.9 Design Tokens

```
risk.critical #DC2626 / bg #FEE2E2     risk.high    #EA580C / bg #FFEDD5
risk.warning  #CA8A04 / bg #FEF9C3     risk.normal  #16A34A / bg #DCFCE7
risk.expired  #4B5563 / bg #F3F4F6
brand.primary #16A34A · state.warning #EA580C · state.danger #DC2626 · state.info #2563EB
text.primary #111827 · text.secondary #6B7280
surface.page #F9FAFB · surface.card #FFFFFF · border.base #D1D5DB
```

| class | ใช้กับ | ค่า |
|---|---|---|
| `.text-amount-xl` | ยอดเงินบน Dashboard / กล่องยืนยัน | 32px / 36px bold |
| `.text-page-title` | หัวข้อหน้า | 24px bold |
| `.text-body` | **ตัวหนังสือทั่วไปและในตาราง** | **16px — ห้ามต่ำกว่านี้** |
| `.btn-primary-lg` | ปุ่มยืนยันขาย / รับสินค้า | สูง 48px กว้าง ≥160px |
| `.input-fast` | ช่องกรอกหน้าขาย/รับสินค้า | สูง 48px ตัวอักษร 18px |
| `.table-row-tall` | แถวตาราง | สูง 52px |

ระยะห่าง scale 4px: `1/2/3/4/6/8/12` · ปุ่มที่ทำงานตรงข้ามกันห่าง ≥ `gap-6`

## 5.0.10 Component กลาง (`components/common/`)

| Component | หน้าที่ |
|---|---|
| `<ExpiryCell expiryIso apiDaysRemaining?>` | **จุดเดียวที่แสดงวันหมดอายุทั้งระบบ** — `06/2570` + `<RiskBadge>` + `ขายได้ถึง ...` (D18 · D19) |
| `<RiskBadge level>` | ไอคอน + สี + ข้อความไทย |
| `<MoneyText>` `<QtyText>` | เงิน / จำนวน + หน่วย |
| `<MonthYearInput>` | ช่องเดือน/ปี พ.ศ. + ตัวเตือน (5.0.6) |
| `<RequireAbility ability>` | ซ่อนตาม role |
| `<ConfirmDialog>` | สูตร 4 บรรทัด + **ปุ่มกดไม่ได้ 300ms แรก** + รองรับช่องติ๊กบังคับ |
| `<EmptyState> <ErrorState> <SkeletonTable> <SkeletonCards>` | 4 สถานะมาตรฐาน |
| `<DataTable>` | แถว 52px · กดได้ทั้งแถว · แบ่งหน้า 25 · ซ่อนคอลัมน์ตาม ability |
| `<MedicineSearchInput>` | ค้นยาแบบพิมพ์/ยิงบาร์โค้ด + ↑↓ + Enter (ใช้ร่วม 3 หน้า) |
| `<DateRangeFilter>` | ตัวกรองช่วงวันที่แบบ พ.ศ. |
| `<PrintButton docNo>` | เปิดหน้า `(print)` แท็บใหม่ · ข้อความปุ่มมีเลขที่เอกสาร |
| `<PageHeader>` | หัวข้อหน้า + ปุ่มขวา |

## 5.0.11 shadcn/ui ที่ต้องติดตั้ง

`button · input · label · select · checkbox · radio-group · table · card · dialog · alert-dialog · alert · badge · skeleton · sonner · tabs · dropdown-menu · popover · command · separator · form · tooltip · switch · scroll-area · pagination · collapsible`

## 5.0.12 รายการ Dependency ทั้งหมด (ห้ามมีมากกว่านี้)

| แพ็กเกจ | เหตุผล |
|---|---|
| `next` · `react` · `react-dom` · `typescript` | Stack ที่อนุมัติ |
| `tailwindcss` · `postcss` · `autoprefixer` | Tailwind ที่อนุมัติ (D15) |
| `@supabase/supabase-js` | Supabase Auth ฝั่งเบราว์เซอร์ — Stack เดิม |
| `class-variance-authority` · `clsx` · `tailwind-merge` · `lucide-react` · `@radix-ui/*` · `sonner` | สิ่งที่ `npx shadcn add` ติดตั้งให้เอง |

**ห้ามมีเด็ดขาด:** `@supabase/ssr` · TanStack Query · Zustand · react-hook-form · zod · dayjs · date-fns · decimal.js · Library กราฟ · Library ทำ PDF · Library ทดสอบใด ๆ

> การทดสอบ `lib/format/*` ใช้ `node --test` ที่มากับ Node.js หรือตรวจด้วยมือตามตารางค่าคาดหวังในข้อ 5.1 และ 5.10

## 5.0.13 ตัวแปรสภาพแวดล้อม

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001
```

> **แก้โดย Chat A:** ชื่อตัวแปรต้องเป็น `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ให้ตรงกับ `web/.env.local` จริงที่ใช้มาตั้งแต่งาน 5.1 (ไม่ใช่ `..._ANON_KEY`)

**ห้ามใส่ `service_role` key หรือ AI API key ในฝั่งเว็บ** (กฎข้อ 40) · ข้อมูลร้านอยู่ในฐานข้อมูลตาม D17 ไม่ใช่ `.env`

---

# 5.1 งาน 5.1 — โครงเว็บ + Login + `/me` ✅ ผ่านแล้ว

## รายการต่อยอดที่ต้องทำพร้อมงานถัดไป

| # | สิ่งที่ต้องเพิ่ม |
|---|---|
| 1 | เปลี่ยนเส้นทางที่ `/` — owner → `/dashboard` · pharmacist/staff → `/sell` |
| 2 | `SideNav` กรองด้วย `can()` + **กลุ่ม ⚙️ ตั้งค่า (ข้อมูลร้าน / ผู้ใช้งาน) เห็นเฉพาะ owner** |
| 3 | ยามเฝ้าประตูระดับหน้า + หน้า `🔒 หน้านี้สำหรับเจ้าของร้านเท่านั้น` |
| 4 | ป้าย role มุมขวาบนตลอดเวลา + **เมนู "เปลี่ยนรหัสผ่าน" ใน UserMenu** (U-6 · D22) |
| 5 | ช่องค้นหากลาง + ปุ่มลัด `/` |
| 6 | `apiFetch` + `ApiError` + hook 4 ตัว |
| 7 | `lib/format/*` ครบ โดยเฉพาะ **`expiry.ts` ที่บังคับใช้ D18 + D19** |
| 8 | `lib/store/store-provider.tsx` (D17) |
| 9 | Design tokens + `@media print` |
| 10 | หน้า 404 และหน้าไม่มีสิทธิ์ ภาษาไทย |

## เกณฑ์ทดสอบด้วยมือ (5.1)

| ทำอะไร | ต้องเห็นอะไร |
|---|---|
| Login staff | ไป `/sell` · เมนูมีแค่ ขายยา + คลังยา · ป้าย "พนักงาน" |
| staff พิมพ์ `/dashboard` | หน้าไม่มีสิทธิ์ + ปุ่มกลับ |
| Login owner | ไป `/dashboard` · มีกลุ่ม ⚙️ ตั้งค่า |
| pharmacist ดูเมนู | **ไม่มี** ⚙️ ตั้งค่า |
| ใส่รหัสผิด | `อีเมลหรือรหัสผ่านไม่ถูกต้อง` เท่านั้น |
| ปิด Backend | `เชื่อมต่อไม่ได้ ...` + ปุ่มลองใหม่ |
| token พัง | ถูก `signOut()` แล้วไป `/login` + `เซสชันหมดอายุ ...` |
| ค้น `@supabase/ssr` ใน `package.json` | **ไม่พบ** |
| `monthYearBEToISO(6,2570)` | `'2027-06-30'` |
| `monthYearBEToISO(2,2571)` | `'2028-02-29'` |
| `lastSellableDate('2026-09-30')` | `'2026-09-29'` |
| **`rawDaysRemaining('2026-09-30')` ณ 18 ก.ย. 69** | **`12`** |
| **`daysLeftToSell('2026-09-30', 12)`** | **`11`** |
| **`daysLeftToSell('2026-09-30')` (ไม่ส่งค่า API)** | **`11`** |
| `isSellable('2026-09-30')` ณ 29 / 30 ก.ย. | `true` / **`false`** |
| `sellableUntilText('2027-06-30')` | `'ขายได้ถึง 29 มิ.ย. 2570'` |
| `addMoney('0.10','0.20')` | `'0.30'` |
| `mulQty('45.00', 3)` | `'135.00'` |

---

# 5.2 งาน 5.2 — ยา + ผู้จำหน่าย

## Route และไฟล์

| Route | ไฟล์ | สิทธิ์ |
|---|---|---|
| `/stock` (ปุ่ม "เพิ่มยาใหม่") | `app/(app)/stock/page.tsx` | `manage_medicines` |
| หน้าต่างเพิ่ม/แก้ไขยา | `components/stock/MedicineFormDialog.tsx` | owner, pharmacist |
| `/suppliers` · `/suppliers/[id]` | `app/(app)/suppliers/…` | owner, pharmacist |
| หน้าต่างผู้จำหน่าย | `components/suppliers/SupplierFormDialog.tsx` | owner, pharmacist |

## TypeScript type

```ts
export interface Medicine {
  id: string; name: string;
  strength: string | null; dosage_form: string | null;
  manufacturer: string | null; category: string | null;
  barcode: string | null; unit: string;
  selling_price: Money;
  reorder_point: number | null;     // G-2 — null = ไม่เตือนยาตัวนี้
  is_active: boolean;
  created_at: string; updated_at: string;
}
export interface MedicineCreateInput {
  name: string; strength?: string; dosage_form?: string; manufacturer?: string;
  category?: string; barcode?: string; unit: string;
  selling_price: Money; reorder_point?: number | null;
}
export type MedicineUpdateInput = Partial<MedicineCreateInput> & { is_active?: boolean };

export interface Supplier {
  id: string; name: string;
  contact_person: string | null; phone: string | null;
  email: string | null; address: string | null; is_active: boolean;
}
```

## API และลำดับ

| หน้าจอ | ลำดับ |
|---|---|
| ค้นหายา | `GET /medicines?q=&category=&is_active=&limit=25&offset=` (debounce 300ms + ยกเลิกคำขอเก่า) |
| **ยิงบาร์โค้ด (B-11)** | ค่าที่พิมพ์เป็น **ตัวเลขล้วน ≥ 8 หลัก** → `GET /medicines/by-barcode/{barcode}` ก่อน · **404 → fallback ไป `?q=`** |
| เพิ่ม / แก้ไขยา | `POST /medicines` · `GET /medicines/{id}` → `PATCH /medicines/{id}` |
| ผู้จำหน่าย | `GET /suppliers` · `POST` · `PATCH /suppliers/{id}` |
| ประวัติจากผู้จำหน่ายรายนั้น | `GET /purchases?supplier_id={id}` |

## ฟอร์มยา

| ช่อง | กฎ |
|---|---|
| ชื่อยา * | บังคับ |
| ความแรง | **แสดงตัวหนาในผลค้นหา** |
| รูปแบบ | select: เม็ด / แคปซูล / ขวด / หลอด / ซอง / อื่น ๆ |
| ผู้ผลิต · หมวดหมู่ · บาร์โค้ด | text |
| หน่วยนับ * | ค่าเริ่มต้น `กล่อง` (migration 004 — `medicines.unit`) |
| ราคาขาย * | money 2 ตำแหน่ง · หน่วย `บาท` ในช่อง · **ซ่อนจาก staff** |
| **จุดสั่งซื้อ** | จำนวนเต็ม · **ปล่อยว่างได้** · ข้อความช่วย `เมื่อเหลือน้อยกว่าจำนวนนี้ ระบบจะเตือนว่าใกล้หมด · ปล่อยว่างไว้ = ไม่เตือนยาตัวนี้` |
| เปิดใช้งาน | switch (เฉพาะตอนแก้ไข) |

## สถานะ / ปุ่มลัด
- ว่าง: `ยังไม่มียาในระบบ — เริ่มจากการรับสินค้า หรือเพิ่มยาใหม่`
- ค้นไม่เจอ: `ไม่พบยาที่ตรงกับ "xxx"` + ปุ่ม `เพิ่มยาใหม่` (ถ้ามีสิทธิ์)
- `Ctrl+S` บันทึก · `Esc` ปิด (ถามยืนยันถ้าแก้ไขค้าง)

## เกณฑ์ทดสอบด้วยมือ (5.2)

| ทำอะไร | ต้องเห็นอะไร |
|---|---|
| เพิ่มยาครบทุกช่อง | toast สำเร็จ · ยาโผล่ทันที |
| ไม่กรอกชื่อ | แดงใต้ช่อง ไม่ยิง API |
| บาร์โค้ดซ้ำ | ข้อความไทยจาก Backend (`DUPLICATE`) ไม่ใช่ `Error 409` |
| ตั้งจุดสั่งซื้อ 20 | เปิดใหม่ยังเป็น 20 |
| **ปล่อยจุดสั่งซื้อว่าง** | บันทึกได้ · ยานี้ไม่โผล่ใน low-stock · นับในตัวเลข "ยังไม่ตั้งค่า" |
| ไม่เลือกหน่วยนับ | ได้ `กล่อง` เป็นค่าเริ่มต้น |
| ยิงบาร์โค้ด 13 หลักที่ไม่มีในระบบ | เรียก `by-barcode` → 404 → fallback `?q=` → แสดง `ไม่พบยาที่มีบาร์โค้ดนี้ในระบบ` |
| staff เข้า `/stock` | ไม่มีปุ่มเพิ่มยาใหม่ |
| staff พิมพ์ `/suppliers` | หน้าไม่มีสิทธิ์ |
| พิมพ์ค้นหาเร็ว 5 ตัว | ยิง API ครั้งเดียวหลังหยุดพิมพ์ |

---

# 5.3 งาน 5.3 — คลังยา + รายละเอียดยา + Lot + ปรับ Stock

## Route และไฟล์
`app/(app)/stock/page.tsx` + `StockTable` `StockFilters` · `app/(app)/stock/[id]/page.tsx` + `MedicineSummaryCards` `LotTable` `RecentTransactions` · `components/stock/AdjustStockDialog.tsx` · `lib/api/lots.ts`

## TypeScript type

```ts
export interface StockRow {                      // GET /reports/stock
  medicine_id: string; name: string;
  strength: string | null; category: string | null;
  unit: string;
  available_quantity: number;       // ไม่รวม Lot ที่ขายไม่ได้ตาม D10/D18
  expired_quantity: number;
  lot_count: number;                // D24
  nearest_expiry: string | null;    // D24 — Lot ที่ขายได้และหมดอายุก่อน
  days_remaining: number | null;    // D24 · ★ ค่าดิบ (D19) — ต้องผ่าน daysLeftToSell() ก่อนแสดง
  risk_level: RiskLevel | null;     // D24
  available_value?: Money;          // 🔒 owner/pharmacist เท่านั้น (B-5)
  expired_value?: Money;            // 🔒 เช่นกัน
  reorder_point: number | null;     // B-14 — ต้องคืนมาด้วย รวมค่า null
}
// ★ ไม่มี strength/dosage_form/manufacturer แยกครบใน /reports/stock —
//   มีแค่ strength กับ category · ต้องการมากกว่านี้ให้เรียก GET /medicines/{id}

export interface Lot {
  id: string; medicine_id: string;
  lot_number: string;
  expiry_date: string;              // วันสุดท้ายของเดือน (D16)
  quantity: number;
  unit_cost?: Money;                // 🔒 ซ่อนจาก staff
  received_date: string;
  is_active: boolean;
}

export interface InventoryTransaction {          // GET /lots/{id}/transactions
  id: string; lot_id: string;
  transaction_type: TransactionType;
  quantity_change: number;          // + / −
  quantity_before: number; quantity_after: number;
  reference_no: string | null;      // 'S-26091700123' / 'R-...'
  reason: string | null; note: string | null;
  performed_by_name: string; created_at: string;
}
export type TransactionType =
  | 'purchase' | 'sale'
  | 'adjustment' | 'damage' | 'expired' | 'return' | 'correction';
```

## ★ การปรับ Stock — แก้ตามข้อ B-7 + D23

**Backend รับ "ผลต่าง" ไม่ใช่ "จำนวนที่นับได้"** แต่ **หน้าจอยังกรอก "จำนวนที่นับได้จริง" ตามแบบของ Chat G เหมือนเดิม** — `lib/api/lots.ts` เป็นผู้แปลง

```ts
// สิ่งที่หน้าจอเก็บ
export type AdjustmentReason =
  | 'damaged' | 'stock_count' | 'expired_removal' | 'return_to_supplier' | 'other';

export interface AdjustStockFormValue {
  currentQuantity: number;          // ค่าที่เพิ่ง reload มา
  countedQuantity: number;          // ผู้ใช้กรอก
  reason: AdjustmentReason;
  note?: string;
}

// สิ่งที่ส่งจริงไป POST /lots/{id}/adjustments
export interface AdjustmentRequest {
  transaction_type: Exclude<TransactionType, 'purchase' | 'sale'>;
  quantity_change: number;          // = counted − current  (ต้อง ≠ 0 และผลลัพธ์ห้ามติดลบ)
  quantity_before: number;          // ★ D23 — จำนวนที่หน้าจอเห็นตอนเปิดหน้าต่าง
  reason: string;
}
```

**ตารางแปลงเหตุผล → `transaction_type` (บังคับใช้):**

| เหตุผลบนหน้าจอ | `AdjustmentReason` | `transaction_type` ที่ส่ง |
|---|---|---|
| สินค้าชำรุด/แตกหัก | `damaged` | **`damage`** |
| นับสต็อกแล้วไม่ตรง | `stock_count` | **`correction`** |
| หมดอายุ — นำออกจากชั้น | `expired_removal` | **`expired`** |
| คืนผู้จำหน่าย | `return_to_supplier` | **`return`** |
| อื่น ๆ | `other` | **`adjustment`** |

**กฎกันข้อมูลเปลี่ยนระหว่างเปิดหน้าต่าง (บังคับ — D23):**
1. กดปุ่ม [ปรับ] → **`reload()` ค่าคงเหลือของ Lot นั้นก่อนเปิดหน้าต่างเสมอ** (`GET /lots/{id}`)
2. หน้าต่างแสดง `จำนวนในระบบตอนนี้` จากค่าที่เพิ่งโหลด และส่งค่านั้นเป็น `quantity_before`
3. Backend ตอบ **409 `INVALID_STATE`** (จำนวนเปลี่ยนไป) → แสดง `จำนวนคงเหลือเปลี่ยนไประหว่างที่เปิดหน้าต่างนี้ กรุณาตรวจนับใหม่` แล้ว **โหลดค่าใหม่ทันทีโดยไม่ปิดหน้าต่าง**

## หน้าต่างปรับ Stock
```
จำนวนในระบบตอนนี้   18 กล่อง        ← อ่านอย่างเดียว (เพิ่ง reload)
จำนวนที่นับได้จริง  [ 17 ] กล่อง     ← ผู้ใช้กรอกจำนวนจริง ไม่ใช่ผลต่าง
ผลต่าง              −1 กล่อง (ลดลง)  ← ระบบคำนวณ = counted − current
เหตุผล *            radio 5 ตัวเลือก  ← บังคับ
รายละเอียดเพิ่มเติม [           ]
⚠️ การปรับนี้จะถูกบันทึกในชื่อ "<ผู้ใช้ปัจจุบัน>" และตรวจสอบย้อนหลังได้ ยกเลิกไม่ได้
```
ปุ่มกดไม่ได้จนกว่าจะกรอกจำนวน + เลือกเหตุผล + ผลต่าง ≠ 0 · เลือก `อื่น ๆ` ต้องกรอกข้อความ · **ถ้าผลลัพธ์จะติดลบให้บล็อกตั้งแต่ฝั่งเว็บ**

## ลำดับการเรียก API
- `/stock` → `GET /reports/stock?q=&category=` · ตัวกรอง "Stock ต่ำ" / "ใกล้หมดอายุ" กรองฝั่งเว็บจากผลชุดเดียวกัน
- `/stock/[id]` → ขนาน `GET /medicines/{id}` + `GET /medicines/{id}/lots?include_inactive=true` → แล้ว `GET /lots/{lotId}/transactions` ของ Lot ลำดับ FEFO ที่ 1
- ปรับ Stock → `GET /lots/{id}` (reload) → `POST /lots/{id}/adjustments` → สำเร็จ → ปิด → toast → `reload()` ทั้ง 3 ส่วน

## จุดที่ต้องตรงกับแบบของ Chat G + D18/D19

1. **เรียง Lot ตาม FEFO ใส่เลข 1️⃣2️⃣3️⃣** — เฉพาะ Lot ที่ `isSellable()` และ `quantity > 0` · Lot ที่ขายไม่ได้กองท้ายตาราง ไม่มีเลข
2. **Lot ที่ขายไม่ได้: แถบเทาคาด + ⛔ + `ขายไม่ได้แล้ว (ขายได้ถึง 29 ก.ย. 2569) — ไม่นับรวมในจำนวนที่ขายได้`** และ **ยังมีปุ่ม [ปรับ]**
3. คอลัมน์หมดอายุใช้ `<ExpiryCell>` เท่านั้น
4. การ์ด "ขายได้ X" มีบรรทัด `(ไม่รวม Y กล่องที่ขายไม่ได้แล้ว)` เมื่อ `expired_quantity > 0`
5. คอลัมน์มูลค่า/ต้นทุน **ซ่อนทั้งคอลัมน์รวมหัวตาราง** สำหรับ staff
6. ป้าย ⚠️ `ต่ำกว่าจุดสั่งซื้อ` ใต้ตัวเลขคงเหลือ **เฉพาะยาที่ตั้ง `reorder_point` แล้ว**
7. ทั้งแถวกดได้ · ปุ่ม [ปรับ] ต้อง `stopPropagation`
8. **ทุกตัวเลขจำนวนต้องมีหน่วยกำกับเสมอ** ("18 กล่อง" ไม่ใช่ "18") โดยใช้ `unit` ของยาตัวนั้น

## เกณฑ์ทดสอบด้วยมือ (5.3)

| ทำอะไร | ต้องเห็นอะไร |
|---|---|
| ยาที่มี 3 Lot ขายได้ + 1 Lot ขายไม่ได้ | Lot EXP ใกล้สุดได้เลข 1️⃣ · Lot ที่ขายไม่ได้อยู่ล่างสุดมีแถบเทาคาด |
| **Lot EXP 09/2569 ณ 18 ก.ย. 2569** | `เหลือ 11 วัน · ขายได้ถึง 29 ก.ย. 2569` |
| **Lot เดียวกัน ณ 29 / 30 ก.ย.** | `ขายได้ถึงวันนี้ — วันสุดท้าย` / `⛔ ขายไม่ได้แล้ว` |
| ปรับ 18 → 17 เหตุผล "นับสต็อกแล้วไม่ตรง" | ผลต่าง `−1 กล่อง (ลดลง)` · **Network tab: ส่ง `{transaction_type:"correction", quantity_change:-1, quantity_before:18, reason:"..."}`** · ตารางอัปเดตเป็น 17 · ประวัติขึ้นแถวใหม่ |
| เหตุผล "สินค้าชำรุด/แตกหัก" | ส่ง `transaction_type: "damage"` |
| เหตุผล "หมดอายุ — นำออกจากชั้น" | ส่ง `transaction_type: "expired"` |
| ปรับให้ผลลัพธ์ติดลบ | เว็บบล็อกก่อนยิง API |
| ไม่เลือกเหตุผล / จำนวนเท่าเดิม | ปุ่มกดไม่ได้ + `จำนวนไม่เปลี่ยนแปลง ไม่ต้องบันทึก` |
| **ให้ Lot ถูกขายจากอีกหน้าต่างระหว่างเปิดหน้าต่างปรับ แล้วกดบันทึก** | `จำนวนคงเหลือเปลี่ยนไประหว่างที่เปิดหน้าต่างนี้ กรุณาตรวจนับใหม่` + โหลดค่าใหม่โดยไม่ปิดหน้าต่าง |
| ยาที่ตั้งจุดสั่งซื้อ 20 เหลือ 4 | ป้าย ⚠️ `ต่ำกว่าจุดสั่งซื้อ` |
| ยาที่ไม่ได้ตั้งจุดสั่งซื้อ เหลือ 1 | **ไม่มีป้าย** |
| ดูตัวเลขคงเหลือทุกจุด | มีหน่วยกำกับเสมอ |
| staff เปิด `/stock/[id]` | ไม่มีต้นทุน ไม่มีการ์ดมูลค่า ไม่มีปุ่ม [ปรับ] |

---

# 5.8ข งาน 5.8ข — ข้อมูลร้าน (D17) **← ทำก่อนงาน 5.4 ตาม Q-C1**

## API Contract (A-2 — อนุมัติและสร้างแล้วใน migration 005)

| # | Endpoint | สิทธิ์ | ใช้ทำอะไร |
|---|---|---|---|
| **S-1** | `GET /api/v1/store` | **ทุก role ที่ Login แล้ว** | หัวกระดาษใบเสร็จ/ใบรับสินค้า — **staff ต้องอ่านได้เพราะเป็นคนพิมพ์ใบเสร็จ** |
| **S-2** | `PATCH /api/v1/store` | **owner เท่านั้น** | แก้ไขข้อมูลร้าน |

```jsonc
// S-1  GET /api/v1/store
{
  "id": "uuid",
  "name": "ร้านยาตัวอย่าง",
  "address": "123/45 ถ.ตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพฯ 10110",
  "phone": "02-123-4567",
  "license_no": "ขย.1 12345/2565",
  "tax_id": "0123456789012",
  "updated_at": "2026-09-18T03:10:00+07:00",
  "updated_by_name": "พรเชษฐ์ น้อยกลัด"
}
// ยังไม่เคยตั้งค่า → ฟิลด์ข้อความเป็น null (ไม่ใช่ 404) เพื่อให้แยก "ยังไม่ตั้ง" กับ "เรียกไม่สำเร็จ" ได้

// S-2  PATCH /api/v1/store
// ขอ → { "name"?, "address"?, "phone"?, "license_no"?, "tax_id"? }   ได้ → 200 + วัตถุแบบ S-1
```

**กฎที่ Backend บังคับ**

| # | กฎ |
|---|---|
| 1 | เก็บเป็น **ระเบียนเดียวของร้าน** ในตาราง `store_profile` (unique index บน `((true))`) และ **ออกแบบให้ผูก `pharmacy_id` ได้ภายหลัง** (กฎข้อ 65) |
| 2 | `name` บังคับมีค่าเมื่อตั้งค่าครั้งแรก · ฟิลด์อื่นว่างได้ |
| 3 | การแก้ไขทุกครั้งลง Audit log (`store_profile`) พร้อม `old_value` → `new_value` (กฎข้อ 42) |
| 4 | `GET` อ่านได้ทุก role · `PATCH` เฉพาะ owner (role อื่น 403) |
| 5 | ใช้ `pg_advisory_xact_lock` ก่อน `SELECT ... FOR UPDATE` กัน 2 คนบันทึกพร้อมกัน |

## หน้าจอ `/settings/store` (owner เท่านั้น)

ไฟล์: `app/(app)/settings/store/page.tsx` · `components/store/StoreProfileForm.tsx` · `lib/api/store.ts`

| ช่อง | บังคับ | หมายเหตุบนหน้าจอ |
|---|---|---|
| ชื่อร้าน | ✅ | `แสดงบนหัวใบเสร็จและใบรับสินค้า` |
| ที่อยู่ร้าน | ✅ | รองรับหลายบรรทัด |
| เบอร์โทร | ✅ | |
| เลขที่ใบอนุญาตขายยา | ⚠️ ควรมี | `มาตรฐานร้านยา — แสดงบนใบเสร็จ` |
| เลขประจำตัวผู้เสียภาษี | ไม่บังคับ | |

- **ตัวอย่างหัวกระดาษสด ๆ** ด้านขวาของฟอร์ม อัปเดตตามที่พิมพ์
- **ข้อความใต้ฟอร์ม (D21) ต้องใช้ข้อความนี้เป๊ะ:** `ใบเสร็จจะใช้ข้อมูลร้านล่าสุดเสมอ — ถ้าแก้ที่อยู่ ใบเสร็จเก่าที่พิมพ์ซ้ำจะขึ้นที่อยู่ใหม่`
  **ห้ามมีข้อความที่สื่อว่าเอกสารที่พิมพ์ไปแล้วจะไม่เปลี่ยนตาม** (ความหมายกลับด้านกับ D21)
- แสดง `แก้ไขล่าสุด 18 ก.ย. 2569 10:30 โดย <ชื่อ>` · `Ctrl+S` บันทึก · ออกจากหน้าโดยไม่บันทึก → ถามยืนยัน
- ชื่อร้านนี้ถูกนำไปแสดงที่ `SideNav` แทนข้อความคงที่ · ยังไม่ตั้งค่า → `ยังไม่ได้ตั้งชื่อร้าน` สีเทา + ลิงก์ไป `/settings/store` (เฉพาะ owner) **ห้ามใส่ชื่อร้านตัวอย่างปลอม**

## เกณฑ์ทดสอบด้วยมือ (5.8ข)

| ทำอะไร | ต้องเห็นอะไร |
|---|---|
| owner ตั้งข้อมูลร้านครบ | บันทึกได้ · ตัวอย่างหัวกระดาษตรงกับที่กรอก · ชื่อร้านขึ้นที่ SideNav |
| พิมพ์ใบเสร็จหลังตั้งค่า | หัวกระดาษเป็นข้อมูลจริง |
| แก้ที่อยู่แล้วพิมพ์ใบเสร็จเก่าซ้ำ | ขึ้นที่อยู่ใหม่ (D21 — พฤติกรรมที่ตั้งใจ) |
| ยังไม่ตั้งค่าแล้วพิมพ์ | แถบเหลือง + ลิงก์ · **ไม่มีชื่อร้านหลอกบนกระดาษ** |
| **staff ขายแล้วพิมพ์ใบเสร็จ** | หัวกระดาษครบ (พิสูจน์ว่า S-1 อ่านได้ทุก role) |
| pharmacist พิมพ์ `/settings/store` | `🔒 หน้านี้สำหรับเจ้าของร้านเท่านั้น` |
| pharmacist ยิง `PATCH /store` ตรง | Backend ตอบ 403 |
| แก้ข้อมูลร้านแล้วเปิด `/audit` | เห็น `แก้ไขข้อมูลร้าน` พร้อมค่าเดิม → ค่าใหม่ |

---

# 5.4 งาน 5.4 — ขายยา (FEFO) + ใบเสร็จรับเงิน (A5)

## Route และไฟล์

| Route | ไฟล์ |
|---|---|
| `/sell` | `app/(app)/sell/page.tsx` · `SellSearchBar` `CartItemCard` `FefoLotStrip` `CartSummaryBar` `ConfirmSaleDialog` `SaleSuccessBanner` · `lib/hooks/use-sell-cart.ts` |
| `/print/sale/[id]` | `app/(print)/print/sale/[id]/page.tsx` + `components/print/SaleReceipt.tsx` |

## TypeScript type

```ts
export interface FefoAllocation { lot_id: string; lot_number: string; expiry_date: string; quantity: number; }
export interface FefoPreview {                   // GET /medicines/{id}/fefo-preview?quantity=
  medicine_id: string; requested: number; available: number;
  allocations: FefoAllocation[]; sufficient: boolean;
}
// ★ ชื่อจริงคือ requested / available / allocations / sufficient
//   (ไม่ใช่ requested_quantity / available_quantity / lines / is_sufficient)
export interface CartItem {
  key: string; medicine: Medicine; quantity: number;
  preview?: FefoPreview; previewState: 'idle'|'loading'|'ok'|'error'; errorMessage?: string;
}
export interface SaleCreateInput { items: { medicine_id: string; quantity: number }[]; }

export interface Sale {                          // POST /sales · GET /sales/{id}
  id: string;
  sale_no: string;                  // D26 — 'S-690918-001'
  sale_date: string;
  discount_amount: Money; tax_amount: Money; total_amount: Money;
  sold_by_name: string | null;      // D27 — จาก sales.created_by · null ได้
  items: SaleItem[];
}
export interface SaleItem {       // ★ หนึ่งแถวต่อหนึ่ง LOT ไม่ใช่ยาที่มี lots ซ้อนข้างใน
  medicine_id: string; medicine_name: string | null;
  lot_id: string; lot_number: string; expiry_date: string;
  quantity: number; unit_price: Money; subtotal: Money;
}
// ★ ไม่มี strength · dosage_form · line_total · items[].lots
//   (sale_no และ sold_by_name เพิ่มแล้วตาม D26/D27)
//   เว็บจับกลุ่มเป็น 1 บรรทัดต่อยาเองด้วย groupSaleItems() แล้วเก็บทุก Lot ไว้ให้ใบเสร็จ (Q4)
//   B-8 จึงไม่จำเป็นในทางปฏิบัติ แต่ยังมีทางสำรอง: ถ้าแถวไหนไม่มี lot_number
//   ให้เรียก GET /sales/{id} ซ้ำ

// ★ INSUFFICIENT_STOCK: details เป็น ARRAY ของ { medicine_id, requested, available }
//   (หนึ่งรายการต่อยาที่ไม่พอ) ไม่ใช่ object เดี่ยว
```

## ลำดับการเรียก API

```
ยิงบาร์โค้ด (ตัวเลข ≥8 หลัก) → GET /medicines/by-barcode/{code}  → 404 → fallback GET /medicines?q=
พิมพ์ชื่อ                    → GET /medicines?q=  (debounce 250ms + ยกเลิกคำขอเก่า)
เปลี่ยนจำนวน                 → GET /medicines/{id}/fefo-preview?quantity=N
                               (debounce 350ms · ยกเลิกคำขอเก่าเฉพาะรายการนั้น — C-4)
F2 / Ctrl+Enter → กล่องยืนยัน → Enter → POST /sales
   ★ B-8: POST /sales คืนวัตถุ Sale รูปแบบเดียวกับ GET /sales/{id}
     ถ้า response ไม่มี items[].lots ให้เรียก GET /sales/{id} ต่อทันที (ทางสำรองที่ Chat A อนุมัติ)
```

## กฎที่ห้ามพลาด

| # | กฎ |
|---|---|
| 1 | **โฟกัสช่องค้นหาอัตโนมัติทันทีที่หน้าโหลดเสร็จ และหลังทุกการกระทำ** |
| 2 | เจอบาร์โค้ดตรงตัว 1 รายการ → เพิ่มทันทีจำนวน 1 แล้วล้างช่องค้นหา |
| 3 | **ห้ามเลือกอัตโนมัติเมื่อผลลัพธ์กำกวม** |
| 4 | ยาชื่อเดียวกันคนละความแรง → `⚠️ มี Losartan 2 ความแรง กรุณาตรวจสอบ` |
| 5 | ผลค้นหา: ความแรงและรูปแบบยาเป็น **ตัวหนา** |
| 6 | **ผลค้นหาเรียง: มีของก่อน → ชื่อตามตัวอักษร** (C-3 · "ขายบ่อย" ยกไป Phase 8) |
| 7 | คงเหลือ 0 หรือขายไม่ได้ตาม D18 → แถวสีเทา เลือกไม่ได้ + `ยาหมด` / `ขายไม่ได้แล้ว` |
| 8 | ยาตัวเดิมที่มีในตะกร้า → เพิ่มจำนวนในการ์ดเดิม ไม่สร้างการ์ดใหม่ |
| 9 | ช่องจำนวนของรายการล่าสุดถูกไฮไลต์ (select all) |
| 10 | ช่องจำนวนรับจำนวนเต็มบวกเท่านั้น |
| 11 | **staff: ราคาเป็นตัวหนังสือธรรมดา ไม่มีปุ่มส่วนลด** (D11) |
| 12 | กำลังค้นหา → แถบเส้นบางใต้ช่องค้นหา **ห้ามบังทั้งหน้า** |
| 13 | **เน็ตหลุด → ห้ามล้างตะกร้า** แสดงแถบแดง + `ลองใหม่` |
| 14 | มีของในตะกร้าแล้วจะปิดแท็บ → `beforeunload` ถามยืนยัน |
| 15 | ปุ่มยืนยันปิดใช้งานทันทีที่กด → `กำลังบันทึก...` |
| 16 | ช้าเกิน 5 วินาที → `ยังกำลังบันทึกอยู่ กรุณารอสักครู่ ห้ามปิดหน้าต่าง` |
| 17 | ล้มเหลว → `บันทึกการขายไม่สำเร็จ ยังไม่มีการตัดสต็อก กรุณาลองใหม่` |
| 18 | `INSUFFICIENT_STOCK` → ใช้ `details.medicine_id` ชี้ไปที่การ์ดนั้น + แสดง `requested` / `available` |
| 19 | ปุ่มยืนยันในกล่องยืนยัน **กดไม่ได้ 300ms แรก** |
| 20 | **คำเตือน Lot ใกล้หมดอายุอยู่ในกล่องยืนยันด้วย** ใช้ถ้อยคำ D18/D19: `⚠️ มี 1 รายการที่ตัดจากยาที่ขายได้ถึง 29 ก.ย. 2569 (เหลือ 11 วัน)` |
| 21 | หลังขายสำเร็จย้ำ Lot: `✅ บันทึกแล้ว · หยิบจาก Lot A-2410 (EXP 06/2570)` |
| 22 | **ปุ่มยืนยันกดไม่ได้จนทุกรายการ preview สำเร็จ** (C-4) |

## ปุ่มลัด (C-1)

| ปุ่ม | ทำอะไร |
|---|---|
| `/` | กลับช่องค้นหา (ไม่ทำงานถ้าอยู่ในช่องกรอกแล้ว) |
| **`F2` หรือ `Ctrl+Enter`** | เปิดกล่องยืนยัน — **ต้องเขียนปุ่มลัดทั้งสองไว้บนหน้าจอ** |
| `Enter` ในกล่อง | ยืนยัน (หลัง 300ms) |
| `Esc` | ล้างรายการ (ถามยืนยัน) / ปิดกล่อง |
| `↑ ↓` | เลื่อนในผลค้นหา · `Delete` ลบรายการที่โฟกัส |

**ไม่มี `F1`** (C-1)

## สถานะ
- ว่าง: `🔍 ยิงบาร์โค้ด หรือ พิมพ์ชื่อยาเพื่อเริ่มขาย`
- แถบ Lot โหลด: `กำลังตรวจสอบล็อตที่จะตัด...` (ไม่บล็อกการพิมพ์)
- แถบ Lot ล้มเหลว: `ตรวจสอบล็อตไม่สำเร็จ` + `ลองใหม่`
- เกินจำนวน: `มี Paracetamol เหลือขายได้ 18 กล่อง แต่ระบุ 25 กล่อง`
- ขายไม่ได้: `ยานี้ขายไม่ได้แล้ว (ขายได้ถึง 29 ก.ย. 2569) กรุณาแจ้งเภสัชกรเพื่อนำออกจากชั้น`

## ใบเสร็จรับเงิน — A5 แนวตั้ง (Q1 · Q2 · Q4)

| หัวข้อ | ข้อกำหนด |
|---|---|
| ขนาด | `@page { size: A5 portrait; margin: 10mm }` |
| ชื่อเอกสาร | **"ใบเสร็จรับเงิน" เท่านั้น** — ห้ามคำว่า ใบกำกับภาษี / VAT / ภาษีมูลค่าเพิ่ม ทุกที่ (Q2) |
| หัวกระดาษ | ชื่อร้าน 18px หนา · ที่อยู่ 11px · โทร · เลขที่ใบอนุญาต 10px — **จาก `GET /store`** |
| เนื้อหา | เลขที่บิล (`sale_no` — D26) · ผู้ขาย (`sold_by_name` — D27 · เป็น null ให้ซ่อนทั้งบรรทัด) · วันเวลา พ.ศ. · ชื่อผู้ขาย · รายการยา 12px · **`Lot A-2410 · EXP 06/2570` ใต้ชื่อยาทุกบรรทัด 10px เทา (Q4)** · `2 กล่อง × 45.00 = 90.00` · รวม N รายการ · **รวมทั้งสิ้น 16px หนา** |
| ท้ายกระดาษ | `ขอบคุณที่ใช้บริการ` · `กรุณาเก็บใบเสร็จไว้เป็นหลักฐาน` · `ยาที่ซื้อแล้วไม่รับคืนหรือเปลี่ยน ยกเว้นกรณีสินค้าชำรุดหรือผิดรายการ` · ช่องลงชื่อผู้รับเงิน |
| **ห้ามมี** | ต้นทุน (ทุก role) · ช่องเงินสดรับ/เงินทอน · พื้นหลังสีทึบ |
| สำเนา | พิมพ์จากประวัติการขาย = **สำเนาเสมอ** (`?copy=1`) → ใต้หัวเรื่อง `( สำเนา — พิมพ์ซ้ำ 18 ก.ย. 2569 )` |
| การเปิด | **ห้ามพิมพ์อัตโนมัติหลังขายจบ** — กดปุ่ม `🖨 พิมพ์ใบเสร็จ S-26091700123` เอง แล้วจึงเปิดแท็บใหม่ + `window.print()` |
| ระหว่างเตรียม | ปุ่มเป็น `กำลังเตรียมพิมพ์...` |
| ข้อความช่วยเหลือ | (บนจอ ไม่พิมพ์) `หากเอกสารมี URL ติดมาด้วย ให้ปิด "หัวกระดาษและท้ายกระดาษ" ในหน้าต่างพิมพ์` |
| สิทธิ์ | **staff พิมพ์ได้** — `/print/sale/[id]` เปิดได้ทุก role |

## เกณฑ์ทดสอบด้วยมือ (5.4)

| ทำอะไร | ต้องเห็นอะไร |
|---|---|
| เปิด `/sell` | เคอร์เซอร์อยู่ช่องค้นหาแล้ว |
| พิมพ์บาร์โค้ด + Enter | ยาเข้าตะกร้า 1 · ช่องว่าง · แถบ 📍 ขึ้นใน 1 วินาที |
| ยิงยาตัวเดิมซ้ำ | การ์ดเดิมเป็น 2 |
| ขอ 40 แต่ Lot แรกมี 25 | แถบ 📍 แสดง 2 บรรทัดเรียงตาม EXP |
| กรอกเกินของที่มี | กรอบแดง + `INSUFFICIENT_STOCK` ชี้การ์ดนั้น · ปุ่มยืนยันกดไม่ได้ |
| **เลือกยา EXP 09/2569 ณ 30 ก.ย. 2569** | แถวเทา เลือกไม่ได้ + `ขายไม่ได้แล้ว` |
| **ยาตัวเดียวกัน ณ 29 ก.ย. 2569** | เลือกได้ + `ขายได้ถึงวันนี้` |
| กด F2 แล้ว Enter รัว | ไม่ผ่านภายใน 300ms แรก |
| กด Ctrl+Enter | เปิดกล่องยืนยันเหมือน F2 |
| ตะกร้ามี Lot เหลือ < 90 วัน | กล่องยืนยันมีบรรทัดเตือนพร้อม `ขายได้ถึง ...` และ **เลขวันที่ผ่าน D19 แล้ว** |
| ยืนยันสำเร็จ | แถบเขียว + เลขที่บิล + Lot ที่ต้องหยิบ · ตะกร้าว่าง |
| ปิด Backend แล้วกดยืนยัน | `... ยังไม่มีการตัดสต็อก ...` · **ตะกร้ายังอยู่ครบ** |
| กดยืนยันรัว 5 ครั้ง | เกิดบิลเดียว |
| staff ใช้งาน | ราคาเป็นข้อความ · ไม่มีปุ่มส่วนลด |
| กด `พิมพ์ใบเสร็จ` | แท็บใหม่ A5 · มี Lot+EXP ทุกบรรทัด · **ไม่มีต้นทุน** · **ไม่มีคำว่า VAT** |
| พิมพ์ซ้ำจากประวัติ | มี `( สำเนา — พิมพ์ซ้ำ ... )` |

---

# 5.5 งาน 5.5 — รับสินค้า 2 ขั้นตอน + บันทึกร่าง + ใบรับสินค้า (A4)

## Route และไฟล์
`app/(app)/receiving/page.tsx` · `receiving/[id]/page.tsx` · `ReceivingStepper` `PurchaseHeaderForm` `PurchaseItemCard` `ReviewStep` `DraftBanner` `QuickAddMedicineDialog` · `lib/hooks/use-purchase-draft.ts` · `app/(print)/print/purchase/[id]/page.tsx` + `components/print/PurchaseNote.tsx`

## ★ TypeScript type — แก้ตาม B-4

```ts
export type PurchaseStatus = 'draft' | 'confirmed' | 'discrepancy';   // ★ เพิ่ม discrepancy

export interface PurchaseItemInput {
  medicine_id: string;
  lot_number: string;
  expiry_date: string;              // จาก monthYearBEToISO() (D16)
  quantity_invoiced: number;        // ★ จำนวนตามใบส่งของ
  quantity_actual: number;          // ★ จำนวนที่นับได้จริง
  unit_cost: Money;
}

export interface PurchaseCreateInput {
  supplier_id: string;
  invoice_no: string;
  purchase_date: string;
  invoice_no?: string;              // D28 — ร่างไม่ใส่ก็ได้ แต่ confirm ต้องมี
  discount_amount: Money;           // ส่ง "0.00" ใน Phase 5
  tax_amount: Money;                // ส่ง "0.00" ใน Phase 5
  items: PurchaseItemInput[];
  // ★ ห้ามส่ง subtotal / total_amount — Backend คำนวณเอง
}

export interface PurchaseItem {                  // หนึ่งแถวต่อหนึ่งรายการในใบรับ
  id: string;
  medicine_id: string; medicine_name: string | null;
  quantity_invoiced: number; quantity_actual: number | null;
  unit_cost: Money;
  lot_number: string; expiry_date: string;
  subtotal: Money;                  // ★ ชื่อจริง ไม่ใช่ line_total
}
// ★ ไม่มี strength / dosage_form / manufacturer ในรายการของใบรับ

export interface Purchase {                      // GET /purchases/{id}
  id: string;
  purchase_no: string | null;       // D29 — null ตอนยังเป็น draft
  invoice_no: string | null;        // D28 — บังคับตอน confirm
  status: PurchaseStatus;           // ★ 'discrepancy' = มีรายการที่จำนวนไม่ตรง
  supplier_id: string; supplier_name: string | null;
  purchase_date: string;
  items_subtotal: Money;            // ★ ชื่อจริง ไม่ใช่ subtotal
  discount_amount: Money; tax_amount: Money; total_amount: Money;
  items: PurchaseItem[];
  lots: PurchaseLot[];              // ★ API คืนล็อตที่สร้างจากใบรับนี้มาด้วย
  created_by: string | null;
  created_by_name: string | null;   // D30
  created_at: string;
  confirmed_at: string | null;      // D30 — ใบรับ A4 ใช้วันที่นี้
}

export interface PurchaseLot {
  id: string; purchase_item_id: string | null; medicine_id: string;
  lot_number: string; quantity_received: number; quantity_remaining: number;
  cost_per_unit: Money; expiry_date: string; received_date: string;
  status: string | null;
}
```

**★ ตัวบอกจำนวนไม่ตรง — ไม่มีฟิลด์ `has_quantity_mismatch` อีกต่อไป**

```ts
// lib/api/purchases.ts
export const hasMismatch = (p: Purchase) => p.status === 'discrepancy';
export const itemHasMismatch = (i: PurchaseItem) => i.quantity_invoiced !== i.quantity_actual;
```

## ลำดับการเรียก API
```
เข้า /receiving → GET /purchases?status=draft → มีร่าง → แถบฟ้า [ทำต่อ] [ทิ้งร่าง]
                → GET /suppliers
ขั้นที่ 1: ยังไม่มี id → POST /purchases (ร่าง) → ได้ id → replaceState เป็น /receiving/{id}
          มี id แล้ว  → PUT /purchases/{id}     ← บันทึกร่าง (C-2)
"ตรวจสอบและยืนยัน →" → บันทึกร่างให้เสร็จก่อน แล้วไปขั้นที่ 2
ขั้นที่ 2: ติ๊กช่อง → POST /purchases/{id}/confirm
          → status กลับมาเป็น 'confirmed' หรือ 'discrepancy'
[ทิ้งร่าง] → DELETE /purchases/{id}
```

**การบันทึกร่าง (C-2 — อนุมัติแล้ว):** บันทึกเมื่อ **ออกจากช่อง (blur) + debounce 2 วินาที + ยิงทีละคำขอเป็นคิว** · ป้าย `💾 บันทึกร่างแล้ว` คงเดิม · `Ctrl+S` บังคับบันทึกทันที
**สำรองในเครื่อง:** เก็บร่างลง `localStorage` คู่ขนาน · `PUT` ล้มเหลวแล้วเปิดใหม่ → `กู้ข้อมูลที่กรอกค้างไว้กลับมาแล้ว`

## ขั้นที่ 1 — ช่องและกฎ

| ช่อง | กฎ |
|---|---|
| ผู้จำหน่าย * | `<Select>` + ลิงก์ `+ เพิ่มผู้จำหน่ายใหม่` |
| เลขที่ใบส่งของ * | text |
| วันที่รับ | ค่าเริ่มต้น = วันนี้ (เวลาไทย) แสดง พ.ศ. |
| เลือกยา | `<MedicineSearchInput>` + `+ ยานี้ยังไม่มีในระบบ เพิ่มใหม่` → หน้าต่างซ้อน **โดยไม่ทิ้งหน้ารับสินค้า** |
| Lot/รุ่น * | text |
| **วันหมดอายุ *** | `<MonthYearInput>` ตาม 5.0.6 · **บล็อกไปขั้นที่ 2 เมื่อ `isSellable()` เป็นเท็จ** |
| **จำนวนตามใบส่งของ *** | → `quantity_invoiced` · จำนวนเต็ม > 0 |
| **จำนวนที่นับได้จริง *** | → `quantity_actual` · เติมเท่าใบส่งของอัตโนมัติ แก้ได้ · ไม่ตรง → `⚠️ ขาด 2 กล่อง` / `⚠️ เกิน 2 กล่อง` **ไม่บล็อก** |
| ต้นทุน/กล่อง * | money · หน่วย `บาท` ในช่อง |
| รวมต่อรายการ | `unit_cost × quantity_actual` (ประมาณการ — ยอดจริงใช้ `line_total` จาก Backend) |
| ท้ายหน้า | `รวม N รายการ · มูลค่ารวม X บาท` + `⚠️ มี N รายการที่จำนวนไม่ตรงกับใบส่งของ` |

## ขั้นที่ 2
- แถบล็อก `🔒 ตรวจสอบครั้งสุดท้าย — เมื่อยืนยันแล้วจะแก้ไขใบนี้ไม่ได้ ต้องใช้การปรับ Stock แทน`
- ตารางสรุป · EXP ใช้ `<ExpiryCell>` · รายการที่ `itemHasMismatch()` มี ⚠️
- กล่อง "สิ่งที่ต้องตรวจก่อนยืนยัน" รวมทุกคำเตือน (จำนวนไม่ตรง + Lot ที่ขายได้ไม่นาน พร้อม `ขายได้ถึง ...`)
- **ช่องติ๊กบังคับ** `☐ ข้าพเจ้าตรวจสอบวันหมดอายุและจำนวนแล้วว่าถูกต้อง` — ปุ่มเทาจนกว่าจะติ๊ก
- ปุ่ม `← กลับไปแก้ไข` ใช้ได้ตลอด
- หลังยืนยัน `status === 'discrepancy'` → หน้าสำเร็จเพิ่มบรรทัด `⚠️ ใบนี้มีรายการที่จำนวนไม่ตรงกับใบส่งของ`

## ปุ่มลัด
`Ctrl+N` เพิ่มรายการ · `Tab` ช่องถัดไป · `Ctrl+S` บันทึกร่างทันที · `Esc` ปิดหน้าต่างซ้อน

## ใบรับสินค้า — A4 แนวตั้ง

| หัวข้อ | ข้อกำหนด |
|---|---|
| หัวกระดาษ | ชื่อร้าน/ที่อยู่/โทร จาก `GET /store` + `ใบรับสินค้า` + เลขที่ R-… มุมขวาบนตัวใหญ่ |
| ข้อมูลใบ | ผู้จำหน่าย · เลขที่ใบส่งของ · วันที่รับ (พ.ศ.) · ผู้รับสินค้า |
| ตาราง | # · รายการ · Lot · หมดอายุ (เดือน/ปี พ.ศ.) · **ใบ (`quantity_invoiced`)** · **จริง (`quantity_actual`)** · ต้นทุน |
| รายการที่ไม่ตรง | **`** จำนวนไม่ตรงกับใบส่งของ — ขาด 2 กล่อง **` ตัวหนา ไม่ใช่สีอย่างเดียว** (เครื่องพิมพ์ขาวดำ) |
| ท้าย | **`รวมทั้งหมด N รายการ`** · มูลค่ารวม · ส่วนหมายเหตุสรุปทุกข้อผิดปกติ · ช่องลงชื่อ 2 ช่อง · `พิมพ์เมื่อ ...` |
| **ไม่มี** | `หน้า X/Y` (C-7 — ตัดออกแล้ว) · คำว่าใบกำกับภาษี / VAT |
| เงื่อนไข | **พิมพ์ได้เฉพาะใบที่ `status !== 'draft'`** — ใบร่างไม่มีปุ่มพิมพ์ |
| หลายหน้า | หัวตารางซ้ำทุกหน้าด้วย `<thead>` · `break-inside: avoid` ทุกแถว · ยอดรวมและช่องลงชื่ออยู่หน้าสุดท้าย |

## เกณฑ์ทดสอบด้วยมือ (5.5)

| ทำอะไร | ต้องเห็นอะไร |
|---|---|
| กรอก 1 รายการแล้วรอ 3 วินาที | `💾 บันทึกร่างแล้ว` · รีเฟรชแล้วข้อมูลยังอยู่ |
| **ตรวจ Network tab ตอนบันทึกร่าง** | ส่ง **`quantity_invoiced` / `quantity_actual`** · **ไม่ส่ง** `subtotal` / `total_amount` |
| กรอก EXP `06 / 2570` | `หมดอายุ 30 มิ.ย. 2570 · ขายได้ถึง 29 มิ.ย. 2570 (อีก 3 ปี 9 เดือน)` |
| **กรอก EXP `09 / 2569` ณ 18 ก.ย. 2569** | 🔴 `... ขายได้ถึง 29 ก.ย. 2569 (อีก 11 วัน) — รับเข้าได้ แต่ควรทักท้วงผู้ส่ง` · **ไปขั้นที่ 2 ได้** |
| **กรอก EXP `08 / 2569` ณ 18 ก.ย. 2569** | 🔴 `ขายไม่ได้แล้ว — ขายได้ถึง 30 ส.ค. 2569 ...` · **ปุ่มไปขั้นที่ 2 กดไม่ได้** |
| กรอกปี `70` แล้ว Tab | กลายเป็น `2570` |
| ใบส่ง 30 นับได้ 28 | `⚠️ ขาด 2 กล่อง` · ยอดคิดจาก 28 · ท้ายหน้าขึ้นสรุป |
| **ยืนยันใบที่มีรายการไม่ตรง** | Backend คืน **`status: "discrepancy"`** · หน้าสำเร็จมีบรรทัด ⚠️ · ประวัติแสดงป้าย ⚠️ |
| ยืนยันใบที่ทุกรายการตรง | `status: "confirmed"` · ไม่มีป้าย ⚠️ |
| ไปขั้นที่ 2 โดยยังไม่ติ๊ก | ปุ่มเทา กดไม่ได้ |
| ยืนยันสำเร็จ | `/stock` เพิ่มตาม **`quantity_actual`** · เห็น Lot ใหม่ |
| ยืนยันซ้ำ (กดรัว) | เกิดใบเดียว |
| ปิด Backend ตอนยืนยัน | `ยืนยันไม่สำเร็จ ใบรับสินค้ายังเป็นร่างอยู่ ข้อมูลไม่หาย กรุณาลองใหม่` |
| เพิ่มยาใหม่จากหน้ารับสินค้า | หน้าต่างซ้อนเปิด · บันทึกแล้วเลือกให้ทันที · **ข้อมูลรายการอื่นไม่หาย** |
| เปิดใบร่าง | **ไม่มีปุ่มพิมพ์** |
| พิมพ์ใบที่ยืนยันแล้ว | A4 · รายการไม่ตรงมี `** ... **` ตัวหนา · ท้ายมี `รวมทั้งหมด N รายการ` · **ไม่มี `หน้า X/Y`** |

---

# 5.6 งาน 5.6 — รายงาน 4 หน้า + ภาพรวมร้าน

## Route และสิทธิ์

| Route | สิทธิ์ |
|---|---|
| `/dashboard` | owner, pharmacist |
| `/expiry` · `/reports/expired` · `/reports/low-stock` | owner, pharmacist |
| `/reports/inventory-value` | **owner เท่านั้น (D20 — Backend ตอบ 403 ให้ role อื่น)** |

## ★ TypeScript type — แก้ตาม B-9

```ts
export interface ExpiringRow {                   // GET /reports/expiring?days=
  lot_id: string; medicine_id: string; medicine_name: string;
  unit: string;
  lot_number: string;
  quantity_remaining: number;
  expiry_date: string;
  days_remaining: number;           // ★ ค่าดิบ (D19) — ห้ามแสดงตรง ๆ
  risk_level: RiskLevel;            // คิดจากค่าดิบ ฝั่ง Backend
  stock_value?: Money;              // 🔒 owner/pharmacist (B-5)
}
// ★ ไม่มี strength / dosage_form ใน /reports/expiring — ต้องการให้เรียก GET /medicines/{id}

export interface ExpiredRow {                    // GET /reports/expired
  lot_id: string; medicine_id: string; medicine_name: string;
  unit: string;                     // D25
  lot_number: string;
  quantity_remaining: number;
  expiry_date: string;
  days_expired: number;             // ★ ชื่อจริงใน API (ไม่ใช่ days_since_expiry)
  stock_value?: Money;              // 🔒 owner/pharmacist (B-5)
}
// ★ /reports/expired ไม่คืน risk_level (แต่คืน unit แล้วตาม D25)

export interface LowStockRow {                   // ★ ตัด last_supplier_name / last_unit_cost แล้ว
  medicine_id: string; name: string;
  unit: string;                     // D25
  available_quantity: number;
  reorder_point: number;            // ไม่มี null เพราะ API ตัดยาที่ยังไม่ตั้งค่าออกแล้ว (B-14)
  shortage: number;
}
// ★ /reports/low-stock ไม่คืน strength (แต่คืน unit แล้วตาม D25)

export interface InventoryValueReport {          // GET /reports/inventory-value (owner, D20)
  total_value: Money; sellable_value: Money; expired_value: Money;
  by_medicine: Page<{
    medicine_id: string; name: string;
    total_value: Money; sellable_value: Money; expired_value: Money;
  }>;
  by_category: { category: string; total_value: Money; sellable_value: Money; expired_value: Money }[];
}
// ★ ไม่มี total_medicines และไม่มี near_expiry_value — ใช้ by_medicine.total เป็นจำนวนรายการ
//   "เงินจมในยาใกล้หมดอายุ" ไม่ใช่ expired_value — ให้รวม stock_value ของ summary
//   จาก GET /reports/expiring?days=180 (ทั้ง 4 ระดับ) แล้วหารด้วย total_value
//   ส่วน expired_value ใช้ทำกล่อง "มูลค่ายาที่ขายไม่ได้แล้ว" (ความสูญเสีย) แยกต่างหาก
```

## Dashboard
เรียกขนาน แสดงทีละส่วนเมื่อพร้อม (ส่วนไหนพัง ส่วนอื่นยังใช้ได้):
```
GET /reports/expiring?days=180   → แบ่ง 4 ระดับจาก risk_level + นับ + รวม stock_value
GET /reports/expired             → กล่อง ⛔
GET /reports/low-stock           → 3 อันดับแรก
GET /reports/stock               → นับยาที่ reorder_point เป็น null (ข้อความ G-2)
GET /reports/inventory-value     → กล่องล่าง 3 กล่อง  🔒 owner เท่านั้น (D20)
```

**ข้อกำหนด:**
- ทุกกล่องความเสี่ยงแสดง **ทั้งจำนวนรายการและมูลค่าเงิน** · แสดง **3 อันดับแรกตรงหน้า**
- **ตัวเลขวันในรายการ 3 อันดับแรกต้องผ่าน `daysLeftToSell()` (D19)** — เช่น `🔴 Amoxicillin Lot B-2503 เหลือ 11 วัน (ขายได้ถึง 29 ก.ย. 2569) 28 กล่อง 2,100 ฿`
- **กล่อง “เงินจมในยาใกล้หมดอายุ”** = ผลรวมมูลค่าของทุกแถวจาก `GET /reports/expiring?days=180` (ชุดเดียวกับที่ใช้ทำกล่อง 4 ระดับ) — ใช้ผลรวม `stock_value` ของ `summary` เพราะครอบทุกแถวแม้ผลจะถูกแบ่งหน้า · `%` = ผลรวมนั้น ÷ `total_value` **คำนวณในหน่วยสตางค์**
- **กล่อง “มูลค่ายาที่ขายไม่ได้แล้ว”** = `expired_value` แยกอีกกล่องหนึ่ง · ใช้คำว่า **“ความสูญเสีย”** ไม่ใช่ “เงินจม”
- 🔴 **ห้ามใช้แทนกัน:** `expired_value` = ของที่ขายไม่ได้แล้ว (เสียไปแล้ว) · เงินจมในยาใกล้หมดอายุ = ของที่ยังขายได้แต่เสี่ยง (ต้องรีบระบาย) — คนละเรื่องกัน · API ไม่มีฟิลด์ `near_expiry_value`
- **pharmacist เข้าได้ แต่ซ่อนกล่องล่างทั้ง 3 กล่อง** (มูลค่าคลังรวม · เงินจมในยาใกล้หมดอายุ · มูลค่ายาที่ขายไม่ได้แล้ว) → ซ่อนแล้วส่วนบนขยายเต็มความกว้าง **ห้ามเหลือช่องว่าง**
- **ส่วน "ยาที่ใกล้หมด" ต้องมีข้อความท้าย** `(นับเฉพาะยาที่ตั้งจุดสั่งซื้อไว้แล้ว — ยังไม่ตั้งค่า 38 รายการ)` + ลิงก์ไปหน้าคลังยา · ตั้งครบแล้วไม่ต้องแสดง
- **ไม่มีกราฟใด ๆ** (รอ Phase 8)
- `อัปเดตล่าสุด HH:mm` + ปุ่มรีเฟรช
- สถานะดี: `✅ ไม่มียาที่ขายได้ไม่ถึง 180 วันข้างหน้า` · สถานะว่าง: `📦 ยังไม่มีข้อมูลในระบบ` + ปุ่มไปหน้ารับสินค้า

## หน้ารายงาน 4 หน้า

| หน้า | สาระ | จุดที่ห้ามพลาด |
|---|---|---|
| `/expiry` | แท็บ 4 ระดับ + จำนวนบนแท็บ · ตาราง: ยา, Lot, EXP, **ขายได้ถึง**, **เหลือกี่วัน (ผ่าน D19)**, จำนวน, มูลค่า🔒 · เรียง EXP ใกล้สุดก่อน | ทุกแถวมีปุ่ม `ปรับ Stock` เปิดหน้าต่างเดียวกับ 5.3 (ต้อง reload ค่าก่อนเปิด) |
| `/reports/expired` | ตารางเดียวกัน + `ขายไม่ได้มาแล้วกี่วัน` · แถบแดง `มูลค่าความสูญเสียรวม X บาท`🔒 | `ของเหล่านี้ยังอยู่บนชั้นจริง — ตรวจสอบและนำออกจากชั้นวาง` + ปุ่มปรับ Stock ทุกแถว |
| `/reports/low-stock` | **คอลัมน์: ยา · คงเหลือ · จุดสั่งซื้อ · ขาดอีกเท่าไร** (B-9 — ตัดผู้จำหน่ายล่าสุดและต้นทุนล่าสุดออก) · ยาที่เหลือ 0 บนสุดเสมอ | **ห้ามมีคำว่า "แนะนำให้สั่ง" หรือข้อความชี้นำใด ๆ** · **ห้ามยิง `/purchases` ทีละแถวเด็ดขาด** |
| `/reports/inventory-value` | ยอดรวม 32px + ตารางแยกตามยา เรียงมาก→น้อย + สรุปย่อย | **ซ่อนทั้งหน้าและเมนูจาก pharmacist และ staff (D20)** |

> **หมายเหตุ G-2:** ยาที่ยังไม่ตั้งจุดสั่งซื้อ **ไม่ปรากฏใน `/reports/low-stock`** เพราะ API ตัดออกให้แล้ว (B-14) — การเตือนว่ามีกี่รายการที่ยังไม่ตั้งค่าอยู่บน Dashboard และในหน้าคลังยา

## เกณฑ์ทดสอบด้วยมือ (5.6)

| ทำอะไร | ต้องเห็นอะไร |
|---|---|
| owner เปิด `/dashboard` | กล่อง 4 ระดับมีทั้งจำนวนและมูลค่า · 3 อันดับแรกแสดงตรงหน้า · กล่องล่าง 3 กล่อง และ “เงินจม” มี % |
| pharmacist เปิด `/dashboard` | ไม่มีกล่องล่างทั้ง 3 · ไม่เหลือช่องว่าง |
| **pharmacist พิมพ์ `/reports/inventory-value`** | หน้าไม่มีสิทธิ์ · **และถ้ายิง API ตรง Backend ตอบ 403 (D20)** |
| มียา 38 ตัวที่ยังไม่ตั้งจุดสั่งซื้อ | Dashboard แสดง `(... ยังไม่ตั้งค่า 38 รายการ)` + ลิงก์ |
| ตั้งครบทุกตัว | ข้อความนั้นหายไป |
| **`/expiry` แท็บวิกฤต · Lot EXP 09/2569 ณ 18 ก.ย. 2569** | **`เหลือ 11 วัน`** และ `ขายได้ถึง 29 ก.ย. 2569` — **เทียบกับ response ของ API ที่ส่ง `days_remaining: 12`** |
| ดูหน้า low-stock | **ไม่มีคอลัมน์ผู้จำหน่ายล่าสุด/ต้นทุนล่าสุด** · ไม่มีคำว่า "แนะนำ" · Network tab ไม่มีการเรียก `/purchases` |
| กด `ปรับ Stock` จากแถวรายงาน | หน้าต่างเปิดพร้อมชื่อยาและ Lot ถูกต้อง หลัง reload ค่า |
| ปิดเฉพาะ low-stock (จำลอง) | ส่วนอื่นยังแสดง · เฉพาะส่วนนั้นมีปุ่มลองใหม่ |

---

# 5.7 งาน 5.7 — ประวัติการขาย / การรับสินค้า / ตรวจสอบย้อนหลัง

## Route และสิทธิ์
`/history/sales` · `/history/sales/[id]` · `/history/purchases` · `/history/purchases/[id]` (owner, pharmacist) · `/audit` (**owner เท่านั้น**)

## ★ TypeScript type — แก้ตาม B-10

```ts
export interface AuditLog {                      // GET /audit-logs
  id: string; created_at: string;
  user_name: string;
  action: string;                   // 'INSERT' | 'UPDATE' | 'DELETE' ฯลฯ
  table_name: string;               // 'medicines' | 'medicine_lots' | 'purchases' | 'store_profile' ...
  record_id: string;                // UUID
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
}
```

**วิธีแสดงชื่อสิ่งที่ถูกแก้ (ไม่มี `entity_label` แล้ว):**

```ts
// lib/constants.ts
export const TABLE_LABEL_TH: Record<string, string> = {
  medicines: 'ข้อมูลยา', medicine_lots: 'ล็อตยา', purchases: 'ใบรับสินค้า',
  sales: 'การขาย', inventory_transactions: 'การเคลื่อนไหวสต็อก',
  suppliers: 'ผู้จำหน่าย', store_profile: 'ข้อมูลร้าน', user_profiles: 'ผู้ใช้งาน',
};
export const ACTION_LABEL_TH: Record<string, string> = {
  INSERT: 'เพิ่ม', UPDATE: 'แก้ไข', DELETE: 'ลบ',
};
/** ดึงชื่อที่อ่านออกจาก new_value/old_value ตามลำดับความสำคัญของแต่ละตาราง */
export function entityLabelFrom(log: AuditLog): string;
//   medicines      → new_value.name ?? old_value.name
//   medicine_lots  → new_value.lot_number
//   purchases      → new_value.purchase_no ?? new_value.invoice_no
//   sales          → new_value.sale_no
//   store_profile  → new_value.name
//   หาไม่ได้        → `(${log.record_id.slice(0, 8)})`
```
**ห้ามแสดงชื่อ action หรือชื่อตารางเป็นภาษาอังกฤษดิบบนหน้าจอ**

## ลำดับการเรียก API
- `GET /sales?date_from=&date_to=` — ค่าเริ่มต้น **วันนี้**
- `GET /sales/{id}` → แสดง Lot ที่ถูกตัด + ปุ่ม `🖨 พิมพ์ใบเสร็จ S-…` (ส่ง `?copy=1`)
- `GET /purchases?status=&supplier_id=&date_from=&date_to=` — ค่าเริ่มต้น 30 วันล่าสุด
- `GET /purchases/{id}` → ปุ่มพิมพ์เฉพาะใบที่ `status !== 'draft'`
- `GET /audit-logs` — ค่าเริ่มต้น 7 วันล่าสุด

## ข้อกำหนด
- **ประวัติการขาย:** ข้อความคงที่ `บิลที่บันทึกแล้วยกเลิกไม่ได้ — หากขายผิด ให้ใช้การปรับ Stock พร้อมระบุเหตุผล` + ลิงก์ไปคลังยา
- **ประวัติการรับสินค้า:** ป้าย ⚠️ ในแถวที่ `status === 'discrepancy'` · ตัวกรองสถานะมี 3 ค่า (ร่าง / ยืนยันแล้ว / จำนวนไม่ตรง) · ข้อความ `ใบรับสินค้าที่ยืนยันแล้วดูได้อย่างเดียว แก้ไขไม่ได้`
- **Audit:** ตัวกรอง วันที่ / ผู้ใช้ / ตาราง · แสดง **ค่าเดิม → ค่าใหม่ คู่กันในแถวเดียว** (เทียบเฉพาะฟิลด์ที่เปลี่ยน) · ชื่อรายการมาจาก `entityLabelFrom()`
- ทุกหน้าแบ่งหน้า 25 · วันที่และตัวกรองเป็น พ.ศ.

## เกณฑ์ทดสอบด้วยมือ (5.7)

| ทำอะไร | ต้องเห็นอะไร |
|---|---|
| ขายแล้วเข้า `/history/sales` | บิลใหม่บนสุด · เวลาไทย · ปี พ.ศ. |
| ดูรายละเอียดบิล | เห็น Lot ที่ถูกตัด + ปุ่มพิมพ์ที่มีเลขที่บิลในข้อความปุ่ม |
| เลือกช่วงวันที่ 7 วัน | กรองถูกต้อง |
| **ดูใบรับที่ `status = 'discrepancy'`** | ป้าย ⚠️ ทั้งในรายการและหน้ารายละเอียด |
| กรองสถานะ "จำนวนไม่ตรง" | ได้เฉพาะใบ discrepancy |
| owner เปิด `/audit` | เห็นรายการปรับ Stock จาก 5.3 · คอลัมน์ "ทำอะไร" เป็นไทย เช่น `แก้ไข ล็อตยา (A-2410)` · มีค่าเดิม → ค่าใหม่ และเหตุผล |
| แก้ข้อมูลร้านแล้วดู audit | `แก้ไข ข้อมูลร้าน (<ชื่อร้าน>)` |
| ดูทั้งหน้า audit | **ไม่มีคำภาษาอังกฤษดิบ** และไม่มี UUID เต็มโชว์ (ย่อ 8 ตัวเมื่อหาชื่อไม่ได้) |
| pharmacist พิมพ์ `/audit` | หน้าไม่มีสิทธิ์ |

---

# 5.8ก งาน 5.8ก — ระบบจัดการผู้ใช้ (G-1) — งานสุดท้ายของ Phase 5

> ⚠️ **ยังเริ่มไม่ได้จนกว่าผู้ใช้จะอนุมัติ A-1** (ต้องใช้ Supabase service_role key ฝั่ง Backend — กฎข้อ 40/71)

## ★ API Contract — แก้ตาม D22 (ตัด `must_change_password`)

| # | Endpoint | สิทธิ์ | ใช้ทำอะไร |
|---|---|---|---|
| U-1 | `GET /api/v1/users` | owner | รายชื่อผู้ใช้ |
| U-2 | `GET /api/v1/users/{id}` | owner | เติมค่าในฟอร์มแก้ไข |
| U-3 | `POST /api/v1/users` | owner | เพิ่มผู้ใช้ใหม่ |
| U-4 | `PATCH /api/v1/users/{id}` | owner | แก้ชื่อ / เปลี่ยนสิทธิ์ / เปิด-ปิดการใช้งาน |
| U-5 | `POST /api/v1/users/{id}/reset-password` | owner | ตั้งรหัสผ่านใหม่ |
| **U-6** | `POST /api/v1/me/change-password` | **ทุก role** | เปลี่ยนรหัสผ่านของตัวเอง (D22) |

```jsonc
// U-1  GET /api/v1/users?q=&is_active=&limit=&offset=
{
  "items": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "ชื่อผู้ใช้",
      "role": "pharmacist",
      "is_active": true,
      "has_signed_in": false,        // ป้าย "รอเข้าครั้งแรก"
      "created_at": "2026-09-01T09:00:00+07:00",
      "last_sign_in_at": null
    }
  ],
  "total": 5, "limit": 25, "offset": 0
}
// ★ ไม่มีฟิลด์ must_change_password (D22)

// U-3  POST /api/v1/users
// ขอ → { "email", "full_name", "role": "staff", "temp_password": "Kx7#mQ2p" }
// ผิด → 409 { "error": { "code": "DUPLICATE",
//                        "message": "อีเมลนี้มีผู้ใช้งานอยู่แล้ว (<ชื่อผู้ใช้เดิม>)",
//                        "details": { "existing_user_name": "<ชื่อผู้ใช้เดิม>" } } }

// U-4  PATCH /api/v1/users/{id}
// ขอ → { "full_name"?, "role"?, "is_active"? }
// ผิด → 400 VALIDATION_ERROR พร้อมข้อความไทยตามตารางกฎด้านล่าง

// U-5  POST /api/v1/users/{id}/reset-password   ขอ → { "temp_password" }   ได้ → 204
// U-6  POST /api/v1/me/change-password          ขอ → { "current_password", "new_password" }   ได้ → 204
```

## กฎที่ขอให้ Backend บังคับ

| # | กฎ | ข้อความไทย |
|---|---|---|
| 1 | ห้ามเปลี่ยนสิทธิ์ตัวเอง | `ไม่สามารถเปลี่ยนสิทธิ์ของบัญชีตัวเองได้` |
| 2 | ห้ามปิดการใช้งานตัวเอง | `ไม่สามารถปิดการใช้งานบัญชีตัวเองได้` |
| 3 | ต้องเหลือ owner ที่ใช้งานได้ ≥ 1 | `ไม่สามารถทำได้ ร้านต้องมีเจ้าของร้านอย่างน้อย 1 คน กรุณาตั้งเจ้าของร้านคนใหม่ก่อน` |
| 4 | **ไม่มี endpoint ลบผู้ใช้** ใช้ปิดการใช้งานแทน | — (กฎข้อ 42) |
| 5 | ผู้ใช้ `is_active = false` Login ไม่ได้ | `บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อเจ้าของร้าน` |
| 6 | รหัสผ่านขั้นต่ำ 8 ตัวอักษร | `รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร` |
| 7 | ทุกการกระทำลง Audit log (`user_profiles`) | — |

## หน้าจอ `/settings/users` (owner เท่านั้น)

| ส่วน | ข้อกำหนด |
|---|---|
| หัวหน้า | `ผู้ใช้งานที่เข้าระบบได้ 4 คน · ปิดใช้งาน 1 คน` + ค้นหา + ตัวกรองสถานะ |
| ตาราง | ชื่อ (แถวตัวเองมี `(คุณ)`) · อีเมล · สิทธิ์ (👑 เจ้าของร้าน / 💊 เภสัชกร / 🧑 พนักงาน) · สถานะ (✅ ใช้งาน / ⏳ รอเข้าครั้งแรก / ⛔ ปิดใช้งาน) · เมนู [⋯] |
| แถวที่ถูกปิด | สีเทาทั้งแถว **แต่ยังแสดงเสมอ** (ชื่ออยู่ในประวัติการขายเก่า) |
| เมนู [⋯] | แก้ไขชื่อ · เปลี่ยนสิทธิ์ (ยกเว้นตัวเอง) · **"ตั้งรหัสผ่านใหม่"** (C-6 — **ห้ามใช้คำว่า "ส่งลิงก์"**) · ปิดการใช้งาน (ยกเว้นตัวเองและ owner คนสุดท้าย) · เปิดใช้งานอีกครั้ง · **ไม่มีเมนูลบ** |
| การ์ดคำอธิบายสิทธิ์ | `<Collapsible>` ใต้ตาราง — ข้อความ 3 ย่อหน้าตาม Chat G B.3 |
| ฟอร์มเพิ่มผู้ใช้ | ชื่อ · อีเมล (`ใช้อีเมลนี้เข้าสู่ระบบ`) · **radio 3 สิทธิ์พร้อมคำอธิบาย 1 บรรทัด · ค่าเริ่มต้น = พนักงาน** · รหัสผ่านชั่วคราว + 🎲 สุ่มให้ + 👁 ดูรหัส · `⚠️ จดรหัสผ่านนี้ไว้ก่อนกดเพิ่ม ระบบจะไม่แสดงรหัสนี้อีก` |
| **★ D22** | **ห้ามมีข้อความ "ผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าครั้งแรก" ที่ใดเลย** · แทนด้วย `แจ้งรหัสผ่านนี้ให้ผู้ใช้ — เขาเปลี่ยนเองได้ที่เมนู "เปลี่ยนรหัสผ่าน"` |
| หลังเพิ่มสำเร็จ | กล่องสรุป ชื่อ/อีเมล/รหัสชั่วคราว + ปุ่ม `📋 คัดลอก` · **ต้องกดปิดเอง** |
| กล่องเปลี่ยนสิทธิ์ | เลื่อนขึ้น = รายการ ✓ สิ่งที่ทำได้เพิ่ม (ส้ม) · ลดลง = รายการ ✕ สิ่งที่ทำไม่ได้อีก (แดง) · เปลี่ยนเป็น owner ต้องเน้นตัวหนา "เปลี่ยนสิทธิ์ผู้ใช้งานคนอื่นได้" · บรรทัด `การเปลี่ยนสิทธิ์จะถูกบันทึกในชื่อ "<ผู้ใช้ปัจจุบัน>"` |
| ตั้งรหัสผ่านใหม่ | สุ่ม/กรอก + แสดงครั้งเดียว + คัดลอก + `กรุณาแจ้งรหัสใหม่ให้พนักงานด้วยตนเอง ระบบไม่ส่งอีเมล` |
| ตรวจรหัสผ่าน | แสดง `รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร` **ขณะพิมพ์** |

## หน้า `/account/password` (U-6 · ทุก role)
ไฟล์ `app/(app)/account/password/page.tsx` + `components/account/ChangePasswordForm.tsx`
- ช่อง: รหัสผ่านปัจจุบัน · รหัสผ่านใหม่ · ยืนยันรหัสผ่านใหม่ · ปุ่ม 👁
- เข้าจากเมนู "เปลี่ยนรหัสผ่าน" ใน `UserMenu` มุมขวาบน
- สำเร็จ → toast `เปลี่ยนรหัสผ่านเรียบร้อย` · **ไม่บังคับให้ออกจากระบบ**

## เกณฑ์ทดสอบด้วยมือ (5.8ก)

| ทำอะไร | ต้องเห็นอะไร |
|---|---|
| owner เพิ่มผู้ใช้ role staff | สถานะ ⏳ รอเข้าครั้งแรก · กล่องรหัสไม่หายเอง · คัดลอกได้ |
| Login ด้วยบัญชีนั้น | เข้าได้ · เห็น 2 เมนู · สถานะเปลี่ยนเป็น ✅ · **ไม่ถูกบังคับเปลี่ยนรหัสผ่าน (D22)** |
| **อ่านทุกหน้าจอในกลุ่มนี้** | **ไม่มีข้อความบังคับเปลี่ยนรหัสผ่านที่ใดเลย** |
| ผู้ใช้ใด ๆ เปิดเมนู "เปลี่ยนรหัสผ่าน" | เปลี่ยนได้ · รหัสเดิมใช้ไม่ได้ |
| เพิ่มด้วยอีเมลซ้ำ | `อีเมลนี้มีผู้ใช้งานอยู่แล้ว (<ชื่อ>)` |
| พิมพ์รหัสผ่าน 5 ตัว | เตือนทันทีขณะพิมพ์ |
| ดูแถวตัวเอง | มี `(คุณ)` · เมนู [⋯] ไม่มีเปลี่ยนสิทธิ์และไม่มีปิดการใช้งาน |
| ดูเมนู [⋯] | มีคำว่า **"ตั้งรหัสผ่านใหม่"** · **ไม่มีคำว่า "ส่งลิงก์" ที่ใดเลย** |
| เปลี่ยน staff → owner | กล่องแสดง ✓ สิ่งที่ทำได้เพิ่ม · "เปลี่ยนสิทธิ์ผู้ใช้งานคนอื่นได้" ตัวหนา |
| เปลี่ยน pharmacist → staff | กล่องแสดง ✕ สีแดง เช่น `✕ จะไม่เห็นต้นทุนอีกต่อไป` |
| ยิง `PATCH /users/{ตัวเอง}` ตรง | 400 `ไม่สามารถเปลี่ยนสิทธิ์ของบัญชีตัวเองได้` |
| ปิด owner คนเดียว | `... ร้านต้องมีเจ้าของร้านอย่างน้อย 1 คน ...` |
| ปิด staff แล้วให้เขา Login | Login ไม่ได้ · ชื่อยังอยู่ในบิลเก่า · แถวยังแสดง (สีเทา) |
| pharmacist พิมพ์ `/settings/users` | `🔒 หน้านี้สำหรับเจ้าของร้านเท่านั้น` |
| ทำครบแล้วเปิด `/audit` | เห็นรายการของตาราง `ผู้ใช้งาน` เป็นภาษาไทย |

---

# 5.9 สิ่งที่ต้องใช้จาก Backend

## A. งานใหม่

| # | อะไร | ต้องใช้อะไรเพิ่ม | สถานะ |
|---|---|---|---|
| **A-2** | ข้อมูลร้าน (S-1/S-2) | ตาราง `store_profile` + migration + 2 endpoints — **ไม่ต้องใช้ secret key** | ✅ **อนุมัติและทำเสร็จแล้ว** (migration 005) |
| **A-1** | ระบบจัดการผู้ใช้ (U-1…U-6) | Supabase Admin API ⇒ **service_role key ใน `backend/.env` เท่านั้น ห้ามอยู่ฝั่งเว็บ** | ⏸️ รอผู้ใช้อนุมัติ เมื่อถึงงาน 5.8ก |

## B. ช่องว่างของการ implement ที่ Chat A อนุมัติให้เพิ่มได้ (ไม่ใช่การเปลี่ยน Architecture)

| # | สิ่งที่ต้องมี | ใช้ที่ไหน |
|---|---|---|
| B-5 | `stock_value` ราย Lot/รายยา สำหรับ owner/pharmacist และ **ต้องไม่มีสำหรับ staff** | กล่องมูลค่าใน Dashboard · คอลัมน์มูลค่าในคลังยาและรายงาน |
| B-8 | `POST /sales` คืนวัตถุ Sale รูปแบบเดียวกับ `GET /sales/{id}` (รวม `items[].lots`) | ใบเสร็จตาม Q4 · ข้อความย้ำ Lot หลังขาย · ทางสำรอง: เว็บเรียก `GET /sales/{id}` ต่อ |
| B-14 | `GET /reports/stock` คืน `reorder_point` รวมค่า `null` | ป้าย "ต่ำกว่าจุดสั่งซื้อ" · ตัวนับ "ยังไม่ตั้งค่า N รายการ" |
| D20 | `GET /reports/inventory-value` จำกัดเป็น **owner เท่านั้น** + เทสต์สิทธิ์ (pharmacist → 403) | หน้ามูลค่าคงคลัง |
| D23 | `POST /lots/{id}/adjustments` รับ `quantity_before` → ไม่ตรง = 409 | หน้าต่างปรับ Stock (ดูภาคผนวก) |

## C. ยกไป Phase ถัดไป (ปิดใน Phase 5)

| # | เรื่อง | ยกไป |
|---|---|---|
| B-9 | `last_supplier_name` / `last_unit_cost` ใน low-stock | Phase 8 (พร้อมระบบแนะนำสั่งซื้อ) |
| B-10 | `entity_label` ใน audit-logs | ยังไม่ทำ — เว็บ derive จาก `old_value`/`new_value` |
| B-11 | ค้นบาร์โค้ดบางส่วนฝั่ง Backend | ไม่ทำ — เว็บตรวจเองแล้ว fallback |
| C-3 | เรียงผลค้นหาตามความถี่การขาย | Phase 8 |
| D22 | นโยบายรหัสผ่านทั้งชุด (บังคับเปลี่ยนครั้งแรก · อายุรหัสผ่าน · ความซับซ้อน) | Phase 10 |

---

# 5.10 เกณฑ์ผ่าน Phase 5 (Gate)

## A. ความพร้อมก่อนเริ่ม
1. `npm run dev` ขึ้นจริง — Installed / Verified
2. Backend รันที่ `127.0.0.1:8001` · `GET /health` ผ่าน — Connected / Verified
3. Supabase Auth ใช้ได้ + บัญชีทดสอบครบ **3 role** — Authenticated / Verified
4. **`docs/03-api-openapi.json` ถูก export และ `types/api.ts` ตรงกับไฟล์นั้น**
5. ข้อมูลทดสอบ: ยา ≥ 10 · ยาที่มี ≥ 3 Lot อย่างน้อย 1 ตัว · **Lot ที่ขายไม่ได้แล้ว ≥ 1** · **Lot ที่ EXP เป็นเดือนปัจจุบัน ≥ 1** · Lot เหลือ < 30 วัน ≥ 1 · ผู้จำหน่าย ≥ 2 · ยาที่ต่ำกว่าจุดสั่งซื้อ ≥ 1 · **ยาที่ `reorder_point` เป็น null ≥ 1**
6. **A-2 (ข้อมูลร้าน) พร้อมและตั้งค่าแล้ว ก่อนทดสอบงานพิมพ์**

## B. ความถูกต้องของฟังก์ชัน
7. งาน 5.1–5.7 และ 5.8ข ผ่านเกณฑ์ทดสอบด้วยมือของตัวเองครบทุกข้อ
8. งาน 5.8ก ผ่านครบ (หรือถูกเลื่อนอย่างเป็นทางการเพราะ A-1 ยังไม่อนุมัติ)
9. ขาย 1 รายการจบด้วย **ยิง → F2 → Enter** โดยไม่แตะเมาส์
10. รับสินค้า 3 รายการจบ และ Stock เพิ่มตาม **`quantity_actual`**
11. Lot ที่ถูกตัดจริงตรงกับที่แสดงในแถบ 📍 ก่อนกดยืนยัน
12. ปรับ Stock แล้วเห็นในประวัติการเคลื่อนไหวและ Audit log พร้อมเหตุผลและชื่อผู้ทำ

## C. ★ การทดสอบ D18 + D19 (ต้องผ่านทุกข้อ)

> ใช้ Lot ที่ `expiry_date = 2026-09-30` · ทดสอบโดยเปลี่ยนวันที่ของเครื่องหรือเตรียมข้อมูลให้ตรงวัน

| # | ทดสอบ | เกณฑ์ผ่าน |
|---|---|---|
| 13 | ณ 18 ก.ย. 2569 | **ทุกหน้าที่แสดง Lot นี้ต้องขึ้น `เหลือ 11 วัน` และ `ขายได้ถึง 29 ก.ย. 2569`** (คลังยา · รายละเอียดยา · หน้าขาย · กล่องยืนยันขาย · `/expiry` · Dashboard · รับสินค้า) |
| 14 | ณ 29 ก.ย. 2569 | **ขายได้** · `ขายได้ถึงวันนี้ (29 ก.ย. 2569) — วันสุดท้าย` · ขายจริงแล้ว Backend รับ |
| 15 | ณ 30 ก.ย. 2569 | **ขายไม่ได้** · เลือกในหน้าขายไม่ได้ · ไม่นับใน `ขายได้ X` · ขึ้นในรายงานหมดอายุแล้ว |
| 16 | ณ 18 ก.ย. 2569 | รับสินค้าที่ EXP `09/2569` **ยืนยันได้** พร้อมคำเตือน · EXP `08/2569` **ยืนยันไม่ได้** |
| 17 | ทุกวัน | **ไม่มีการคำนวณวันนอก `lib/format/expiry.ts`** — ตรวจด้วยการค้นข้อความ |
| **18** | **★ D19** | **`days_remaining` ที่ API ส่ง − 1 = ตัวเลขบนหน้าจอ ทุกกรณี** — เปิด Network tab เทียบอย่างน้อย 3 หน้า (`/expiry` · `/dashboard` · `/stock`) · **ห้ามพบค่าดิบบนหน้าจอแม้แต่จุดเดียว** |
| 19 | ทุกวัน | `risk_level` ที่หน้าจอใช้ = ค่าที่ Backend ส่ง (ไม่ใช่คำนวณเองทับ) |

## D. การทดสอบสิทธิ์ 3 role

| # | ทดสอบ | เกณฑ์ผ่าน |
|---|---|---|
| 20 | staff เห็นเมนูอะไร | เฉพาะ **ขายยา, คลังยา** · ไม่เห็นกลุ่ม ⚙️ ตั้งค่า |
| 21 | staff เปิด `/stock` และ `/stock/[id]` | ไม่มีคอลัมน์ต้นทุน/มูลค่า (ทั้งคอลัมน์รวมหัวตาราง) · ไม่มีปุ่มเพิ่มยาใหม่ · ไม่มีปุ่มปรับ Stock |
| 22 | staff หน้าขาย | ราคาเป็นข้อความ · ไม่มีปุ่มส่วนลด · ยอดรวมยังเห็น |
| 23 | staff พิมพ์ URL ทุกหน้าที่ไม่มีสิทธิ์ | หน้าไม่มีสิทธิ์ **ทุกเส้นทาง** |
| 24 | **staff พิมพ์ใบเสร็จ** | ทำได้ · หัวกระดาษครบ · **ไม่มีต้นทุนในใบเสร็จ** |
| 25 | **ตรวจ Network tab ขณะ staff ใช้ทุกหน้าที่เข้าได้** | **ไม่มี response ใดมีตัวเลขต้นทุนหรือมูลค่าเลย** — ถ้ามีถือว่า **ไม่ผ่าน** และต้องแจ้ง Chat D |
| 26 | pharmacist | ไม่เห็นเมนูมูลค่าคงคลัง · ไม่เห็น 2 กล่องล่างของ Dashboard · เข้า `/audit` `/settings/*` ไม่ได้ |
| **27** | **pharmacist ยิง `GET /reports/inventory-value` ตรง** | **Backend ตอบ 403 (D20)** — ไม่ใช่แค่ซ่อนที่หน้าจอ |
| 28 | owner | เห็นครบทุกเมนู ทำได้ทุกอย่าง |
| 29 | staff ยิง `POST /medicines` ตรง | Backend ตอบ 403 |

## E. ตัวเลข วันที่ และเอกสารพิมพ์
30. `monthYearBEToISO(6,2570)` = `2027-06-30` · `(2,2571)` = `2028-02-29`
31. ทุกจุดที่แสดงปีเป็น **พ.ศ.** — ตรวจด้วยตา 12 หน้า รวมเอกสารที่พิมพ์ ไม่มี ค.ศ. หลุด
32. วันหมดอายุแสดงเป็น **เดือน/ปี** ทุกจุด และมีบรรทัด `ขายได้ถึง ...` กำกับ
33. ยอดเงิน 2 ตำแหน่ง + คั่นหลักพัน · ยอดที่หน้าจอแสดง = ยอดที่ Backend คืน **ทุกบิลที่ทดสอบ ≥ 5 บิล** (รวมบิลลงท้าย .05 / .95)
34. เวลาตรงกับเวลาไทยแม้ตั้งเครื่องเป็น timezone อื่น
35. **ใบเสร็จ:** A5 · มีคำว่า "ใบเสร็จรับเงิน" · **ไม่มีคำว่า VAT / ภาษีมูลค่าเพิ่ม / ใบกำกับภาษี** · มี Lot + EXP ทุกบรรทัด · ไม่มีต้นทุน · พิมพ์ซ้ำมีคำว่า "สำเนา"
36. **ใบรับสินค้า:** A4 · รายการไม่ตรงเน้นด้วยข้อความ+ตัวหนา · มีหมายเหตุท้ายกระดาษ · ช่องลงชื่อ 2 ช่อง · ท้ายตารางมี `รวมทั้งหมด N รายการ` · **ไม่มี `หน้า X/Y`** · ใบร่างพิมพ์ไม่ได้
37. เอกสารที่พิมพ์ไม่มีเมนู ปุ่ม หรือช่องค้นหาติดไปด้วย

## F. ความทนทาน
38. ปิด Backend แล้วเปิดทุกหน้า → `<ErrorState>` + ปุ่มลองใหม่ **ไม่มีหน้าขาว ไม่มีข้อความอังกฤษ**
39. กดปุ่มยืนยันรัว 5 ครั้ง (ขาย / รับสินค้า / ปรับ Stock / เพิ่มผู้ใช้) → **เกิดรายการเดียว** ทั้ง 4 จุด
40. เน็ตหลุดกลางหน้าขาย → ตะกร้ายังอยู่ครบ · กลางหน้ารับสินค้า → เปิดใหม่ข้อมูลกลับมา
41. **ปรับ Stock ขณะที่จำนวนถูกเปลี่ยนจากที่อื่น → ได้ข้อความให้ตรวจนับใหม่ ไม่ใช่ปรับทับเงียบ ๆ** (D23)
42. ไม่มี error ใน console ตอนใช้งานปกติ

## G. คุณภาพโค้ดและความสอดคล้อง
43. `npm run build` ผ่าน · `tsc --noEmit` ไม่มี error · **ไม่มี `any` ใน `types/` และ `lib/api/`**
44. ไม่มี `fetch()` นอก `lib/api/` · ไม่มี `new Date()` ในไฟล์ component · ไม่มี `parseFloat` กับค่าเงิน · **ไม่มีการคำนวณวันหมดอายุนอก `lib/format/expiry.ts`**
45. **`package.json` ตรงกับข้อ 5.0.12 เป๊ะ — มี `@supabase/ssr` หรือ Library อื่น = ไม่ผ่านทันที**
46. **ค้นข้อความทั้งโปรเจกต์: ไม่พบ `invoice_quantity` · `received_quantity` · `has_quantity_mismatch` · `must_change_password` · `entity_label` · `last_supplier_name` · `last_unit_cost`**
47. ทุกข้อความที่ผู้ใช้เห็นเป็นภาษาไทย ไม่มีศัพท์เทคนิคหรือรหัสข้อผิดพลาดดิบโผล่หน้าจอ
48. `npm run lint` ผ่าน (เก็บกวาด `react-hooks/set-state-in-effect` เป็นงานแยกก่อนปิด Gate)

---

# ภาคผนวก 1 — ตารางแปลงค่าอ้างอิงเร็ว

| เรื่อง | หน้าจอ | ที่ส่ง/รับกับ Backend |
|---|---|---|
| วันหมดอายุ | `06 / 2570` (เดือน/ปี พ.ศ.) | `expiry_date: "2027-06-30"` |
| วันที่ขายได้วันสุดท้าย | `ขายได้ถึง 29 มิ.ย. 2570` | — (เว็บคำนวณ `expiry_date − 1`) |
| เหลือกี่วัน | `เหลือ 11 วัน` | `days_remaining: 12` (ค่าดิบ) |
| จำนวนรับสินค้า | `จำนวนตามใบส่งของ` / `จำนวนที่นับได้จริง` | `quantity_invoiced` / `quantity_actual` |
| จำนวนไม่ตรง | ป้าย ⚠️ | `status === 'discrepancy'` |
| ปรับ Stock | `จำนวนที่นับได้จริง = 17` (ระบบมี 18) | `{ transaction_type: "correction", quantity_change: -1, quantity_before: 18, reason: "..." }` |
| เหตุผลปรับ Stock | ชำรุด / นับไม่ตรง / หมดอายุ / คืนผู้จำหน่าย / อื่น ๆ | `damage` / `correction` / `expired` / `return` / `adjustment` |
| หน่วยนับ | `กล่อง` / `ขวด` / `แผง` … | `medicines.unit` (ค่าเริ่มต้น `กล่อง`) |
| เงิน | `1,600.00 บาท` | `"1600.00"` (string) |
| ส่วนลด/ภาษี Phase 5 | ไม่มีบนหน้าจอ | `discount_amount: "0.00"` · `tax_amount: "0.00"` |
| ยอดรวม | แสดงจาก Backend | **เว็บห้ามส่ง `subtotal` / `total_amount`** |

---

# ภาคผนวก 2 — D23: กันปรับ Stock ทับกัน

**ปัญหาที่ D23 แก้**

Backend รับ **ผลต่าง** ไม่ใช่จำนวนจริง ถ้ามีคนขายยาตัวนั้นระหว่างที่หน้าต่างปรับ Stock เปิดค้างอยู่ จะเกิดกรณีนี้:

```
เปิดหน้าต่างปรับ เห็น 18  →  พนักงานอีกคนขายไป 2 → ของจริงเหลือ 16
นับได้จริง 17 → เว็บส่ง quantity_change = −1 → Backend คิด 16 − 1 = 15
ผลคือระบบบันทึก 15 ทั้งที่ของจริงมี 17 โดยไม่มีใครรู้  ❌ ผิดกฎข้อ 41
```

**ข้อกำหนด**

| ฝั่ง | สิ่งที่ต้องทำ |
|---|---|
| Backend | `POST /lots/{id}/adjustments` รับฟิลด์ใหม่ **`quantity_before`** (ไม่บังคับ เพื่อไม่ให้ของเดิมพัง) · ภายใน transaction เดียวกัน ถ้า `quantity_before` ที่ส่งมาไม่ตรงกับ `quantity_remaining` จริงใน DB → **409 `INVALID_STATE`** message `จำนวนคงเหลือเปลี่ยนไป กรุณาตรวจนับใหม่` · ถ้าไม่ส่งมา ให้ทำงานแบบเดิม |
| เทสต์ Backend | 2 ตัว — ตรงกัน → สำเร็จ / ไม่ตรงกัน → 409 |
| เว็บ | ส่ง `quantity_before` เสมอ (ค่าที่เพิ่ง `GET /lots/{id}` มาก่อนเปิดหน้าต่าง) · เจอ 409 → แสดงข้อความ + โหลดค่าใหม่ **โดยไม่ปิดหน้าต่างและไม่ล้างสิ่งที่กรอกไว้** |

---

**จบเอกสาร `docs/05-web-spec.md` ฉบับ 3.0**
บันทึกเข้า Repository โดย Chat A · 18 กันยายน 2569
