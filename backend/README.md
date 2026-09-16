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

**กฎ:**
- ห้าม commit `.env` (อยู่ใน `.gitignore` แล้ว) และห้ามส่งค่าลับในแชท
- ถ้ารหัสผ่านมีอักขระพิเศษ (`@ # : / ?`) ต้อง URL-encode หรือเปลี่ยนรหัสเป็นตัวอักษร/ตัวเลข
- ถ้าขาด `DATABASE_URL` หรือ `SUPABASE_URL` แอปจะหยุดตอนเริ่ม พร้อมบอกชื่อตัวแปรที่ขาด

## 3. รัน Server

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --port 8000
```

ตรวจการทำงาน:

| URL | ผลที่ควรได้ |
|---|---|
| http://127.0.0.1:8000/health | `200 {"status": "ok", "database": "ok"}` (ต่อฐานข้อมูลไม่ได้ → `503`) |
| http://127.0.0.1:8000/docs | เอกสาร API (เฉพาะ `APP_ENV=development`) |

## โครงสร้าง

```
backend/
├── app/
│   ├── main.py        สร้าง FastAPI app, lifespan, CORS, logging
│   ├── config.py      อ่าน Settings จาก .env
│   ├── db.py          Connection pool + get_transaction()
│   ├── errors.py      รูปแบบ Error กลาง
│   ├── routers/       Endpoint (health)
│   ├── schemas/       Pydantic models
│   └── services/      Business Logic
├── migrations/        SQL Migration (รันแล้ว ห้ามแก้ไฟล์เดิม)
└── tests/
```
