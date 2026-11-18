import { ABILITIES } from "@/lib/abilities";
import type { NavGroup } from "@/lib/nav/items";

/** The menu, in the order a shop actually works through its day (U-3).
 *
 *  The first block carries no heading and never folds: selling and looking
 *  something up in the stock list happen all day, and putting them behind a
 *  heading to read past would make the menu worse, not better.
 *
 *  "ยาที่ต้องดูด่วน" is deliberately not filed under reports. Those three
 *  pages are things to act on, not things to look at.
 */
export const MENU: readonly NavGroup[] = [
  {
    heading: null,
    items: [
      { href: "/", label: "หน้าแรก" },
      { href: "/sell", label: "ขายยา" },
      { href: "/stock", label: "คลังยา" },
    ],
  },
  {
    heading: "หน้าที่ประจำวัน",
    items: [
      { href: "/receiving", label: "รับสินค้า", ability: ABILITIES.receiveStock },
      // 6.2: optional — receiving by hand never depends on it.
      { href: "/scan", label: "ถ่ายใบส่งของ", ability: ABILITIES.receiveStock },
    ],
  },
  {
    heading: "ยาที่ต้องดูด่วน",
    items: [
      { href: "/reports/low-stock", label: "ยาใกล้หมด", ability: ABILITIES.viewReports },
      { href: "/expiry", label: "ใกล้หมดอายุ", ability: ABILITIES.viewReports },
      { href: "/reports/expired", label: "หมดอายุแล้ว", ability: ABILITIES.viewReports },
    ],
  },
  {
    heading: "รายงานและประวัติ",
    items: [
      { href: "/dashboard", label: "ภาพรวมร้าน", ability: ABILITIES.viewReports },
      {
        href: "/reports/inventory-value",
        label: "มูลค่าคลังยา",
        ability: ABILITIES.viewInventoryValue,
      },
      { href: "/history/sales", label: "ประวัติการขาย", ability: ABILITIES.viewReports },
      { href: "/history/purchases", label: "ประวัติรับสินค้า", ability: ABILITIES.viewReports },
      { href: "/audit", label: "ตรวจสอบย้อนหลัง", ability: ABILITIES.viewAuditLog },
    ],
  },
  {
    heading: "ตั้งค่า",
    items: [
      { href: "/suppliers", label: "ผู้จำหน่าย", ability: ABILITIES.viewSuppliers },
      { href: "/settings/store", label: "ข้อมูลร้าน", ability: ABILITIES.manageStoreProfile },
      // U-8: ทุก role เปิดดูได้ พนักงานขายต้องหาว่ายาอยู่ตรงไหน
      { href: "/store-map", label: "ผังร้าน" },
      { href: "/me", label: "ข้อมูลของฉัน" },
      // D71: every role picks the theme of the phone in their own hand.
      { href: "/settings/display", label: "การแสดงผล" },
    ],
  },
];
