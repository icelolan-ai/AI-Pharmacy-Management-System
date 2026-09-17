# AI Pharmacy Management System

ระบบบริหารจัดการร้านขายยาที่ใช้ AI ช่วยอ่านข้อมูล วิเคราะห์ข้อมูล และช่วยตัดสินใจเกี่ยวกับสินค้า ยอดขาย สต็อก วันหมดอายุ การสั่งซื้อ และต้นทุน

> 📌 **สถานะโปรเจกต์:** อยู่ระหว่างการพัฒนา (Phase 5 — Web Dashboard)

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
| 1 — Foundation | ✅ เสร็จสมบูรณ์ |
| 2 — Database / Medicine Model | ✅ เสร็จสมบูรณ์ |
| 3 — Backend API | ✅ เสร็จสมบูรณ์ |
| 4 — Mobile App | ⏳ เลื่อนไปหลัง Phase 5 (D13) |
| 5 — Web Dashboard | 🔄 กำลังดำเนินการ (ลำดับถัดไป) |
