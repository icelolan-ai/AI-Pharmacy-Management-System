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
| ดูต้นทุน (cost) และมูลค่า Stock | ✅ | ✅ | ❌ |
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
| GET | `/api/v1/reports/inventory-value` | owner, pharmacist | มูลค่า Stock รวม / รายยา / ราย Category |

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
| 3.9 | Adjustments + Lots (ยกเว้น fefo-preview) + Reports + Audit endpoint | |
| 3.10 | Tests ครบข้อ 11 + อัปเดต `backend/README.md` (วิธีติดตั้ง/รัน) | 🛑 Final |

**กฎระหว่างทำ:**
- ห้ามแก้ Schema นอกเหนือ Migration 003 — ถ้าพบว่าต้องแก้ ให้หยุดและรายงาน Chat A
- ห้ามแก้ไฟล์ Migration 001/002 ที่รันไปแล้ว
- Commit แยกตามงาน เช่น `Phase 3.6: Add medicines and suppliers endpoints`
- ก่อน commit ตรวจ `git status` ว่าไม่มี `.env`
- เปิดเอกสาร API อัตโนมัติของ FastAPI (`/docs`) ได้เฉพาะ `APP_ENV=development`

---

## 13. เกณฑ์ผ่าน Phase 3 (Gate)

- [x] D1–D6 ได้รับการอนุมัติและบันทึกไว้
- [x] D7 เลือกทางเลือกแล้ว (A)
- [x] Migration 003 รันสำเร็จและตรวจผลครบ
- [ ] Endpoints ข้อ 9 ครบ และทำงานตาม Business Logic ข้อ 10
- [ ] Tests ข้อ 11 ผ่านทั้งหมด
- [ ] ไม่มีค่าลับใน Repository (ตรวจประวัติ commit)
- [ ] Client เข้าถึงตารางตรงผ่าน Supabase Data API ไม่ได้ (ทดสอบจริง)
- [ ] `backend/README.md` อธิบายวิธีติดตั้งและรันได้
- [ ] อัปเดตสถานะใน README และ Blueprint **หลัง** Chat A อนุมัติเท่านั้น
- [ ] Chat A ตรวจและอนุมัติ

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
| D7 | 17 ก.ย. 2026 | ฐานข้อมูลสำหรับ Automated Tests | เลือก **A** — สร้าง Supabase Project แยก (`ai-pharmacy-test`, Free plan) ก่อนงาน 3.10 |
| D9 | 17 ก.ย. 2026 | เขตเวลาของ "วันนี้" | **A** — ใช้ Asia/Bangkok ผ่านค่า STORE_TIMEZONE; คำนวณใน SQL ไม่ใช้ CURRENT_DATE ของฐานข้อมูล (UTC) |
| D10 | 17 ก.ย. 2026 | ขายยาในวัน EXP | **A** — ไม่ขาย และไม่รับเข้า: ขายได้/รับได้เฉพาะ expiry_date > วันนี้ |
| D11 | 17 ก.ย. 2026 | staff เปลี่ยนราคา/ให้ส่วนลด | **A** — staff ต้องใช้ selling_price และ discount = 0 (ไม่งั้น 403); owner/pharmacist ปรับได้และบันทึก audit |
