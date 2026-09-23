# Backend API Specification
## AI Pharmacy Management System — Phase 3

**สถานะเอกสาร:** ✅ อนุมัติแล้ว (Approved) — 16 กันยายน 2026
**อนุมัติโดย:** User
**จัดทำโดย:** Chat A — Architect / Project Manager (ในบทบาทผู้วาง Spec แทน Chat D)
**ผู้ลงมือทำ:** Claude Code (ในบทบาท Chat D — Backend / API)
**Phase:** Phase 3 — Backend API
**อ้างอิง:** `docs/00-blueprint.md`, `docs/02-database-schema.md`, `backend/migrations/001`, `002`
**อัปเดตล่าสุด:** กันยายน 2026

> User อนุมัติเอกสารนี้แล้ว (D1–D6 อนุมัติ) — **D7 = A (สร้าง Supabase Project ทดสอบแยก) — บันทึก 17 ก.ย. 2026**

---

## 1. เป้าหมายและขอบเขตของ Phase 3

**เป้าหมาย:** สร้าง Backend API (FastAPI) ที่เป็น **Gatekeeper** ระหว่าง Client กับฐานข้อมูล และทำงานหลักของร้านได้ครบ **โดยยังไม่มี AI**

### อยู่ในขอบเขต (In Scope)
1. โครงสร้างโปรเจกต์ Backend, การตั้งค่า และ Health Check
2. Authentication (ยืนยันตัวตน) + Authorization (สิทธิ์ตาม Role)
3. ข้อมูลหลัก: Medicines, Suppliers
4. การรับสินค้าแบบกรอกเอง: Purchase → Purchase Items → Medicine Lots → Inventory Transactions
5. การขายแบบ FEFO: Sale → Sale Items → ตัด Lot → Inventory Transactions
6. การปรับ Stock (Adjustment / Damage / Expired / Return / Correction) พร้อมเหตุผล
7. รายงานพื้นฐานที่คำนวณด้วย SQL: Stock ปัจจุบัน, ใกล้หมดอายุ, Stock ต่ำ (แบบพื้นฐาน), มูลค่า Stock
8. Audit Log ของทุก Critical Action
9. Automated Tests

### อยู่นอกขอบเขต (Out of Scope — ทำใน Phase หลัง)
| เรื่อง | Phase |
|---|---|
| อัปโหลดรูป/Invoice, AI Extraction, Review Screen API | Phase 6 |
| AI Assistant และ Tool Calling | Phase 7 |
| Low Stock ขั้นสูง (ใช้ยอดขายเฉลี่ย/Lead Time), Overstock, Slow-moving, Purchase Recommendation, Supplier Comparison | Phase 8 |
| Notifications (FCM/APNs), Daily Briefing | Phase 8–9 |
| Deploy ขึ้น Cloud | Phase 11 |
| Multi-tenant (ใช้งาน `store_id` จริง) | อนาคต |

---

## 2. การตัดสินใจของ User

**ผล:** D1–D6 ✅ อนุมัติ · D7 ✅ เลือก **A** (สร้าง Project ทดสอบแยก)

| # | เรื่อง | ข้อเสนอของ Chat A | เหตุผล |
|---|---|---|---|
| D1 | ระบบ Login | ใช้ **Supabase Auth** (Email + Password) — Backend ตรวจ Token (JWT) ทุก Request | อยู่ใน Stack เดิม ไม่ต้องเขียนระบบรหัสผ่านเอง |
| D2 | Role ผู้ใช้ | 3 Role: `owner`, `pharmacist`, `staff` เก็บในตารางใหม่ `user_profiles` | ต้องมีตารางนี้จึงจะแยกสิทธิ์ได้ (ตาราง `auth.users` ของ Supabase ไม่มี Role ของร้าน) |
| D3 | 🔴 แก้ RLS Policy | **ลบ** Policy `authenticated_full_access` ที่ Migration 001 สร้างไว้ทุกตาราง | ดูข้อ 2.1 — เป็นช่องโหว่สำคัญ |
| D4 | ราคาขาย | เพิ่มคอลัมน์ `medicines.selling_price` | ตอนนี้ Schema ไม่มีราคาขาย ทำให้ Client ต้องส่งราคาเอง ซึ่งเสี่ยงผิดพลาด |
| D5 | วิธีต่อฐานข้อมูล | Backend ต่อ PostgreSQL โดยตรงด้วย **psycopg 3** ผ่าน **Session Pooler** ของ Supabase | การขาย/รับสินค้าต้องทำหลายตารางใน **Transaction เดียว** (สำเร็จทั้งหมดหรือยกเลิกทั้งหมด) ซึ่ง REST API ของ Supabase ทำไม่ได้ |
| D6 | Python | ใช้ **Python 3.14** + venv + **Pydantic v2 เท่านั้น** | ติดตั้งอยู่แล้ว — ต้องผ่านการทดสอบติดตั้งจริงในงาน 3.1 ก่อน หากไม่ผ่านจะเสนอ 3.13 ให้ตัดสินใจ |
| D7 | ฐานข้อมูลสำหรับทดสอบ | สร้าง **Supabase Project ที่ 2** (`ai-pharmacy-test`, Free plan) สำหรับ Automated Tests | Test จะสร้าง/ลบข้อมูลซ้ำ ๆ ไม่ควรทำบนฐานข้อมูลจริง (ตอนนี้ยังไม่มีข้อมูลจริง จึงอาจใช้ Project เดิมชั่วคราวได้ หาก User ต้องการ) |

### 2.1 รายละเอียด D3 — ปัญหา RLS ที่พบ

Migration 001 สร้าง Policy นี้ไว้ทุกตาราง:

```sql
create policy "authenticated_full_access" on public.<table>
  for all to authenticated using (true) with check (true);
```

**ผลกระทบ:** เมื่อเปิดใช้ Supabase Auth ผู้ใช้ที่ Login แล้วจะสามารถ **อ่าน/แก้/ลบ ข้อมูลทุกตารางได้โดยตรง** ผ่าน Supabase Data API โดยไม่ผ่าน Backend — เช่นแก้ `quantity_remaining` โดยไม่มี Transaction หรือ Audit

**ขัดกับ:** Blueprint ข้อ 5 และ 7.1 (Client ไม่เข้าถึง Database โดยตรง / Backend เป็น Gatekeeper)

**ข้อเสนอ:** ลบ Policy ทั้งหมด → RLS เปิดอยู่แต่ไม่มี Policy = Client เข้าถึงตรงไม่ได้เลย (Deny by default) ส่วน Backend ต่อฐานข้อมูลโดยตรงจึงทำงานได้ตามปกติ

> หมายเหตุ: รายงาน Chat A รอบก่อนระบุว่า "เปิด RLS แต่ยังไม่มี Policy" — **ไม่ถูกต้อง** ตรวจไฟล์ Migration 001 แล้วพบว่ามี Policy นี้อยู่ จึงแก้ไขข้อมูลในเอกสารนี้

---

## 3. Migration 003 (สร้างหลัง User อนุมัติ D2, D3, D4)

ไฟล์: `backend/migrations/003_auth_roles_and_pricing.sql`

```sql
begin;

-- D3: ปิดการเข้าถึงตรงจาก Client (Deny by default)
do $$
declare t text;
begin
  foreach t in array array[
    'medicines','suppliers','invoices','purchases','purchase_items',
    'medicine_lots','sales','sale_items','inventory_transactions','audit_logs'
  ]
  loop
    execute format('drop policy if exists "authenticated_full_access" on public.%I', t);
  end loop;
end;
$$;

-- D2: Role ของผู้ใช้
create table public.user_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  role        text not null check (role in ('owner', 'pharmacist', 'staff')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.user_profiles enable row level security;  -- ไม่มี Policy

create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- D4: ราคาขาย
alter table public.medicines
  add column selling_price numeric(10, 2) check (selling_price >= 0);

commit;
```

**หลังรัน ต้องตรวจ:** ไม่มี Policy เหลือใน 10 ตารางเดิม, มีตาราง `user_profiles` (รวม 11 ตาราง), `medicines.selling_price` มีอยู่จริง
**การสร้างผู้ใช้คนแรก:** User สร้างบัญชีเองใน Supabase Dashboard → Authentication แล้วเพิ่มแถวใน `user_profiles` ด้วย role `owner` (Claude Code ให้ SQL ตัวอย่าง ห้ามใส่รหัสผ่านในไฟล์ใด ๆ)

---

## 4. Technology & Libraries

| หน้าที่ | Library |
|---|---|
| Web Framework | `fastapi` |
| Server | `uvicorn` |
| ตรวจข้อมูล | `pydantic` v2, `pydantic-settings` (อ่านค่าจาก `.env`) |
| ฐานข้อมูล | `psycopg[binary]` v3, `psycopg-pool` |
| ตรวจ Token | `PyJWT[crypto]` |
| Test | `pytest`, `httpx` |

- ใช้เวอร์ชันเสถียรล่าสุด ณ วันติดตั้ง แล้ว **ล็อกเวอร์ชันจริง** ลง `backend/requirements.txt` หลังทดสอบผ่าน
- ห้ามเพิ่ม Library อื่นโดยไม่แจ้ง Chat A
- ห้ามใช้ ORM (เช่น SQLAlchemy) ใน Phase นี้ — เขียน SQL ตรงแบบ Parameterized เพื่อให้ตรวจสอบง่าย และสอดคล้องกับ Migration ที่เป็น SQL

---

## 5. โครงสร้างโฟลเดอร์ Backend

```
backend/
├── README.md
├── requirements.txt
├── .env.example            ← commit ได้ (มีแต่ชื่อตัวแปร)
├── .env                    ← ห้าม commit (อยู่ใน .gitignore)
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_add_constraints_and_indexes.sql
│   └── 003_auth_roles_and_pricing.sql
├── app/
│   ├── main.py             ← สร้าง FastAPI app, รวม routers
│   ├── config.py           ← อ่าน Settings จาก .env
│   ├── db.py               ← Connection pool + transaction helper
│   ├── auth.py             ← ตรวจ JWT, โหลด user_profile, ตรวจ Role
│   ├── errors.py           ← รูปแบบ Error กลาง
│   ├── audit.py            ← ฟังก์ชันเขียน audit_logs
│   ├── schemas/            ← Pydantic models (request/response)
│   ├── routers/            ← Endpoint แยกตามเรื่อง
│   └── services/           ← Business Logic (FEFO, รับสินค้า, ขาย, ปรับ Stock)
└── tests/
```

**หลัก:** Router รับ/ส่งข้อมูลเท่านั้น — Business Logic ทั้งหมดอยู่ใน `services/` (เพื่อให้ AI Tool ใน Phase 7 เรียกใช้ Logic เดียวกันได้)

---

## 6. Environment Variables & Secrets

`backend/.env.example`:

```
APP_ENV=development
DATABASE_URL=
SUPABASE_URL=
CORS_ORIGINS=http://localhost:3000
STORE_TIMEZONE=Asia/Bangkok
```

| ตัวแปร | ใช้ทำอะไร | ความลับ? |
|---|---|---|
| `DATABASE_URL` | Connection string แบบ **Session Pooler** (Supabase Dashboard → Connect) — มีรหัสผ่านฐานข้อมูลอยู่ในนี้ | 🔴 ลับ |
| `SUPABASE_URL` | URL ของ Project — ใช้ดึง Public Key สำหรับตรวจ JWT | ไม่ลับ |
| `CORS_ORIGINS` | โดเมน Web ที่อนุญาตให้เรียก API | ไม่ลับ |
| `STORE_TIMEZONE` | เขตเวลาของร้าน ใช้คำนวณ "วันนี้" (D9) — ค่าเริ่มต้น `Asia/Bangkok` | ไม่ลับ |

**กฎ:**
1. ค่าจริงอยู่ใน `backend/.env` บนเครื่อง User เท่านั้น — User เป็นผู้กรอกเอง
2. ห้ามส่งค่าลับในแชท, ห้ามพิมพ์ลง Log, ห้ามใส่ในเอกสาร/ไฟล์ที่ commit
3. ก่อน commit ทุกครั้ง Claude Code ต้องรัน `git status` และยืนยันว่า `.env` ไม่อยู่ในรายการ
4. **Phase 3 ยังไม่ต้องใช้ `service_role` / Secret key** — เพราะต่อฐานข้อมูลตรง และตรวจ JWT ด้วย Public Key (ลดจำนวนความลับที่ต้องเก็บ) Secret key จะเพิ่มใน Phase 6 เมื่อใช้ Storage
5. ใช้ Session Pooler แทน Direct connection เพราะ Direct connection ของ Supabase อาจต้องใช้ IPv6 ซึ่งเครือข่ายบ้านหลายแห่งไม่รองรับ
6. ถ้าค่าลับหลุด (เช่นเผลอ commit) ต้อง **Reset รหัสผ่านฐานข้อมูลทันที** และแจ้ง Chat A

### 6.1 `backend/.env.test` — ฐานข้อมูลสำหรับ Automated Tests (D7 = A)

ไฟล์แยกจาก `.env` ชี้ไปที่ Supabase Project ทดสอบ (`ai-pharmacy-test`) เท่านั้น
Template ที่ commit ได้: `backend/.env.test.example` (มีแต่ชื่อตัวแปร)

| ตัวแปร | ใช้ทำอะไร | ความลับ? |
|---|---|---|
| `TEST_DATABASE_URL` | Connection string แบบ Session Pooler ของ Project **ทดสอบ** — มีรหัสผ่านอยู่ในนี้ | 🔴 ลับ |
| `TEST_SUPABASE_URL` | URL ของ Project ทดสอบ — ใช้ตรวจ JWT | ไม่ลับ |
| `TEST_SUPABASE_PUBLISHABLE_KEY` | Publishable key ของ Project ทดสอบ — ใช้ Login ผู้ใช้ทดสอบเพื่อขอ Token | 🔴 ลับ (ไม่ commit) |

- `.gitignore` ข้าม `.env` และ `.env.*` ทั้งหมด ยกเว้น `.env.example` และ `.env.test.example`
- Test ที่แตะฐานข้อมูล **ห้ามรันบน Project จริง** — ถ้า `.env.test` ไม่มีค่า ให้ข้าม Test กลุ่มนั้น

---

## 7. Authentication & Authorization

### 7.1 ขั้นตอน
```
Client → Login กับ Supabase Auth → ได้ Access Token (JWT)
Client → เรียก API พร้อม Header: Authorization: Bearer <token>
Backend → ตรวจลายเซ็น JWT ด้วย Public Key (JWKS) ของ Project
        → ตรวจวันหมดอายุ Token
        → โหลด user_profiles (ต้องมีและ is_active = true)
        → ตรวจ Role กับสิทธิ์ของ Endpoint
```
- ไม่มี Token / Token ผิด → `401`
- มี Token แต่ไม่มี Profile, ถูกปิดใช้งาน หรือสิทธิ์ไม่พอ → `403`
- Public Key ต้อง Cache ไว้ ไม่ดึงใหม่ทุก Request

### 7.2 ตารางสิทธิ์ (ข้อเสนอ — ส่วนหนึ่งของ D2)

| การกระทำ | owner | pharmacist | staff |
|---|:-:|:-:|:-:|
| ดูยา / Stock / Lot / รายงานพื้นฐาน | ✅ | ✅ | ✅ |
| ขายยา | ✅ | ✅ | ✅ |
| ดูต้นทุน (cost) และมูลค่า Stock รายรายการ | ✅ | ✅ | ❌ |
| ดูรายงานมูลค่าคลังรวม (`/reports/inventory-value`) | ✅ | ❌ (D20) | ❌ |
| เพิ่ม/แก้ยา, Supplier | ✅ | ✅ | ❌ |
| รับสินค้า (Purchase) | ✅ | ✅ | ❌ |
| ปรับ Stock (Adjustment) | ✅ | ✅ | ❌ |
| ดู Audit Log | ✅ | ❌ | ❌ |
| จัดการผู้ใช้ | ✅ (ผ่าน Dashboard ใน Phase 3) | ❌ | ❌ |

- สำหรับ `staff` Response ต้อง **ไม่มี** ฟิลด์ต้นทุน (`cost_per_unit`, `unit_cost`, `stock_value`)

---

## 8. มาตรฐาน API

- **Base path:** `/api/v1`
- **รูปแบบ:** JSON, ชื่อฟิลด์ `snake_case`
- **เงิน:** ส่งเป็น **string ทศนิยม 2 ตำแหน่ง** (เช่น `"80.00"`) และใช้ `Decimal` ใน Python — ห้ามใช้ `float`
- **วันที่:** `YYYY-MM-DD`, เวลา: ISO 8601 พร้อม Timezone
- **ID:** UUID
- **Pagination (แบ่งหน้า):** `?limit=50&offset=0` (limit สูงสุด 200) — Response:
  ```json
  { "items": [...], "total": 123, "limit": 50, "offset": 0 }
  ```
- **Error กลาง:**
  ```json
  {
    "error": {
      "code": "INSUFFICIENT_STOCK",
      "message": "จำนวนยาในสต็อกไม่เพียงพอ",
      "details": { "medicine_id": "...", "requested": 10, "available": 6 }
    }
  }
  ```
  - `message` เป็นภาษาไทยที่ผู้ใช้เข้าใจได้
  - ห้ามส่ง Technical error / SQL / Stack trace ให้ Client (บันทึกใน Log ฝั่ง Server แทน)

| HTTP | code ตัวอย่าง |
|---|---|
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `INSUFFICIENT_STOCK`, `DUPLICATE`, `INVALID_STATE` |
| 500 | `INTERNAL_ERROR` |

- **Logging:** ห้ามพิมพ์ Token, Connection string หรือรหัสผ่านลง Log

---

## 9. รายการ Endpoints

### 9.1 System
| Method | Path | สิทธิ์ | คำอธิบาย |
|---|---|---|---|
| GET | `/health` | ไม่ต้อง Login | สถานะ API + ต่อฐานข้อมูลได้หรือไม่ (ไม่เปิดเผยรายละเอียดภายใน) |
| GET | `/api/v1/me` | ทุก Role | ข้อมูลผู้ใช้และ Role ของตัวเอง |

### 9.2 Medicines
| Method | Path | สิทธิ์ | คำอธิบาย |
|---|---|---|---|
| GET | `/api/v1/medicines` | ทุก Role | ค้นหา `?q=` (ชื่อ/ชื่อสามัญ/barcode), `?category=`, `?is_active=` + รวมยอด Stock ที่ขายได้ |
| GET | `/api/v1/medicines/{id}` | ทุก Role | รายละเอียด + ยอด Stock รวม |
| GET | `/api/v1/medicines/by-barcode/{barcode}` | ทุก Role | ค้นด้วย Barcode |
| POST | `/api/v1/medicines` | owner, pharmacist | เพิ่มยา |
| PATCH | `/api/v1/medicines/{id}` | owner, pharmacist | แก้ไขยา (บันทึก Audit ค่าเก่า/ใหม่) |

- **ไม่มี DELETE** — ใช้ `is_active = false` แทน เพื่อรักษาประวัติ
- Barcode ซ้ำ → `409 DUPLICATE`
- การรวม/จับคู่ยาที่ชื่อคล้ายกัน **ไม่อยู่ใน Phase 3** (Phase 6)

### 9.3 Suppliers
| Method | Path | สิทธิ์ |
|---|---|---|
| GET | `/api/v1/suppliers` | owner, pharmacist |
| GET | `/api/v1/suppliers/{id}` | owner, pharmacist |
| POST | `/api/v1/suppliers` | owner, pharmacist |
| PATCH | `/api/v1/suppliers/{id}` | owner, pharmacist |

### 9.4 Lots & Stock
| Method | Path | สิทธิ์ | คำอธิบาย |
|---|---|---|---|
| GET | `/api/v1/medicines/{id}/lots` | ทุก Role | Lot ของยา เรียงตาม FEFO, `?include_inactive=` |
| GET | `/api/v1/lots/{id}` | ทุก Role | รายละเอียด Lot |
| GET | `/api/v1/lots/{id}/transactions` | owner, pharmacist | ประวัติการเคลื่อนไหวของ Lot |
| GET | `/api/v1/medicines/{id}/fefo-preview?quantity=` | ทุก Role | แสดงว่าถ้าขายจำนวนนี้ จะตัดจาก Lot ไหนเท่าไหร่ (ไม่บันทึกอะไร) |
| POST | `/api/v1/lots/{id}/adjustments` | owner, pharmacist | ปรับ Stock (ดูข้อ 10.3) |

- **ห้ามมี Endpoint ที่แก้ `quantity_remaining`, `cost_per_unit`, `expiry_date`, `lot_number` ตรง ๆ** — การแก้ Lot ที่บันทึกผิดให้ทำผ่าน Adjustment ประเภท `correction` (ข้อมูลที่ไม่ใช่จำนวน จะเพิ่ม Endpoint แก้ไขพร้อมเหตุผลใน Phase หลังหากจำเป็น — ต้องขออนุมัติ)

### 9.5 Purchases (รับสินค้า)
| Method | Path | สิทธิ์ | คำอธิบาย |
|---|---|---|---|
| POST | `/api/v1/purchases` | owner, pharmacist | สร้าง Purchase สถานะ `draft` พร้อมรายการ |
| GET | `/api/v1/purchases` | owner, pharmacist | รายการ, กรอง `?status=`, `?supplier_id=`, `?date_from=`, `?date_to=` |
| GET | `/api/v1/purchases/{id}` | owner, pharmacist | รายละเอียด + รายการ |
| PUT | `/api/v1/purchases/{id}` | owner, pharmacist | แก้ไขได้เฉพาะตอน `draft` |
| POST | `/api/v1/purchases/{id}/confirm` | owner, pharmacist | ยืนยันรับสินค้า → สร้าง Lot + Transaction (ข้อ 10.1) |
| DELETE | `/api/v1/purchases/{id}` | owner, pharmacist | ลบได้เฉพาะ `draft` (บันทึก Audit) |

ตัวอย่าง Request สร้าง Purchase:
```json
{
  "supplier_id": "uuid",
  "purchase_date": "2026-09-15",
  "discount_amount": "0.00",
  "tax_amount": "0.00",
  "items": [
    {
      "medicine_id": "uuid",
      "quantity_invoiced": 20,
      "quantity_actual": 18,
      "unit_cost": "80.00",
      "lot_number": "ABC123",
      "expiry_date": "2027-06-30"
    }
  ]
}
```
- Backend **คำนวณ** `subtotal` และ `total_amount` เอง (ไม่เชื่อค่าจาก Client)
- `invoice_id` ยังไม่ใช้ใน Phase 3 (ใช้ใน Phase 6)

### 9.6 Sales
| Method | Path | สิทธิ์ | คำอธิบาย |
|---|---|---|---|
| POST | `/api/v1/sales` | ทุก Role | บันทึกการขาย (ข้อ 10.2) |
| GET | `/api/v1/sales` | ทุก Role | รายการขาย `?date_from=`, `?date_to=` |
| GET | `/api/v1/sales/{id}` | ทุก Role | รายละเอียด + Lot ที่ถูกตัด |

> **D11:** `staff` ต้องขายตาม `medicines.selling_price` — ส่ง `unit_price` ที่ต่างจากราคาขาย → `403` และให้ส่วนลดไม่ได้ (`discount_amount` > 0 → `403`); `owner` / `pharmacist` ปรับราคาและให้ส่วนลดได้ โดยบันทึก `price_override` ใน Audit

ตัวอย่าง Request:
```json
{
  "discount_amount": "0.00",
  "items": [
    { "medicine_id": "uuid", "quantity": 10, "unit_price": "95.00" }
  ]
}
```
- `unit_price` ไม่ส่งได้ → ใช้ `medicines.selling_price`; ถ้ายาไม่มีราคาขายและไม่ได้ส่งมา → `400`
- `tax_amount` = 0 ใน Phase 3 (การคำนวณ VAT ต้องตัดสินใจภายหลัง)
- **การยกเลิกการขาย (Void/Return)** ไม่อยู่ใน Phase 3 — ใช้ Adjustment ประเภท `return` แทนชั่วคราว

### 9.7 Reports (รายงานพื้นฐาน)
| Method | Path | สิทธิ์ | คำอธิบาย |
|---|---|---|---|
| GET | `/api/v1/reports/stock` | ทุก Role (staff ไม่เห็นมูลค่า) | Stock รวมรายยา |
| GET | `/api/v1/reports/expiring?days=180` | ทุก Role | Lot ใกล้หมดอายุ + ระดับความเสี่ยง |
| GET | `/api/v1/reports/expired` | ทุก Role | Lot ที่หมดอายุแล้วแต่ยังมีจำนวนคงเหลือ |
| GET | `/api/v1/reports/low-stock` | ทุก Role | ยาที่ Stock ขายได้ ≤ `reorder_point` (แบบพื้นฐาน) |
| GET | `/api/v1/reports/inventory-value` | **owner เท่านั้น** (D20) | มูลค่า Stock รวม / รายยา / ราย Category |

ระดับความเสี่ยงหมดอายุ (ตาม `02-database-schema.md` ข้อ 4.2):

| ระดับ | วันคงเหลือ |
|---|---|
| 🔴 `critical` | ≤ 30 |
| 🟠 `high_risk` | ≤ 90 |
| 🟡 `warning` | ≤ 180 |
| 🟢 `normal` | > 180 |

### 9.8 Audit
| Method | Path | สิทธิ์ |
|---|---|---|
| GET | `/api/v1/audit-logs?table_name=&record_id=` | owner |

---

## 10. Business Logic หลัก

**กฎรวม:** ทุก Workflow ที่แก้ Stock ต้องอยู่ใน **Database Transaction เดียว** — ถ้าขั้นใดผิดพลาด ต้องยกเลิกทั้งหมด (Rollback) ไม่มีกรณีบันทึกครึ่งเดียว

### 10.1 ยืนยันรับสินค้า (`POST /purchases/{id}/confirm`)
1. ล็อกแถว Purchase (`SELECT ... FOR UPDATE`) — ต้องเป็น `draft` ไม่เช่นนั้น `409 INVALID_STATE` (กันการยืนยันซ้ำ)
2. Validate ทุกรายการ: จำนวน ≥ 0, `unit_cost` ≥ 0, `expiry_date` เป็นวันที่ถูกต้อง, ยามีอยู่จริงและ `is_active`
   - ถ้า `expiry_date` <= วันนี้ (ตาม D9) → ปฏิเสธ `400`
3. สำหรับแต่ละรายการ:
   - จำนวนที่รับจริง = `quantity_actual` ถ้ามี ไม่เช่นนั้นใช้ `quantity_invoiced`
   - ถ้าจำนวนจริง > 0 → สร้าง `medicine_lots` (`quantity_received = quantity_remaining =` จำนวนจริง, `cost_per_unit = unit_cost`, `supplier_id`, `purchase_item_id`)
   - สร้าง `inventory_transactions`: `type='purchase'`, `quantity_before=0`, `quantity_change=+จำนวน`, `quantity_after=จำนวน`, `reference_type='purchase'`, `reference_id=purchase.id`
4. ถ้ามีรายการใดที่ `quantity_actual ≠ quantity_invoiced` → `status='discrepancy'` ไม่เช่นนั้น `status='confirmed'`
   - Response ต้องแสดงรายการที่ไม่ตรง เช่น `Invoice: 20 / Actual: 18`
5. เขียน `audit_logs`
6. Commit

> Lot Number เดียวกันของยาตัวเดียวกันที่รับคนละครั้ง จะเป็นคนละแถว Lot (เพราะต้นทุน/วันที่รับอาจต่างกัน) — ไม่รวมกันอัตโนมัติ

### 10.2 ขายยา FEFO (`POST /sales`)
1. Validate: `quantity` > 0, ยามีอยู่จริงและ `is_active`
2. สำหรับแต่ละยา ล็อก Lot ที่ขายได้ **เรียงตาม FEFO**:
   ```sql
   SELECT ... FROM medicine_lots
   WHERE medicine_id = %s AND status = 'active'
     AND quantity_remaining > 0 AND expiry_date > business_today  -- ตาม D9, D10
   ORDER BY expiry_date ASC, received_date ASC, id
   FOR UPDATE
   ```
3. รวมจำนวนที่ขายได้ ถ้าไม่พอ → `409 INSUFFICIENT_STOCK` (ยกเลิกทั้งบิล)
4. ตัดจาก Lot แรกก่อน ถ้าไม่พอจึงตัด Lot ถัดไป — **1 Lot ที่ถูกตัด = 1 แถว `sale_items`**
5. แต่ละ Lot: ลด `quantity_remaining`, ถ้าเหลือ 0 → `status='depleted'`, สร้าง `inventory_transactions` (`type='sale'`, จำนวนติดลบ, before/after ถูกต้อง)
6. Backend คำนวณ `subtotal`, `total_amount = รวม − discount` (ต้องไม่ติดลบ)
7. เขียน `audit_logs` แล้ว Commit
8. Response แสดง Lot ที่ถูกตัด เพื่อให้พนักงานหยิบยาถูก Lot

> **ยาที่หมดอายุแล้วขายไม่ได้เด็ดขาด** — ถูกคัดออกตั้งแต่ Query ในข้อ 2
> Phase 3 ใช้ FEFO อัตโนมัติ การให้ผู้ใช้เลือก Lot เองอยู่นอกขอบเขต (ต้องขออนุมัติหากต้องการ)

### 10.3 ปรับ Stock (`POST /lots/{id}/adjustments`)
```json
{ "transaction_type": "damage", "quantity_change": -2, "reason": "กล่องแตกระหว่างจัดเรียง" }
```
- `transaction_type` ได้เฉพาะ: `adjustment`, `damage`, `expired`, `return`, `correction`
- `reason` **บังคับ** (ไม่ว่าง)
- `quantity_change` ≠ 0 และผลลัพธ์ต้องไม่ติดลบ
- ล็อกแถว Lot → อัปเดต → สร้าง Transaction (`reference_type='adjustment'`, `notes=reason`) → Audit
- ถ้าเหลือ 0: `damage` → `status='damaged'`, `expired` → `status='expired'`, อื่น ๆ → `status='depleted'`
- ถ้าเพิ่มจำนวนใน Lot ที่ `depleted` → กลับเป็น `active` (หากยังไม่หมดอายุ)

### 10.4 Lot หมดอายุ
- Phase 3 **ไม่เปลี่ยนสถานะอัตโนมัติ** — Lot หมดอายุถูกกันไม่ให้ขายด้วยเงื่อนไข `expiry_date` อยู่แล้ว และแสดงใน `/reports/expired`
- การตัดออกจาก Stock ให้ owner/pharmacist ทำผ่าน Adjustment ประเภท `expired` (มีประวัติและเหตุผล)
- งานตั้งเวลาอัตโนมัติ (Scheduled Job) → Phase 8

### 10.5 Audit Log
- เขียนใน Transaction เดียวกับการเปลี่ยนแปลงข้อมูล
- บันทึก: `table_name`, `record_id`, `action`, `old_value`, `new_value`, `changed_by` (จาก Token), `reason` (ถ้ามี)
- ใช้กับ: medicines, suppliers, purchases (สร้าง/แก้/ลบ/ยืนยัน), sales, lot adjustments

---

## 11. การทดสอบ (Automated Tests)

รันด้วย `pytest` บนฐานข้อมูลทดสอบ (ตาม D7) — ห้ามรันบนข้อมูลจริง

**วิธีรัน** (ในโฟลเดอร์ `backend/` และเปิด `.venv`):

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `pytest -m "not db"` | Unit tests อย่างเดียว ไม่ต่อฐานข้อมูล (ใช้ได้เสมอ) |
| `pytest -m db` | Integration tests บน Project ทดสอบ ต้องมี `backend/.env.test` ครบ (ดูข้อ 6.1) |
| `pytest` | ทั้งหมด — กลุ่ม `db` จะถูกข้ามอัตโนมัติถ้าไม่มี `.env.test` |

**ต้องมี Test อย่างน้อย:**
1. Health check ทำงาน
2. ไม่มี Token → 401 / Token ผิด → 401 / Role ไม่พอ → 403
3. `staff` ไม่เห็นฟิลด์ต้นทุน
4. สร้างยา, Barcode ซ้ำ → 409
5. รับสินค้า: สร้าง Lot + Transaction ถูกต้อง, ยืนยันซ้ำ → 409, จำนวนไม่ตรง → `discrepancy`
6. **FEFO:** 3 Lot (EXP ต่างกัน) ขายแล้วตัด Lot ที่หมดอายุก่อนสุดก่อน
7. **FEFO ข้าม Lot:** ขายเกิน Lot แรก → ตัด 2 Lot และได้ 2 `sale_items`
8. Lot หมดอายุแล้ว **ไม่ถูกขาย**
9. Stock ไม่พอ → 409 และ **ไม่มีข้อมูลใดถูกบันทึก** (ตรวจ Rollback)
10. Data Integrity: หลังการขาย `quantity_before + change = after` และยอด Lot ตรงกับผลรวม Transaction
11. Adjustment ไม่มีเหตุผล → 400, ทำให้ติดลบ → 400
12. ทุก Critical Action มีแถวใน `audit_logs`
13. **ขายพร้อมกัน 2 Request** กับ Lot ที่เหลือพอสำหรับ 1 รายการ → สำเร็จ 1, ล้มเหลว 1, Stock ไม่ติดลบ

### 11.1 เจอ 404 ที่ endpoint ใหม่ — ตรวจเซิร์ฟเวอร์ก่อนไล่หาบั๊ก

🔴 **endpoint ที่คอมมิตแล้ว ไม่ได้แปลว่าเซิร์ฟเวอร์ที่กำลังรันอยู่มีมัน**

`uvicorn` ที่รันโดยไม่มี `--reload` จะถือโค้ด ณ วินาทีที่สตาร์ทไว้ตลอด
process ที่สตาร์ทไว้ก่อนคอมมิตจึงตอบ **404** ให้ route ที่เพิ่งเพิ่ม ทั้งที่โค้ดถูกต้องทุกบรรทัด

เกิดขึ้นจริงกับ `GET /reports/sales-timeseries` (คอมมิต `1e7b5f2`) — เสียเวลาไล่หาสาเหตุที่ฝั่งโค้ด
ทั้งที่ต้องทำแค่รีสตาร์ท

**ลำดับตรวจเมื่อ endpoint ใหม่ตอบ 404:**

1. เซิร์ฟเวอร์ที่รันอยู่ สตาร์ทหลังคอมมิตที่เพิ่ม route นั้นหรือยัง — ถ้าไม่แน่ใจ **รีสตาร์ทก่อน**
2. `GET /openapi.json` มี path นั้นไหม — ถ้าไม่มีแปลว่าเซิร์ฟเวอร์ไม่รู้จักจริง ๆ
3. ค่อยไปดู prefix ของ router และลำดับการประกาศ route

ข้อเดียวกันนี้ใช้กับฝั่งเว็บด้วย: ค่า `NEXT_PUBLIC_*` ถูกอ่านตอนสตาร์ท
แก้ `.env.local` แล้วต้องรีสตาร์ท `npm run dev` เสมอ

---

## 12. ลำดับงานสำหรับ Claude Code (Chat D)

ทำ **ทีละงาน** และรายงาน Chat A หลังจบแต่ละงานที่มีเครื่องหมาย 🛑

| งาน | รายละเอียด | หยุดรายงาน |
|---|---|---|
| 3.1 | สร้าง venv, ติดตั้ง Library ข้อ 4 บน Python 3.14, รัน `import` ทดสอบ, สร้าง `requirements.txt` | 🛑 (ยืนยัน D6) |
| 3.2 | User กรอก `backend/.env` เอง → ทดสอบต่อฐานข้อมูล (`SELECT 1`) โดยไม่แสดงค่าลับ | 🛑 |
| 3.3 | สร้างและรัน Migration 003 → ตรวจผลตามข้อ 3 → User สร้างผู้ใช้ owner คนแรก | 🛑 |
| 3.4 | โครงสร้างข้อ 5, config, db, errors, `/health` | |
| 3.5 | Auth + `/me` + ตรวจ Role | 🛑 |
| 3.6 | Medicines + Suppliers | |
| 3.7 | Purchases + Confirm | 🛑 |
| 3.8 | Sales (FEFO) + FEFO preview (`/medicines/{id}/fefo-preview` — ใช้ logic เดียวกับการขาย) | 🛑 |
| 3.9 | Adjustments + Lots + Reports + Audit endpoint (fefo-preview ย้ายไป 3.8 แล้ว) | |
| 3.10 | Tests ครบข้อ 11 + อัปเดต `backend/README.md` (วิธีติดตั้ง/รัน) | 🛑 Final |

**กฎระหว่างทำ:**
- ห้ามแก้ Schema นอกเหนือ Migration 003 — ถ้าพบว่าต้องแก้ ให้หยุดและรายงาน Chat A
- ห้ามแก้ไฟล์ Migration 001/002 ที่รันไปแล้ว
- Commit แยกตามงาน เช่น `Phase 3.6: Add medicines and suppliers endpoints`
- ก่อน commit ตรวจ `git status` ว่าไม่มี `.env`
- เปิดเอกสาร API อัตโนมัติของ FastAPI (`/docs`) ได้เฉพาะ `APP_ENV=development`

---

## 13. เกณฑ์ผ่าน Phase 3 (Gate)

✅ **Phase 3 Complete — Chat A อนุมัติ 17 ก.ย. 2026 (241 unit + 41 integration tests)**

- [x] D1–D6 ได้รับการอนุมัติและบันทึกไว้
- [x] D7 เลือกทางเลือกแล้ว (A)
- [x] Migration 003 รันสำเร็จและตรวจผลครบ
- [x] Endpoints ข้อ 9 ครบ และทำงานตาม Business Logic ข้อ 10
- [x] Tests ข้อ 11 ผ่านทั้งหมด
- [x] ไม่มีค่าลับใน Repository (ตรวจประวัติ commit)
- [x] Client เข้าถึงตารางตรงผ่าน Supabase Data API ไม่ได้ (ทดสอบจริง)
- [x] `backend/README.md` อธิบายวิธีติดตั้งและรันได้
- [x] อัปเดตสถานะใน README และ Blueprint **หลัง** Chat A อนุมัติเท่านั้น
- [x] Chat A ตรวจและอนุมัติ

---

## 14. ประเด็นที่ยังเปิดอยู่ (ไม่กระทบการเริ่ม Phase 3)

| ประเด็น | ต้องตัดสินใจก่อน |
|---|---|
| การคิด VAT ในการขาย | Phase 4 (Mobile ขายจริง) |
| การยกเลิกบิลขาย (Void) แบบเต็มรูปแบบ | Phase 4 |
| หน่วยขาย (กล่อง/แผง/เม็ด) — ตอนนี้ระบบนับเป็นหน่วยเดียว | Phase 4 |
| ที่ Deploy Backend | Phase 11 |
| เริ่มรองรับหลายร้าน (Multi-tenant: ตาราง `stores`, สมาชิกร้าน, Role ต่อร้าน) — ต้องผ่าน Change Control | ก่อน Phase 5 |

## 15. บันทึกการตัดสินใจระหว่าง Phase 3

| # | วันที่ | เรื่อง | ผล |
|---|---|---|---|
| D8 | 16 ก.ย. 2026 | ระบบจัดการผู้ใช้ (เพิ่มผู้ใช้/เปลี่ยน Role/ปิดบัญชี) | **เลื่อนไป Phase 5** (Web Dashboard) — ต้องออกแบบให้ขยายเป็นหลายร้านได้ (Role ผูกกับร้าน ไม่ใช่ผู้ใช้โดยตรง). ระหว่างนี้จัดการผ่าน Supabase Dashboard + SQL |
| — | 16 ก.ย. 2026 | ปิด Smart App Control บนเครื่องพัฒนา | เพื่อให้ psycopg (binary) ทำงานได้ — D5/D6 ไม่เปลี่ยน |
| — | 16 ก.ย. 2026 | ปิด "Allow new users to sign up" ใน Supabase Auth | ✅ ทำแล้ว |
| — | 16 ก.ย. 2026 | รหัสผ่านฐานข้อมูล | User เลือกใช้รหัสเดิม — **ต้องเปลี่ยนก่อน Production (Phase 11)** |
| — | 17 ก.ย. 2026 | Port ของ Server บนเครื่องพัฒนา | ใช้ **8001** เพราะ port 8000 ถูกโปรแกรม `splunkd` ใช้อยู่ |
| — | 17 ก.ย. 2026 | Project ทดสอบ | `ai-pharmacy-test` ref `ftulvwmjyowcnyhkobzx` (Chat A สร้างและรัน migration 001–003 + ผู้ใช้ทดสอบให้แล้ว) |
| D7 | 17 ก.ย. 2026 | ฐานข้อมูลสำหรับ Automated Tests | เลือก **A** — สร้าง Supabase Project แยก (`ai-pharmacy-test`, Free plan) ก่อนงาน 3.10 |
| D9 | 17 ก.ย. 2026 | เขตเวลาของ "วันนี้" | **A** — ใช้ Asia/Bangkok ผ่านค่า STORE_TIMEZONE; คำนวณใน SQL ไม่ใช้ CURRENT_DATE ของฐานข้อมูล (UTC) |
| D10 | 17 ก.ย. 2026 | ขายยาในวัน EXP | **A** — ไม่ขาย และไม่รับเข้า: ขายได้/รับได้เฉพาะ expiry_date > วันนี้ |
| D11 | 17 ก.ย. 2026 | staff เปลี่ยนราคา/ให้ส่วนลด | **A** — staff ต้องใช้ selling_price และ discount = 0 (ไม่งั้น 403); owner/pharmacist ปรับได้และบันทึก audit |
| D12 | 17 ก.ย. 2026 | เครื่องมือ Mobile | ลงไดรฟ์ D:, ทดสอบด้วย Emulator (ไม่มีมือถือ Android) — ใช้เมื่อถึง Phase 4 |
| D13 | 17 ก.ย. 2026 | ลำดับ Phase | สลับ: ทำ Phase 5 (Web) ก่อน Phase 4 (Mobile); Phase 6+ ไม่เปลี่ยน |
| D19 | 18 ก.ย. 2026 | วันหมดอายุที่แสดงบนหน้าจอ | ยาขายได้ถึงวันก่อน `expiry_date` (Backend ใช้ `expiry_date > วันนี้` ตาม D10) — เว็บแสดง "เหลือกี่วัน" = `days_remaining` ของ API **− 1** และคำนวณที่ `lib/format/expiry.ts` จุดเดียว |
| D20 | 18 ก.ย. 2026 | สิทธิ์ดูรายงานมูลค่าคลังรวม | `GET /reports/inventory-value` เป็นของ **owner เท่านั้น** (pharmacist / staff → `403`) — ต่างจากการดูต้นทุนรายรายการที่ pharmacist ยังดูได้ |
| D21 | 19 ก.ย. 2026 | ใบเสร็จกับข้อมูลร้าน | ใบเสร็จใช้ข้อมูลร้าน **ปัจจุบัน** เสมอ ไม่เก็บสำเนา ณ วันขาย — แก้ที่อยู่แล้วพิมพ์ใบเสร็จเก่าซ้ำจะขึ้นที่อยู่ใหม่ (พฤติกรรมที่ตั้งใจของ MVP). เก็บที่ตาราง `store_profile` **ระเบียนเดียว** (Migration 005) — `GET /api/v1/store` ทุก Role ที่ล็อกอินอ่านได้ และตอบ `200` พร้อมค่า `null` เมื่อยังไม่เคยบันทึก (**ไม่ตอบ `404`**); `PATCH /api/v1/store` เฉพาะ **owner** (ครั้งแรกต้องมี `name`) และบันทึก `audit_logs` ด้วย `table_name = 'store_profile'` |
| D22 | 19 ก.ย. 2026 | การบังคับเปลี่ยนรหัสผ่านครั้งแรก | **ไม่ทำใน Phase 5** · มีเฉพาะ U-6 (`POST /api/v1/me/change-password`) ให้ผู้ใช้เปลี่ยนรหัสผ่านของตัวเอง · **ห้ามมีข้อความบังคับเปลี่ยนรหัสผ่านบนหน้าจอใด ๆ** และไม่มีฟิลด์ `must_change_password` · ยกนโยบายรหัสผ่านทั้งชุดไป Phase 10 |
| D23 | 19 ก.ย. 2026 | กันปรับ Stock ทับกัน | `POST /lots/{id}/adjustments` รับฟิลด์ใหม่ **`quantity_before`** (ไม่บังคับ เพื่อไม่ให้ของเดิมพัง) — ถ้าค่าที่ส่งมาไม่ตรงกับ `quantity_remaining` จริงใน transaction เดียวกัน → **`409 INVALID_STATE`** ข้อความ "จำนวนคงเหลือเปลี่ยนไป กรุณาตรวจนับใหม่"; ไม่ส่งมา = ทำงานแบบเดิม. รายละเอียดที่ `docs/05-web-spec.md` ภาคผนวก 2 — ✅ **ทำแล้ว** (งาน 5.3 ขั้นที่ 1) |
| D24 | 19 ก.ย. 2026 | ฟิลด์เพิ่มใน `/reports/stock` และชื่อฟิลด์ที่เป็นทางการ | `GET /reports/stock` คืน `lot_count` · `nearest_expiry` · `days_remaining` (ค่าดิบ) · `risk_level` เพิ่ม — ถือเป็น **ช่องว่างของการ implement กลุ่มเดียวกับ B-5/B-14 ไม่ใช่ Feature ใหม่** (รับรองย้อนหลังหลังงาน 5.3). ชื่อฟิลด์จริงคือ **`available_quantity` / `available_value`** (ไม่ใช่ `sellable_quantity` / `stock_value`) — **ห้ามเปลี่ยนชื่อใน Backend**; ถ้าเอกสารขัดกับ `docs/03-api-openapi.json` ให้ยึด OpenAPI แล้วแก้เอกสาร |
| D25 | 19 ก.ย. 2026 | `unit` ใน 2 รายงานที่ยังขาด | `GET /reports/expired` และ `GET /reports/low-stock` คืน `unit` ของยาตัวนั้นเพิ่ม — เพิ่มล้วน กลุ่มเดียวกับ D24 · เหตุผล: กฎ "ทุกตัวเลขจำนวนต้องมีหน่วยกำกับเสมอ" ไม่มีข้อยกเว้น · ฝั่งเว็บถอดวิธีแก้ขัดที่ดึงหน่วยจาก `/reports/stock` มาแมปออก (พลาดเมื่อผลถูกแบ่งหน้า) |
| D26 | 19 ก.ย. 2026 | เลขที่บิล (`sales.sale_no`) | รูปแบบ **`S-YYMMDD-NNN`** — `YYMMDD` = business date ตาม Asia/Bangkok เป็น **พ.ศ. 2 หลักท้าย** (18 ก.ย. 2569 → `690918`) · `NNN` = ลำดับรันใหม่ทุกวันเริ่ม `001` อย่างน้อย 3 หลัก เกิน 999 ขยายหลักต่อ **ห้ามวนกลับ** · ออกเลข **ใน transaction เดียวกับการบันทึกการขาย** · `UNIQUE INDEX sales_sale_no_key` เป็นตัวกันชน ชนแล้ว **retry ทั้ง transaction สูงสุด 5 ครั้ง** ครบแล้วยังชน → `409 INVALID_STATE` **ห้ามบันทึกโดยไม่มีเลข** · Migration 006 (เพิ่มคอลัมน์ → backfill → NOT NULL → unique) |
| D27 | 19 ก.ย. 2026 | ชื่อผู้ขายบนใบเสร็จ | `GET /sales/{id}` และ `POST /sales` คืน `sold_by_name` โดย join `user_profiles` จาก **`sales.created_by` เท่านั้น** — **ห้ามใช้ผู้ใช้ที่ล็อกอินอยู่ตอนพิมพ์** (พิมพ์ซ้ำจะได้ชื่อผิดคน) · ไม่พบ profile → `null` และหน้าใบเสร็จ **ซ่อนบรรทัดผู้ขายทั้งบรรทัด** ไม่พิมพ์ขีดหรือคำว่าไม่ระบุ |
| D28 | 19 ก.ย. 2026 | เลขที่ใบส่งของ (`purchases.invoice_no`) | คอลัมน์ `text` **nullable** (Migration 008) — ร่างบันทึกได้โดยยังไม่กรอก แต่ตอน `POST /purchases/{id}/confirm` **ต้องไม่ว่าง ไม่งั้น `400 VALIDATION_ERROR`** "กรุณากรอกเลขที่ใบส่งของก่อนยืนยันรับสินค้า" · หน้าจอทำเป็นช่องบังคับ * · **ห้ามใช้ตาราง `invoices`** (สงวนไว้ให้ OCR Phase 8 และ `file_url` เป็น NOT NULL จะต้องใส่ค่าปลอม ผิดกฎข้อ 4) |
| D29 | 19 ก.ย. 2026 | เลขที่ใบรับสินค้า (`purchases.purchase_no`) | รูปแบบ **`R-YYMMDD-NNN`** กติกาเดียวกับ D26 ทุกอย่าง · **ออกเลขเฉพาะตอนออกจากสถานะ `draft`** (เป็น `confirmed` หรือ `discrepancy`) ใน transaction เดียวกับการ confirm — ทิ้งร่างแล้วเลขไม่เป็นรู · คอลัมน์ **nullable ห้ามตั้ง NOT NULL** (ไม่งั้นสร้างร่างไม่ได้) ใช้ `CHECK (status = 'draft' OR purchase_no IS NOT NULL)` แทน · `UNIQUE INDEX` ตามปกติ (NULL หลายแถวไม่ชนกัน) · ชนแล้ว retry ทั้ง transaction 5 ครั้ง ครบแล้ว `409 INVALID_STATE` |
| D30 | 19 ก.ย. 2026 | ผู้รับของ + เวลาที่รับ | `created_by_name` join `user_profiles` จาก **`purchases.created_by` เท่านั้น** ไม่พบ → `null` (เหมือน D27) · `confirmed_at timestamptz nullable` เซ็ตใน transaction เดียวกับ confirm · backfill แถวเดิมที่ confirmed แล้วด้วย `created_at` · **ใบรับ A4 พิมพ์วันที่จาก `confirmed_at` ไม่ใช่ `created_at`** (เปิดร่างวันจันทร์ นับของวันพุธ ใบรับต้องขึ้นวันพุธ) |
| D31 | 19 ก.ย. 2026 | ชื่อเจ้าของร้าน + เลขผู้เสียภาษี | เพิ่ม `store_profile.owner_name text` (Migration 007) — **ข้อความอิสระ เจ้าของหลายคนพิมพ์รวมช่องเดียว ห้ามแยก `owner_1`/`owner_2` ห้ามสร้างตารางใหม่ (กฎข้อ 66)** · `tax_id` **มีอยู่แล้วตั้งแต่ Migration 005** จึงไม่ต้องเพิ่ม · เอกสารที่พิมพ์: พิมพ์ `owner_name` เมื่อมีค่า ไม่มีให้ซ่อนทั้งบรรทัด · 🔴 **ห้ามพิมพ์ `tax_id` บนใบเสร็จใน Phase 5** เก็บในฐานข้อมูลอย่างเดียว (ใบเสร็จไม่ใช่ใบกำกับภาษี — รอ Chat A ยืนยันสถานะจดทะเบียนของร้าน) · **ห้าม seed ข้อมูลร้านจริงลง migration/code/git** ผู้ใช้กรอกเองที่ `/settings/store` |
| D32 | 19 ก.ย. 2026 · แก้ 23 ก.ย. 2026 | สิทธิ์เห็นต้นทุนในหน้าประวัติ | **ประวัติรับสินค้าและต้นทุน จำกัดที่ระดับหน้า** ด้วยสิทธิ์ `viewReports` = **owner + pharmacist** · staff เปิดหน้านี้ไม่ได้เลย ทั้งเมนูและการพิมพ์ URL ตรง ๆ · เหตุผล: pharmacist เป็นคนรับของจึงเห็นต้นทุนอยู่แล้วตอนรับ แต่ staff ไม่เคยมีเหตุต้องเห็น — สอดคล้องกับ D20 และหน้าขายที่ staff เห็นราคาขายเป็นข้อความอย่างเดียว (D11) · **ฉบับแรกสั่งให้ซ่อนทั้งคอลัมน์สำหรับ staff ซึ่งเป็นโค้ดที่ไม่เคยทำงาน** เพราะหน้าถูกกั้นด้วย `viewReports` ซึ่งเป็นชุด role เดียวกับ `viewCost` อยู่แล้ว — ลบทิ้งแล้ว เพราะโค้ดกันที่ยิงไม่ออก อันตรายกว่าไม่มี คนอ่านจะเชื่อว่ามีการป้องกันอยู่ · คุ้มครองด้วย `history-access.check.mjs` |
| D33 | 23 ก.ย. 2026 | ห้ามซ่อนข้อมูลด้วย ability ที่ซ้ำกับด่านหน้า | **การซ่อนข้อมูลด้วย ability ที่มี role ชุดเดียวกับ (หรือเป็นซูเปอร์เซ็ตของ) ability ที่กั้นหน้า ถือเป็นโค้ดตาย ห้ามเขียนแบบนี้อีก** · ต้องกั้นที่ระดับหน้าอย่างเดียว · เหตุผล: ชั้นสองไม่มีวันเป็นเท็จ แต่คนอ่านจะเชื่อว่ามีการป้องกันอยู่ ซึ่งอันตรายกว่าไม่มีเลย · **ข้อยกเว้นที่ยังต้องมีชั้นใน:** หน้าที่ไม่มีด่านกั้น (`/stock`, `/stock/[id]`, `/sell`) staff เปิดได้จริง ตัวกรอง `canSeeValue`/`canSeeCost`/`canSeePrice` ในหน้าเหล่านี้ทำงานจริง **ห้ามลบ** · คุ้มครองด้วย `history-access.check.mjs` ซึ่งแยกสองกลุ่มนี้ออกจากกันโดยอ่านจากโค้ด ไม่ใช่รายชื่อที่พิมพ์ไว้ |
| D34 | 23 ก.ย. 2569 | ผู้ใช้หลักเป็นผู้สูงอายุ และใช้งานบนมือถือ | **เกณฑ์ถาวร ใช้กับทุกเฟสตั้งแต่นี้ไป** · ตัวอักษรและพื้นที่กดต้องใหญ่พอ · **ห้ามใช้สีอย่างเดียวสื่อความหมาย ต้องมีข้อความกำกับเสมอ** · ทุกหน้าใหม่ต้องใช้ได้บนหน้าจอมือถือ · ที่มา: เจ้าของร้านแจ้งว่าคนในบ้านที่สูงอายุจะเป็นผู้ใช้ด้วย |
| D35 | 23 ก.ย. 2569 | กราฟวาดเองด้วย inline SVG | **กราฟทุกตัวในระบบวาดด้วย inline SVG เอง ห้ามเพิ่ม dependency สำหรับกราฟ ไม่ว่าเฟสไหน** · ครอบคลุม recharts · chart.js · d3 · victory · nivo · apexcharts · plotly · echarts และ library กราฟอื่นทุกชนิด · เหตุผล: `05-web-spec.md` 5.0.12 ห้าม library กราฟอยู่แล้ว และข้อ 45 ของ checklist ปิด Gate ระบุว่ามี dependency นอกรายการ = ไม่ผ่านทันที · กราฟ 3 แบบที่ต้องการ (Line · Scatter · Dumbbell) เป็นเรขาคณิตล้วน วาดเองได้ และคุมขนาดตัวอักษรกับพื้นที่สัมผัสได้ตาม D34 ดีกว่า library · คุ้มครองด้วย `no-chart-library.check.mjs` |
| D36 | 23 ก.ย. 2569 | หลักฐานว่า SQL ตรงกับ response model | **ทุก endpoint ที่มี response model ต้องมีเทสต์ที่ยิงฐานข้อมูลจริง และวนตรวจทุกฟิลด์ที่ model ประกาศ ว่ามีอยู่ในคำตอบจริง** · **เทสต์หน่วยที่ใช้แถวเขียนมือ (`MatchCursor`) ห้ามนับเป็นหลักฐานว่า SQL ตรงกับ schema** เพราะแถวมีคีย์ตามที่คนเขียนเทสต์พิมพ์ ไม่ใช่ตามที่ SQL SELECT จริง · **endpoint ใหม่ทุกตัวต้องเพิ่มเข้า `tests/integration/test_list_endpoints_db.py`** · 🔴 **การแก้ที่ยอมรับไม่ได้: ทำฟิลด์เป็น optional เพื่อให้เทสต์ผ่าน** · ที่มา: `GET /api/v1/purchases` ตอบ 500 ทุกครั้งที่มีข้อมูล ทำให้ 2 หน้าใช้ไม่ได้ ขณะที่เทสต์ 387 ตัวเขียวหมด |
| D37 | 23 ก.ย. 2569 | U-1 เก็บคำด้วย DISTINCT ไม่ทำ lookup table | **ใช้ `DISTINCT` จาก `medicines.category` และ `medicines.dosage_form` · ไม่ทำตาราง lookup · ไม่ต้อง migration** · เหตุผล: ข้อมูลมีอยู่แล้ว ตาราง lookup จะกลายเป็นแหล่งความจริงที่สองทันที แล้ววันหนึ่งจะไม่ตรงกัน (MVP ข้อ 66) · endpoint ใหม่คืนรายการคำทั้งหมด **ไม่แบ่งหน้า** · คืนเฉพาะคำที่ถูกใช้จริง **เรียงตามความถี่มากไปน้อย** · 🔴 ปุ่ม **+** ไม่ได้ “บันทึกคำ” แต่คือกรอกคำใหม่ลงยาตัวนั้น คำจะโผล่ครั้งถัดไปเองเพราะอยู่ในข้อมูลจริงแล้ว — **ต้องเขียนบอกผู้ใช้บนหน้าจอให้เข้าใจตรงนี้** |
| D38 | 23 ก.ย. 2569 | U-5 คำค้นที่ใช้บ่อย เก็บที่ localStorage | **เก็บใน `localStorage` ไม่ต้อง migration** · เหตุผล: เป็นความสะดวกส่วนตัวต่อเครื่อง ไม่ใช่ข้อมูลร้าน · เก็บ**แยกตามหน้า และแยกตามผู้ใช้ที่ล็อกอิน** · **จำกัดจำนวนที่เก็บ เก่าสุดหลุดออกก่อน** · **ต้องมีปุ่มล้างประวัติคำค้น** · **ห้ามเก็บอะไรที่ไม่ใช่คำค้น** · 🔴 **อ่าน/เขียนต้องอยู่ใน `try/catch` ทุกจุด** เบราว์เซอร์อาจปิดไว้ |
| D39 | 23 ก.ย. 2569 | U-6 Wheel/Spinner แยกตามอุปกรณ์ แต่พิมพ์ได้เสมอ | มือถือใช้ **Wheel Picker** · เดสก์ท็อปใช้ **Spinner** · 🔴 **ทุกอุปกรณ์ต้องพิมพ์ตัวเลขลงไปตรง ๆ ได้เสมอ ห้ามบังคับให้หมุนอย่างเดียว** เหตุผลตาม **D34**: ผู้สูงอายุหมุน wheel พลาดง่ายกว่าพิมพ์ และของที่พิมพ์ได้เร็วกว่าเสมอ · **`MonthYearInput` ที่มีอยู่แล้วห้ามรื้อ ให้ใช้รูปแบบเดิม** |
| D40 | 23 ก.ย. 2569 | U-7 Scatter ใช้ endpoint แยก `GET /reports/medicine-movement` | **X = จำนวนหน่วยที่ “ขายออกไปแล้ว” ใน 30 วันล่าสุด** (business date Asia/Bangkok ตาม **D9**) — **ไม่ใช่ `available_quantity` ซึ่งคือของที่เหลือ คนละเรื่องกัน** · **Y = มูลค่าสต็อกที่ยังขายได้รายยา** = ผลรวม (จำนวนคงเหลือ × ต้นทุน) ของล็อตที่ยังขายได้ **ไม่รวมล็อตที่หมดอายุแล้ว** (**D10**) · **ห้ามใช้ `expired_value` แทน คนละความหมาย** · 🔴 **มุมที่ต้องจับตาคือซ้ายบน (ขายน้อย เงินเยอะ) ไม่ใช่ขวาบน** เพราะ X น้อย = อยู่ซ้าย · backend รวมยอดให้เสร็จ **หน้าจอห้ามบวกเอง** · แยกจาก `sales-timeseries` เพราะรูปร่างข้อมูลคนละแบบ · **owner + pharmacist เท่านั้น** (มีต้นทุน) กั้นที่ระดับ endpoint ตาม **D32/D33** · ต้องเพิ่มเข้า `test_list_endpoints_db.py` ตาม **D36** |
| D41 | 23 ก.ย. 2569 | งานที่เป็นภาพ ต้องให้คนดูก่อนถือว่าเสร็จ | **check ยืนยันได้แค่ว่าของไม่หายและไม่พัง ยืนยันไม่ได้ว่าอ่านรู้เรื่อง** · งานที่เป็นภาพ (กราฟ · ไดอะแกรม · เลย์เอาต์) **ต้องให้คนดูด้วยตาก่อนถือว่าเสร็จทุกครั้ง** · 🔴 **ห้ามปิดงานด้วย check เขียวอย่างเดียว** · ที่มา: Dumbbell ผ่าน check 30 ข้อ แต่ผู้ใช้เปิดดูแล้วอ่านไม่รู้เรื่อง — check ตรวจว่ามีชิ้นส่วนครบ ไม่ได้ตรวจว่าสื่อความหมาย |
| D42 | 23 ก.ย. 2569 | ชุดกราฟบนหน้าภาพรวมร้าน | **Line · Pie · Scatter** · **ยกเลิก Dumbbell บนหน้าภาพรวม** · Dumbbell ไม่ลบทิ้ง ให้อยู่กับใบรับสินค้าใบเดียว เพราะเปรียบเทียบ “ตามใบส่งของ vs รับจริง” ซึ่งมีความหมายตอนกำลังดูใบนั้นอยู่ ไม่ใช่ตอนดูภาพรวมทั้งร้าน · **Pie = สัดส่วนมูลค่าสต็อกแยกตามระดับความเสี่ยงวันหมดอายุ 4 ส่วน** (วิกฤต · เสี่ยงสูง · เฝ้าระวัง · ปกติ) ใช้ `summary.stock_value` แต่ละระดับจาก **`/reports/expiring?days=3650`** ไม่ต้องทำ endpoint ใหม่ · 🔴 **แก้ 23 ก.ย. 2569:** ฉบับแรกไม่ได้ระบุ `days` และ endpoint กรองล็อตที่เกินหน้าต่างทิ้งก่อนสรุป ทำให้ส่วน “ปกติ (เกิน 180 วัน)” เป็นศูนย์โดยโครงสร้าง — คำถามของกราฟนี้คือเงินในร้านอยู่ที่ความเสี่ยงระดับไหน = ทั้งชั้นวาง จึงต้องใช้ช่วงเต็ม · 🔴 **ห้ามบวกจาก `items` ที่โหลดมา** (เหตุผลเดียวกับที่เคยแก้เรื่อง % เงินจม) · ทุกชิ้นต้องมี **ชื่อระดับ + จำนวนเงิน + เปอร์เซ็นต์** เป็นข้อความ ห้ามใช้สีอย่างเดียวแล้วให้ไปดู legend · ชิ้นเล็กจนใส่ข้อความไม่ได้ → มีตารางข้างใต้แทน legend สี · **รวมกันต้องได้ 100% พอดี** ปัดเศษแล้วเกิน/ขาดต้องจัดการให้ตรง · มูลค่าสต็อก = **owner + pharmacist** เท่านั้น ตาม D32/D33 · ลำดับ: Pie → Line → ~~ย้าย Dumbbell~~ → Scatter → ปุ่มเลือกชนิดกราฟ · 🔴 **ข้อ “ย้าย Dumbbell” ยกเลิก** — Dumbbell อยู่ที่ `/history/purchases/[id]` ถูกต้องอยู่แล้วตั้งแต่ commit แรก ไม่เคยอยู่บนหน้าภาพรวม ยกเลิกเพราะ Chat A เข้าใจผิด ไม่ใช่เพราะงานเปลี่ยน · **แต่ละข้อต้องผ่านสายตาผู้ใช้ก่อนทำข้อถัดไป (D41)** |
| D43-a | 23 ก.ย. 2569 | assertion ต้องเรียกโค้ดจริง | **assertion ต้องเรียกโค้ดจริงเสมอ ห้ามคัดลอกตรรกะมาไว้ในไฟล์ check** · และต้องมีเคสที่แยก “ถูก” กับ “เกือบถูก” ออกจากกันได้จริง — เคสที่ `Math.floor` กับ `Math.round` ให้ผลเท่ากันทุกครั้ง = **เคสอ่อน ไม่นับ** · ที่มา: assertion 7 ข้อของ pie ทดสอบสำเนาอัลกอริทึมในไฟล์ check เอง mutation ต่อโค้ดจริง 4 ตัวจึงรอดทั้งหมด ทั้งที่ทุกข้อขึ้น PASS |
| D43-b | 23 ก.ย. 2569 | assertion ห้ามผูกกับรูปร่างของไฟล์ | **assertion ห้ามขึ้นกับการจัดบรรทัด ชื่อตัวแปร หรือตำแหน่งในไฟล์** · ให้ตรวจ **“ค่าที่ตัดสินจริง”** หรือ **“จำนวนที่นับได้”** แทนการจับคู่ตัวอักษร · ที่มา: assertion พังเอง 3 จุดในรอบเดียว — slice ตัดที่ `{open` ตัวแรกซึ่งดันอยู่ใน `aria-expanded={open}` ของตัวเอง · จับคู่ `variant === "panel"` ใกล้คำว่า collapsed แล้วไปโดนบรรทัดประกาศ เป็นผลบวกลวง · pattern บรรทัดเดียวพังเพราะแตก JSX เป็นหลายบรรทัด ทั้งที่คุณสมบัติจริงไม่เปลี่ยน · ทั้งสามจุดคือการตรวจตัวอักษรในไฟล์ ไม่ใช่ตรวจคุณสมบัติ · เทียบเคียง: mutation `role="presentation"` ที่ซอร์สดูถูกต้องแต่ผู้ใช้จริงไม่ได้ปุ่มนั้น |
| D45 | 23 ก.ย. 2569 | ห้ามมีตัวหนังสืออยู่ใน `<svg>` ของกราฟ | 🔴 **ป้ายกำกับทุกอันของกราฟต้องเป็น HTML อยู่นอกกรอบวาด ห้ามใช้ `<text>` ใน `<svg>`** · เหตุผล: กรอบวาดสเกลตามคอนเทนเนอร์ ตัวอักษรข้างในจึงสเกลตามไปด้วย = **ไม่มีใครเป็นคนกำหนดขนาด** · วัดจากจอจริง: บนมือถือ 375px ป้ายเหลือไม่ถึง 8px · บนจอ 1280px ป้ายเดียวกันโตกว่าหัวข้อ section — ขัด D34 ทั้งสองทาง · ใช้กับ**กราฟทุกตัว ทุกเฟส** · วิธีทำ: ตั้งค่าคลาสขนาดตัวอักษรไว้ที่เดียว (`LABEL_TEXT`) แล้วให้ทุกป้ายอ่านจากตัวนั้น เทสต์จึงยืนยันได้ว่าไม่มีป้ายไหนถูกย่อเฉพาะตัว · ของที่วาดใน `<svg>` เหลือแต่รูปทรง ซึ่งสเกลได้โดยไม่เสียความหมาย |
| D43-c | 23 ก.ย. 2569 | ห้าม slice ระหว่าง marker · ทุก match ต้องยืนยันว่าหาเจอ | 🔴 **ห้ามใช้ `slice` ระหว่าง marker สองตัวเพื่อเจาะดูโค้ดส่วนหนึ่ง** ให้ `match` เป็น element ทั้งก้อน · 🔴 **ทุกการ match ต้องมี assertion ว่า “หาเจอจริง” เสมอ ถ้าหาไม่เจอต้อง FAIL ห้ามเงียบแล้วผ่าน** · เหตุผล: กับดักนี้กัดสามครั้งในไฟล์เดียว — ครั้งแรก slice จบที่ marker ที่อยู่ในตัว element เอง · ครั้งที่สอง regex ไปโดนบรรทัดประกาศ · ครั้งที่สาม marker ปิดหายไปตั้งแต่การแก้รอบก่อน `indexOf` คืน −1 slice จึงกินเกือบทั้งไฟล์ แล้ว assertion ไปเจอของผิดตัวแล้วผ่าน · ทุกครั้งผลลัพธ์คือ **“ดูเขียวทั้งที่ไม่ได้ตรวจอะไรเลย” ซึ่งอันตรายกว่า FAIL** · **ผลสแกนทั้ง 14 ไฟล์ (23 ก.ย. 2569):** เหลือ 6 ไฟล์ที่ยังใช้รูปแบบต้องห้าม — `adjust-409` · `auth-profile` · `dumbbell-chart` · `menu-groups` · `sell-shortcuts` · `stock-detail-error` — marker ทุกตัวยังตรงกับซอร์สจริง จึงยังไม่มีไฟล์ไหนพังเงียบ · เก็บกวาด **หลัง** Line และ Scatter (รายละเอียดใน `06-phase5-gate.md` งานค้างหลัง Gate) · 🔴 ระหว่างนี้ไฟล์ check ใหม่ทุกไฟล์ต้องทำตาม D43-c ตั้งแต่แรก ห้ามเพิ่มหนี้ก้อนใหม่ |
| D44 | 23 ก.ย. 2569 | หน้าตาเมนู แยกเมนูหลักกับเมนูย่อยให้ชัด | **เมนูหลัก (หน้าแรก · ขายยา · คลังยา) ตัวหนา สีเข้ม ไม่เยื้อง ไม่มีจุด** · **เมนูย่อยตัวบางกว่า สีอ่อนกว่า เยื้องเข้าไป และมีจุดสีเขียวนำหน้าทุกอัน** · **มีเส้นตั้งด้านซ้ายของกลุ่ม + เส้นสั้นแนวนอนแตกเข้าหาแต่ละรายการ** · 🔴 **หัวข้อกลุ่มต้องไม่เล็กกว่าเมนูย่อย** (เดิม `text-xs` เทียบ `text-sm` อ่านแทบไม่ออก ขัด D34) · 🔴 **ชื่อเมนูทุกอันห้ามถูกตัด ทั้งชื่อกลุ่มและชื่อลิงก์** (ขยายกติกา 23 ก.ย. 2569 — ฉบับแรกครอบแค่ชื่อกลุ่ม บั๊กเดิมจึงย้ายไปโผล่ที่ชื่อลิงก์ เห็นเป็น “ยาใกล้ห...” เพราะป้าย “กำลังดูอยู่” อยู่บรรทัดเดียวกัน) · ชื่อกลุ่มห้ามถูกตัดเด็ดขาด — เดิมถูกตัดเหลือ “ห...” เพราะยัดคำบอกสถานะไว้บรรทัดเดียวกัน · ถ้าที่ไม่พอให้ย้ายคำบอกสถานะไปบรรทัดล่าง หรือใช้คำสั้นกว่า **ห้ามแก้ด้วยการย่อชื่อเมนู และห้ามลดขนาดตัวอักษร** · คำบอกสถานะสั้นลงเป็น “เปิดอยู่ · ดูหน้านี้อยู่” แต่ยังต้องเป็นข้อความ **ห้ามเหลือแค่ไอคอน** · ข้อห้ามเดิมยังอยู่ครบ: จุดสีเขียวเป็นของประกอบต้องมีข้อความกำกับเสมอ (D34) · บล็อกบนสุดยังพับไม่ได้ (D43) · แถวสูงอย่างน้อย 48px · ห้ามล้นแนวนอนทุกความกว้าง · ใช้ MENU array เดียวทั้งแถบข้างและมือถือ |
| D43 | 23 ก.ย. 2569 | เมนูพับได้ (กลับคำจาก U-3) | 🔴 **กลับคำจาก U-3** — คำวินิจฉัยเดิม “ห้ามพับ” ผิด เพราะผู้ใช้มองแล้วบอกว่ารก ซึ่งเป็นหลักฐานชั้นเดียวกับที่ยกเลิก Dumbbell (**D41**) · **กลุ่มพับเปิด-ปิดได้ หัวข้อกลุ่มเป็นปุ่มได้** · 🔴 **บล็อกบนสุด (หน้าแรก · ขายยา · คลังยา) ห้ามพับเด็ดขาด** เป็นงานทุกวัน ถ้าต้องกดเปิดก่อนขายยา = แย่ลงกว่าเดิม · 4 กลุ่มที่เหลือพับได้: หน้าที่ประจำวัน · ยาที่ต้องดูด่วน · รายงานและประวัติ · ตั้งค่า · **ครั้งแรกที่เข้า เปิดทุกกลุ่ม ไม่ใช่พับทุกกลุ่ม** (ต้องเห็นว่ามีอะไรบ้างก่อน) · **กลุ่มที่มีหน้าที่กำลังดูอยู่ ต้องเปิดเสมอ** แม้ผู้ใช้เคยพับไว้ · จำสถานะใน `localStorage` แยกตามผู้ใช้ตาม **D38** อ่านเขียนใน `try/catch` อ่านไม่ได้ = เปิดทุกกลุ่ม · หัวข้อที่พับได้ต้องเป็น `<button>` จริง มี `aria-expanded` และ **มีคำบอกสถานะเป็นข้อความ ไม่ใช่ลูกศรอย่างเดียว** (D34) · ใช้กติกาเดียวกันทั้ง PC และมือถือ ไม่แยกพฤติกรรม · 🔴 **Wheel Picker สำหรับเมนู ไม่อนุมัติ** — D39 ให้ wheel กับช่องกรอกตัวเลขที่มีทางสำรองคือพิมพ์เสมอ เมนูไม่มีทางสำรองแบบนั้น · wheel ซ่อนตัวเลือกส่วนใหญ่ไว้นอกจอ = ของหายจากสายตา ขัด D34 · ผู้สูงอายุหมุนพลาดง่าย และเมนูพลาดแล้วไปผิดหน้า · มือถือใช้รายการเต็มจอ + พับกลุ่มได้ |
| — | 19 ก.ย. 2026 | หน่วยนับของยา | เพิ่มคอลัมน์ `medicines.unit` (Migration 004) — `text NOT NULL DEFAULT 'กล่อง'`; ไม่ส่งมาใน `POST` → ได้ค่า Default; ส่งเป็น `null`/ว่างใน `PATCH` → `400`; `GET /reports/stock` และ `GET /reports/expiring` ส่ง `unit` กลับด้วย |

---

## 16. มาตรฐานที่อนุมัติระหว่างพัฒนา

| งาน | ข้อตกลง |
|---|---|
| 3.6 | ข้อความว่าง (`""`) ทุกช่องเก็บเป็น `NULL` |
| 3.6 | ฟิลด์ที่ไม่รู้จักใน Request → `400` |
| 3.6 | `PATCH` ที่ไม่มีค่าใดเปลี่ยนจริง → `400` |
| 3.7 | ตรวจยอดเงินไม่เกินขนาดคอลัมน์ `numeric(10,2)` (≤ 99,999,999.99) → เกิน `400` |
| 3.7 | รายการซ้ำในใบรับสินค้า เทียบ `lot_number` แบบไม่สนตัวพิมพ์และช่องว่างหัวท้าย |
| 3.7 | `DELETE` ตอบ `{"id": ..., "deleted": true}` |
| 3.7 | ฐานข้อมูลล่มตอนเริ่มแอป → แอปยังเริ่มได้ และข้ามการตรวจ `STORE_TIMEZONE` (log warning) |
| 3.8 | `GET /sales` (รายการ) ส่งเฉพาะ `id, sale_date, discount_amount, tax_amount, total_amount` |
| 3.8 | staff ส่ง `unit_price` ให้ยาที่ยังไม่ตั้งราคาขาย → `403`; ไม่ส่งราคา → `400` "ยังไม่ได้ตั้งราคาขาย" |
| 3.8 | fefo-preview ของยาที่ `is_active=false` ดูได้ (`200`) แต่ขายไม่ได้ (`400`) |
| 3.8 | ป้องกันเพิ่ม: `UPDATE` lot ตรวจจำนวนตรงกับที่ล็อก / กรอง-เรียง lot ซ้ำใน Python ให้ตรงกับ SQL |
| 3.8 | ลำดับ items ใน Response การขาย: ชื่อยา → EXP |
| 3.9 | Adjustment: `damage` / `expired` ต้องติดลบเท่านั้น; `\|quantity_change\|` ≤ 100000; `reason` ≤ 500 ตัวอักษร |
| 3.9 | Adjustment เพิ่มจำนวน: Lot ที่ EXP ≤ วันนี้ → `400`; status `damaged`/`expired` → `409`; `depleted` → กลับเป็น `active` |
| 3.9 | staff ไม่เห็นฟิลด์ต้นทุน/มูลค่า (`cost_per_unit`, `*_value`, `stock_value`) ในทุก Endpoint — ฟิลด์ไม่มีใน Response เลย |
| 3.9 | รายงานทั้งหมดใช้ "วันนี้" ตาม D9 และตัดยาที่ `is_active=false` ออก; category ที่เป็น `NULL` แสดงเป็น "ไม่ระบุหมวดหมู่" |
| 3.9 | `GET /audit-logs` เฉพาะ owner; `table_name` ต้องเป็นชื่อตารางที่มีอยู่จริง ไม่งั้น `400` |
| 3.9 | รายงาน `expiring` / `expired` มี `lot_id` และ `medicine_id` ด้วย (ต้องใช้เรียก Adjustment ตามข้อ 10.4) |
| 3.9 | ใช้รูปแบบแบ่งหน้าตามข้อ 8 (`items/total/limit/offset`) กับ `/medicines/{id}/lots`, `/reports/expired`, `/reports/low-stock` |
| 3.9 | `/reports/stock?q=` ค้นเหมือน `GET /medicines` (ชื่อ / ชื่อสามัญ แบบ ILIKE + barcode ตรงตัว) |
| 3.9 | `inventory-value` → `by_medicine` มีฟิลด์ `medicine_id, name, total_value, sellable_value, expired_value` |
| 3.9 | `/reports/expired` เรียงจาก EXP เก่าสุดไปใหม่สุด |
| 3.9 | ข้อความ `409` ของ Adjustment: "ไม่สามารถเพิ่มจำนวนให้ Lot ที่ถูกตัดออกจาก Stock แล้ว" |
| 5.3 | `GET /reports/stock` คืน `lot_count`, `nearest_expiry`, `days_remaining` (ค่าดิบ) และ `risk_level` เพิ่ม — ใช้ทำคอลัมน์ "ล็อต" และ "ล็อตที่หมดอายุก่อน" ในหน้า `/stock`; `nearest_expiry` นับเฉพาะ Lot ที่ยังขายได้ (`expiry_date > วันนี้`) ไม่มีเลย = `null` |
| 5.7 | หน้าประวัติทั้งหมดเป็น **read-only** — ไม่มีปุ่มแก้ไข ลบ หรือยกเลิกในหน้าประวัติ การแก้ย้อนหลังต้องผ่าน adjustment ที่มีประวัติเสมอ (กฎข้อ 21) |
| 5.7 | รายการประวัติ **แบ่งหน้าเสมอ (25/หน้า)** และกรองที่ API — ห้ามโหลดทั้งหมดมากรองในเบราว์เซอร์ · ตัวเลขรวมใด ๆ ต้องมาจาก API (`total` ของ Page) ไม่ใช่บวกจากแถวที่โหลดมา |
