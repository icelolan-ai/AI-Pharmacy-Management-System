-- =====================================================================
-- Migration 007: Shop owner name (ชื่อเจ้าของร้าน)
-- AI Pharmacy Management System — Phase 5 (D31)
--
-- One free-text column. A shop with several owners writes them all in this
-- one field: no owner_1 / owner_2, and no separate table (กฎข้อ 66).
--
-- `tax_id` is NOT added here — migration 005 already created it. D31 asked for
-- two columns, but only this one was missing.
--
-- No shop data is seeded here. The owner fills the form in at /settings/store.
-- No secrets in this file.
-- =====================================================================

begin;

alter table public.store_profile
  add column owner_name text;

commit;
