-- =====================================================================
-- Migration 015: การตรวจทานใบโดยคน (งาน 6.4 · docs/06-ai-design.md ข้อ 9)
-- AI Pharmacy Management System
--
-- Approved by Chat A (24 Nov 2569) with two conditions, both enforced here
-- by the database, not only by the backend not calling something:
--   1. invoice_scan_corrections is append-only. UPDATE is refused always.
--      DELETE happens only with the whole scan (ON DELETE CASCADE), and a
--      scan can be deleted only while it is not evidence (see 15.3).
--   2. Touching a field again is a new row, never an edit of the old one.
--      A field's current value is its latest row; 6.7 can count how often
--      a person changed their mind.
--
-- Why two values beside the AI's (กฎข้อ 42 · 6.7):
--   ai_value      the AI's field exactly as read — never changed, and the
--                 AI's answer in invoice_scans.extracted is not touched
--   shown_value   what the page showed (what our code made of it, D84)
--   person_value  what the person settled on
--   so 6.7 measures both "did the AI read it right" and "did our code
--   interpret it right".
--
-- No secrets in this file.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 15.1 invoice_scan_corrections — one row per touch of one field
-- ---------------------------------------------------------------------
create table public.invoice_scan_corrections (
  id           uuid primary key default gen_random_uuid(),
  scan_id      uuid not null references public.invoice_scans (id) on delete cascade,
  field_path   text not null check (field_path ~ '^(header\.[a-z_]+|lines\.[0-9]+\.[a-z_]+|totals\.boxes\.[0-9]+)$'),
  ai_value     jsonb not null,
  shown_value  text,
  person_value text,
  action       text not null check (action in ('confirmed', 'changed')),
  changed_by   uuid not null references auth.users (id),
  changed_at   timestamptz not null default now(),
  -- confirmed = took what was shown; changed = put something else.
  -- D76: "is not distinct from" so a NULL on either side cannot slip through.
  constraint corrections_action_matches check (
    (action = 'confirmed') = (person_value is not distinct from shown_value))
);

create index invoice_scan_corrections_scan
  on public.invoice_scan_corrections (scan_id, field_path, changed_at desc);

alter table public.invoice_scan_corrections enable row level security;  -- ไม่มี Policy

create function public.invoice_scan_corrections_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'invoice_scan_corrections is append-only: touch the field again instead (Chat A 6.4)'
      using errcode = 'check_violation';
  end if;
  -- DELETE: only as part of deleting the whole scan. By the time the
  -- cascade reaches this row the scan row is already gone.
  if exists (select 1 from public.invoice_scans where id = old.scan_id) then
    raise exception 'invoice_scan_corrections rows go only with their whole scan'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger trg_invoice_scan_corrections_append_only
  before update or delete on public.invoice_scan_corrections
  for each row execute function public.invoice_scan_corrections_append_only();

-- ---------------------------------------------------------------------
-- 15.2 invoice_scans — rejected and reviewed
-- ---------------------------------------------------------------------
alter table public.invoice_scans
  add column rejected_reason text,
  add column rejected_by     uuid references auth.users (id),
  add column rejected_at     timestamptz,
  add column reviewed_by     uuid references auth.users (id),
  add column reviewed_at     timestamptz;

-- Rejected has a reason, a who and a when — and only rejected has them.
alter table public.invoice_scans add constraint invoice_scans_rejected_has_reason check (
  (status = 'rejected') = (rejected_reason is not null and btrim(rejected_reason) <> ''
                           and rejected_by is not null and rejected_at is not null));

-- "Reviewed" (go on) comes as a pair, and only on a scan that was read.
-- 'rejected' is allowed too: a reviewed scan may still be rejected later
-- (one change from the proposal, so a rejection never has to erase the
-- record that a person had reviewed it).
alter table public.invoice_scans add constraint invoice_scans_reviewed_pair check (
  (reviewed_at is null) = (reviewed_by is null));
alter table public.invoice_scans add constraint invoice_scans_reviewed_only_after_reading check (
  reviewed_at is null or status in ('needs_review', 'converted', 'rejected'));

-- ---------------------------------------------------------------------
-- 15.3 a scan that is evidence cannot be deleted (D58 · Chat A 6.4)
--      converted (it became a purchase) and rejected (kept as evidence).
--      The backend refuses first; this is the database refusing too.
-- ---------------------------------------------------------------------
create function public.invoice_scans_keep_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('converted', 'rejected') then
    raise exception 'a % scan is evidence and cannot be deleted (D58)', old.status
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger trg_invoice_scans_keep_evidence
  before delete on public.invoice_scans
  for each row execute function public.invoice_scans_keep_evidence();

commit;
