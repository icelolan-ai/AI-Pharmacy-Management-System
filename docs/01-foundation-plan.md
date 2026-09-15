# Foundation Setup Plan
## AI Pharmacy Management System — Phase 1

**สถานะเอกสาร:** ✅ อนุมัติแล้ว — พร้อมให้ Claude Code นำไปดำเนินการ
**จัดทำโดย:** Chat A — Architect / Project Manager
**Phase:** Phase 1 — Foundation
**อัปเดตล่าสุด:** กันยายน 2026

> เอกสารนี้เป็น Specification สำหรับ **Claude Code** ใช้อ้างอิงในการสร้างโครงสร้างโปรเจกต์เริ่มต้น
> อ้างอิง Architecture หลักจาก [`00-blueprint.md`](./00-blueprint.md)

---

## เป้าหมายของ Phase 1

วางโครงสร้างโฟลเดอร์และเอกสารพื้นฐานของ Repository เตรียมพร้อมสำหรับ Phase 2-5 ที่จะตามมา
**ยังไม่มีการเขียนโค้ดจริงหรือติดตั้ง Framework ใด ๆ ใน Phase นี้**

---

## โครงสร้างที่ต้องสร้าง

```
AI-Pharmacy-Management-System/
├── docs/                    (มีอยู่แล้ว — ไม่ต้องแก้ไข)
├── backend/
│   └── README.md            (สร้างใหม่)
├── mobile/
│   └── README.md            (สร้างใหม่)
├── web/
│   └── README.md            (สร้างใหม่)
├── .gitignore                (สร้างใหม่ — แทนที่ไฟล์เดิมถ้ามี)
└── README.md                 (สร้างใหม่ — แทนที่ไฟล์เดิมที่ Codespaces สร้างไว้)
```

---

## 1. ไฟล์ `README.md` (Root)

```markdown
# AI Pharmacy Management System

ระบบบริหารจัดการร้านขายยาที่ใช้ AI ช่วยอ่านข้อมูล วิเคราะห์ข้อมูล และช่วยตัดสินใจเกี่ยวกับสินค้า ยอดขาย สต็อก วันหมดอายุ การสั่งซื้อ และต้นทุน

> 📌 **สถานะโปรเจกต์:** อยู่ระหว่างการพัฒนา (Phase 1 — Foundation)

## เอกสารสำคัญ

ดูรายละเอียด Architecture, หลักการออกแบบ และแผนการพัฒนาทั้งหมดได้ที่ [`docs/00-blueprint.md`](docs/00-blueprint.md)

## โครงสร้างโปรเจกต์

| โฟลเดอร์ | คำอธิบาย |
|---|---|
| `docs/` | เอกสาร Blueprint และ Specification ต่าง ๆ |
| `backend/` | Backend API (FastAPI + Python) |
| `mobile/` | Mobile App (Flutter — iOS/Android) |
| `web/` | Web Dashboard (Next.js + TypeScript) |

## Technology Stack

- **Mobile:** Flutter
- **Web:** Next.js + TypeScript
- **Backend:** FastAPI (Python)
- **Database:** PostgreSQL (Supabase)
- **AI:** AI API (อยู่ระหว่างพิจารณา Provider)

## สถานะ Phase

| Phase | สถานะ |
|---|---|
| 0 — Blueprint / Architecture | ✅ เสร็จสมบูรณ์ |
| 1 — Foundation | 🟡 กำลังดำเนินการ |
| 2 — Database / Medicine Model | ⏳ รอ |
| 3 — Backend API | ⏳ รอ |
| 4 — Mobile App | ⏳ รอ |
| 5 — Web Dashboard | ⏳ รอ |
```

---

## 2. ไฟล์ `.gitignore` (Root)

```gitignore
# Environment
.env
.env.local
.env.*.local

# Python
__pycache__/
*.py[cod]
*.egg-info/
venv/
.venv/
*.log

# Node / Next.js
node_modules/
.next/
out/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Flutter / Dart
.dart_tool/
.flutter-plugins
.flutter-plugins-dependencies
/build/
*.iml

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Claude Code local settings
.claude/
```

---

## 3. ไฟล์ `backend/README.md`

```markdown
# Backend — FastAPI

โฟลเดอร์นี้จะเก็บโค้ดของ Backend API (FastAPI + Python)

📌 ยังไม่มีโค้ดในโฟลเดอร์นี้ — จะเริ่มพัฒนาใน **Phase 3 — Backend API**

ดู Architecture และหลักการออกแบบ Backend ได้ที่ [`../docs/00-blueprint.md`](../docs/00-blueprint.md)
```

---

## 4. ไฟล์ `mobile/README.md`

```markdown
# Mobile App — Flutter

โฟลเดอร์นี้จะเก็บโค้ดของ Mobile App (Flutter — iOS/Android)

📌 ยังไม่มีโค้ดในโฟลเดอร์นี้ — จะเริ่มพัฒนาใน **Phase 4 — Mobile App**

ดู Architecture และหลักการออกแบบได้ที่ [`../docs/00-blueprint.md`](../docs/00-blueprint.md)
```

---

## 5. ไฟล์ `web/README.md`

```markdown
# Web Dashboard — Next.js

โฟลเดอร์นี้จะเก็บโค้ดของ Web Dashboard (Next.js + TypeScript)

📌 ยังไม่มีโค้ดในโฟลเดอร์นี้ — จะเริ่มพัฒนาใน **Phase 5 — Web Dashboard**

ดู Architecture และหลักการออกแบบได้ที่ [`../docs/00-blueprint.md`](../docs/00-blueprint.md)
```

---

## คำสั่งที่ Claude Code ควรทำ (ลำดับที่แนะนำ)

1. `git pull origin main` — ดึงของล่าสุดจาก GitHub ก่อนเสมอ
2. สร้างโฟลเดอร์ `backend/`, `mobile/`, `web/`
3. สร้างไฟล์ทั้งหมดตามเนื้อหาข้างต้น (แทนที่ไฟล์ `README.md` และ `.gitignore` เดิมที่ Codespaces สร้างไว้)
4. `git add .`
5. `git commit -m "Phase 1: Add foundation structure (backend, mobile, web folders + docs)"`
6. `git push`
7. รายงานผลกลับมาว่าสร้างไฟล์ครบและ Push สำเร็จหรือไม่

---

## Next Steps

หลัง Phase 1 เสร็จและ Push สำเร็จ → กลับมาที่ Chat A เพื่อยืนยัน Phase Complete และวางแผน **Phase 2 — Database / Medicine Model** ต่อไป
