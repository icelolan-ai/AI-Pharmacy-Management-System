-- =====================================================================
-- Migration 014: การอ่านใบด้วย AI (งาน 6.3 · docs/06-ai-design.md ข้อ 3.8)
-- AI Pharmacy Management System
--
-- Three changes to invoice_scans and nothing else.
--
-- 1. thinking_tokens — tokens a model spends reasoning before it answers.
--    Kept apart from tokens_out (approved 25 Sep): they are paid for but
--    never seen, models differ a lot in how many they spend, and their price
--    may change on its own. null = the provider did not report it;
--    0 = the model did not think.
--
-- 2. The two status rules approved for 6.3:
--    (1) converted has a purchase, and a purchase is attached only while
--        converted.
--    (2) failed has a reason that is not blank.
--    D76: status is NOT NULL and "purchase_id is not null" is never NULL,
--    so rule (1) cannot be let through by a NULL; rule (2) tests
--    "is not null" before btrim. The tests put a NULL on each side.
--
-- 3. purchase_id: ON DELETE SET NULL -> ON DELETE RESTRICT (Chat A, ค.).
--    With rule (1), SET NULL would turn "delete the draft" into an error
--    deep in the database. Instead the database now refuses to delete a
--    purchase a scan points at, and the code that deletes a draft first
--    hands the scan back to needs_review — clearing purchase_id — in the
--    same transaction, with an audit row (6.3: services/purchases.py).
--    A confirmed purchase cannot be deleted at all, as before.
--
-- Rows already there (counted 22 Nov 2569, read only): PROD 2 rows, both
-- 'uploaded', no purchase_id, no failed_reason — none breaks a rule. Count
-- again right before applying; ALTER ... ADD CONSTRAINT checks every row
-- and stops the migration if one does.
--
-- No secrets in this file.
-- =====================================================================

begin;

alter table public.invoice_scans
  add column thinking_tokens integer check (thinking_tokens >= 0);

alter table public.invoice_scans
  add constraint invoice_scans_converted_has_purchase
  check ((status = 'converted') = (purchase_id is not null));

alter table public.invoice_scans
  add constraint invoice_scans_failed_has_reason
  check (status <> 'failed' or (failed_reason is not null and btrim(failed_reason) <> ''));

alter table public.invoice_scans
  drop constraint invoice_scans_purchase_id_fkey;
alter table public.invoice_scans
  add constraint invoice_scans_purchase_id_fkey
  foreign key (purchase_id) references public.purchases (id) on delete restrict;

commit;
