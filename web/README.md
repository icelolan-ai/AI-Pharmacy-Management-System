# Web Dashboard — Next.js

โฟลเดอร์นี้เก็บโค้ดของ Web Dashboard (Next.js App Router + TypeScript + Tailwind CSS + shadcn/ui)

ดู Architecture และหลักการออกแบบได้ที่ [`../docs/00-blueprint.md`](../docs/00-blueprint.md)
และ API ที่เว็บเรียกใช้ที่ [`../docs/03-api-spec.md`](../docs/03-api-spec.md)

## สิ่งที่ต้องมี

- Node.js 20 ขึ้นไป (เครื่องพัฒนาใช้ v24)
- Backend ทำงานอยู่ที่ `http://127.0.0.1:8001` (ดู [`../backend/README.md`](../backend/README.md))

## 1. ติดตั้ง

```powershell
npm install
```

## 2. ตั้งค่า

```powershell
Copy-Item .env.local.example .env.local
```

แล้วกรอกค่าใน `.env.local`

| ตัวแปร | ค่า |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` ของ Supabase project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (Project Settings → API Keys) |
| `NEXT_PUBLIC_API_BASE_URL` | ที่อยู่ Backend — ตอนพัฒนาใช้ `http://127.0.0.1:8001` |

- ค่าทั้ง 3 ตัวไม่ใช่ความลับ (ขึ้นต้น `NEXT_PUBLIC_` แปลว่าถูกส่งไปที่เบราว์เซอร์) แต่ไฟล์ `.env.local` ยัง**ไม่ commit** ตามมาตรฐาน
- Backend ต้องมี `http://localhost:3000` ใน `CORS_ORIGINS` ไม่เช่นนั้นเบราว์เซอร์จะเรียก API ไม่ได้

## 3. รัน

```powershell
npm run dev     # เปิดที่ http://localhost:3000
npm run build   # ตรวจว่า build ผ่าน
npm start       # รันแบบ production หลัง build
```

## หน้าจอในเวอร์ชันนี้ (งาน 5.1)

| เส้นทาง | คำอธิบาย |
|---|---|
| `/login` | เข้าสู่ระบบด้วย Email + รหัสผ่าน (Supabase Auth) — ไม่มีหน้าสมัครสมาชิก |
| `/` | หน้าแรก: ชื่อผู้ใช้, สิทธิ์ และสถานะการเชื่อมต่อ Backend |
| `/me` | ข้อมูลผู้ใช้จาก `GET /api/v1/me` |

ทุกหน้ายกเว้น `/login` ต้องเข้าสู่ระบบก่อน ถ้ายังไม่ได้เข้าสู่ระบบจะถูกพากลับไปหน้า `/login`

## โครงสร้าง

```
web/
├── src/
│   ├── app/
│   │   ├── layout.tsx        ตั้ง lang="th" + ฟอนต์ไทย + AuthProvider
│   │   ├── login/            หน้าเข้าสู่ระบบ
│   │   └── (app)/            หน้าที่ต้องเข้าสู่ระบบ (layout มีเมนูซ้าย + แถบบน)
│   ├── components/
│   │   ├── auth-provider.tsx เก็บ session และข้อมูลผู้ใช้
│   │   └── ui/               component ของ shadcn/ui
│   └── lib/
│       ├── api.ts            เรียก Backend, แนบ token, แปลง error เป็นภาษาไทย
│       ├── supabase.ts       Supabase client (เก็บ session + ต่ออายุ token อัตโนมัติ)
│       └── roles.ts          ตัวช่วยตรวจสิทธิ์ (owner / pharmacist / staff)
└── .env.local                ค่าเชื่อมต่อ (ไม่ commit)
```
