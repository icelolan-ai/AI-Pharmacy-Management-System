-- =====================================================================
-- Migration 011: รูปต้นฉบับ กับ รูปที่ส่งให้ AI เป็นคนละไฟล์ (D68 · งาน 6.2)
-- AI Pharmacy Management System
--
-- One row per file, told apart by `kind`:
--   original  exactly as photographed — evidence, and what a person sees
--             when checking the reading. Never shrunk, never re-encoded.
--   for_ai    a smaller copy made from the original. The only thing that
--             is ever sent to an AI provider.
--
-- A row per file rather than two path columns in one row: each file has its
-- own type, size and dimensions, and "only for_ai rows go to the AI" is then
-- a rule the table itself carries rather than one every caller must remember.
-- It also leaves room for 6.7 to make several for_ai copies at different
-- sizes and compare them.
--
-- This alters invoice_scan_images, created by 010 and still empty on both
-- projects (checked before running). No table of the main system is touched.
--
-- width_px / height_px are recorded so 6.7 can compare how small a for_ai
-- copy can get before readings suffer.
--
-- No secrets in this file.
-- =====================================================================

begin;

-- No default on purpose: every insert has to say which kind of file it is.
-- The table is empty, so NOT NULL needs no backfill.
alter table public.invoice_scan_images
  add column kind text not null check (kind in ('original', 'for_ai')),
  add column width_px  integer check (width_px  > 0),
  add column height_px integer check (height_px > 0);

-- One original and one for_ai per page, not one row per page.
alter table public.invoice_scan_images
  drop constraint invoice_scan_images_page;
alter table public.invoice_scan_images
  add constraint invoice_scan_images_page_kind unique (scan_id, page_no, kind);

commit;
