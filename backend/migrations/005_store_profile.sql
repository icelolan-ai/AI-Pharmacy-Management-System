-- =====================================================================
-- Migration 005: Store profile (ข้อมูลร้าน)
-- AI Pharmacy Management System — Phase 5 (งาน 5.8ข, A-2 approved)
--
-- One row holding the pharmacy's own details, used on receipts.
-- Multi-store ready (กฎข้อ 65): a `pharmacy_id` column can be added later and
-- the singleton index swapped for a unique index on pharmacy_id, without
-- rebuilding the table or moving data.
--
-- RLS is enabled with no policy, like every other table: clients cannot reach
-- it through the Data API; only the backend (direct connection) can.
--
-- No secrets in this file.
-- =====================================================================

begin;

create table public.store_profile (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  address     text,
  phone       text,
  license_no  text,
  tax_id      text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id)
);

-- Exactly one row today. To go multi-store later: drop this index and add
-- `pharmacy_id uuid` + `unique (pharmacy_id)`.
create unique index store_profile_singleton on public.store_profile ((true));

alter table public.store_profile enable row level security;  -- ไม่มี Policy

create trigger trg_store_profile_updated_at
  before update on public.store_profile
  for each row execute function public.set_updated_at();

commit;
