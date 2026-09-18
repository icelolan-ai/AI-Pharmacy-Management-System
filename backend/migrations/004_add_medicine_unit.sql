-- =====================================================================
-- Migration 004: Medicine unit of count
-- AI Pharmacy Management System — Phase 5 (Web Dashboard)
-- Change Control: approved by Chat A (งาน 5.2)
--
-- Adds medicines.unit ("หน่วยนับ": กล่อง / ขวด / แผง / หลอด / ซอง / ชิ้น ...).
-- NOT NULL with a default so every existing row gets 'กล่อง'.
--
-- No secrets in this file.
-- =====================================================================

begin;

alter table public.medicines
  add column unit text not null default 'กล่อง';

commit;
