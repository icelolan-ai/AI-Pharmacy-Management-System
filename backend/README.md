# Backend — FastAPI

Backend API ของ AI Pharmacy Management System (FastAPI + Python + PostgreSQL บน Supabase)

ดู Spec ได้ที่ [`../docs/03-api-spec.md`](../docs/03-api-spec.md) และ Architecture ที่ [`../docs/00-blueprint.md`](../docs/00-blueprint.md)

## สิ่งที่ต้องมี

- Windows + Python **3.14** (ตรวจด้วย `py -3.14 --version`)
- Supabase project ที่รัน Migration ใน `migrations/` ครบแล้ว

## 1. สร้าง venv และติดตั้ง Library

ทำในโฟลเดอร์ `backend/`:

```powershell
py -3.14 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

> ถ้า psycopg ขึ้น `DLL load failed ... Application Control policy has blocked this file`
> แปลว่า Windows Smart App Control บล็อกไฟล์ของ psycopg-binary

## 2. กรอกไฟล์ `.env`

```powershell
Copy-Item .env.example .env
```

แล้วเปิด `backend/.env` กรอกค่า:

| ตัวแปร | ค่า |
|---|---|
| `APP_ENV` | `development` บนเครื่องพัฒนา (เปิด `/docs`) — ค่าอื่นจะปิด `/docs` |
| `DATABASE_URL` | Supabase Dashboard → **Connect** → **Session pooler** → URI (แทน `[YOUR-PASSWORD]` ด้วยรหัสผ่านฐานข้อมูล) |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `CORS_ORIGINS` | โดเมนของ Web ที่อนุญาต คั่นด้วย comma เช่น `http://localhost:3000` |
| `STORE_TIMEZONE` | เขตเวลาของร้าน ใช้คำนวณ "วันนี้" (D9) — ไม่ใส่ก็ได้ ค่าเริ่มต้น `Asia/Bangkok` แอปจะไม่เริ่มถ้า PostgreSQL ไม่รู้จักชื่อนี้ |

**กฎ:**
- ห้าม commit `.env` (อยู่ใน `.gitignore` แล้ว) และห้ามส่งค่าลับในแชท
- ถ้ารหัสผ่านมีอักขระพิเศษ (`@ # : / ?`) ต้อง URL-encode หรือเปลี่ยนรหัสเป็นตัวอักษร/ตัวเลข
- ถ้าขาด `DATABASE_URL` หรือ `SUPABASE_URL` แอปจะหยุดตอนเริ่ม พร้อมบอกชื่อตัวแปรที่ขาด

## 3. รัน Server

เครื่องพัฒนานี้ใช้ port **8001** (port 8000 ถูกโปรแกรมอื่นใช้อยู่):

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --port 8001
```

ตรวจการทำงาน:

| URL | ผลที่ควรได้ |
|---|---|
| http://127.0.0.1:8001/health | `200 {"status": "ok", "database": "ok"}` (ต่อฐานข้อมูลไม่ได้ → `503`) |
| http://127.0.0.1:8001/docs | เอกสาร API (เฉพาะ `APP_ENV=development`) |

## 4. การยืนยันตัวตน (Authentication)

ทุก Endpoint ใต้ `/api/v1` (ยกเว้น `/health`) ต้องส่ง Access Token ของ Supabase Auth ใน Header:

```
Authorization: Bearer <access_token>
```

- Client Login กับ Supabase Auth (Email + Password) เพื่อรับ `access_token` แล้วส่งมากับทุก Request
- Backend ตรวจลายเซ็นด้วย Public Key (JWKS) ของ Project — ไม่ต้องใช้ JWT secret หรือ `service_role` key
- ไม่มี Token / Token ผิด / หมดอายุ → `401 UNAUTHENTICATED`
- ไม่มีแถวใน `user_profiles`, บัญชีถูกปิด หรือ Role ไม่พอ → `403 FORBIDDEN`
- ตรวจตัวเองได้ที่ `GET /api/v1/me`
- ห้ามพิมพ์ Token ลง Log หรือส่งในแชท

## 5. รัน Tests

มี 2 ชุด แยกด้วย marker `db`:

```powershell
.\.venv\Scripts\Activate.ps1
pytest -m "not db"   # Unit tests — ไม่ต่อฐานข้อมูล ใช้ได้เสมอ
pytest -m db         # Integration tests — ต้องมี backend/.env.test
pytest               # ทั้งหมด (ข้ามชุด db อัตโนมัติถ้าไม่มี .env.test)
```

- **Unit tests** ไม่ต่อฐานข้อมูลจริงและไม่ต้อง Login จริง (`tests/conftest.py` ตั้งค่าทดสอบแทนค่าใน `.env`)
- **Integration tests** (`tests/integration/`) รันบน Supabase Project **ทดสอบ** เท่านั้น เซ็น Token เองและ mock JWKS จึงไม่ต้องใช้รหัสผ่านของผู้ใช้ทดสอบ
- ระหว่างเทสต์จะ `TRUNCATE` เฉพาะตารางข้อมูลธุรกิจ **ไม่แตะ** `auth.users` และ `user_profiles`

### 5.1 ตั้งค่า Project ทดสอบ

1. สร้าง Supabase Project แยกสำหรับทดสอบ (Free plan ก็พอ) แล้วรัน `migrations/001` → `002` → `003` ตามลำดับ
2. สร้างผู้ใช้ทดสอบใน Authentication แล้วเพิ่มแถวใน `user_profiles` ให้ครบ role ที่ต้องใช้
3. คัดลอกไฟล์ตัวอย่างแล้วกรอกค่าของ Project ทดสอบ:

```powershell
Copy-Item .env.test.example .env.test
```

| ตัวแปรใน `.env.test` | ค่า |
|---|---|
| `TEST_DATABASE_URL` | Connection string แบบ Session pooler ของ Project **ทดสอบ** |
| `TEST_SUPABASE_URL` | `https://<project-ref>.supabase.co` ของ Project ทดสอบ |
| `TEST_SUPABASE_PUBLISHABLE_KEY` | Publishable key ของ Project ทดสอบ |

> 🛡️ **ตัวกันพลาด:** `tests/db_guard.py` จะหยุด pytest ทันทีถ้า `.env.test` ไม่ได้ชี้ไปที่ Project ทดสอบ
> (เช่น เผลอใส่ค่าของ Project จริง หรือ URL กับ Connection string เป็นคนละ Project)
> `.env.test` อยู่ใน `.gitignore` แล้ว ห้าม commit

## โครงสร้าง

```
backend/
├── app/
│   ├── main.py        สร้าง FastAPI app, lifespan, CORS, logging
│   ├── config.py      อ่าน Settings จาก .env
│   ├── db.py          Connection pool + get_transaction()
│   ├── errors.py      รูปแบบ Error กลาง
│   ├── auth.py        ตรวจ JWT, โหลด user_profiles, require_roles()
│   ├── routers/       Endpoint (health, me)
│   ├── schemas/       Pydantic models
│   └── services/      Business Logic
├── migrations/        SQL Migration (รันแล้ว ห้ามแก้ไฟล์เดิม)
└── tests/
```
