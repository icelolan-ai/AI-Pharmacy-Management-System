-- =====================================================================
-- Migration 016: จำการจับคู่ (งาน 6.5 · docs/06-ai-design.md ข้อ 12)
-- AI Pharmacy Management System
--
-- What a person chose, so the next invoice proposes it first (Chat A,
-- approved with the 6.5 draft). Two tables, one per thing matched:
--   supplier_name_aliases   the name on the invoice -> a supplier
--   medicine_name_aliases   a supplier + the name on the invoice -> a medicine
--
-- Append-only in the database, like invoice_scan_corrections: a different
-- choice later is a new row and the latest wins (Chat A: "การจำใหม่ชนะ"),
-- and the old row stays, so a wrong memory can be traced to when and where
-- it came from.
--
-- invoice_name is stored already normalised by app/scan/matching.normalise
-- — the one rule used both to remember and to look up. The name as written
-- is kept beside it for people to read.
--
-- scan_id is a plain uuid with no foreign key on purpose: a scan may be
-- deleted (if never evidence), and a foreign key would turn that delete
-- into an UPDATE here, which this table refuses. invoice_no is copied so
-- "จากใบ <เลขใบ>" survives the scan.
--
-- No secrets in this file.
-- =====================================================================

begin;

create table public.supplier_name_aliases (
  id            uuid primary key default gen_random_uuid(),
  invoice_name  text not null check (btrim(invoice_name) <> ''),
  written_name  text not null,
  supplier_id   uuid not null references public.suppliers (id),
  scan_id       uuid,
  invoice_no    text,
  chosen_by     uuid not null references auth.users (id),
  chosen_at     timestamptz not null default now()
);
create index supplier_name_aliases_lookup
  on public.supplier_name_aliases (invoice_name, chosen_at desc);

create table public.medicine_name_aliases (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid not null references public.suppliers (id),
  invoice_name  text not null check (btrim(invoice_name) <> ''),
  written_name  text not null,
  medicine_id   uuid not null references public.medicines (id),
  scan_id       uuid,
  invoice_no    text,
  chosen_by     uuid not null references auth.users (id),
  chosen_at     timestamptz not null default now()
);
create index medicine_name_aliases_lookup
  on public.medicine_name_aliases (supplier_id, invoice_name, chosen_at desc);

alter table public.supplier_name_aliases enable row level security;  -- ไม่มี Policy
alter table public.medicine_name_aliases enable row level security;  -- ไม่มี Policy

create function public.match_memory_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only: choose again instead (Chat A 6.5)', tg_table_name
    using errcode = 'check_violation';
end;
$$;

create trigger trg_supplier_name_aliases_append_only
  before update or delete on public.supplier_name_aliases
  for each row execute function public.match_memory_append_only();
create trigger trg_medicine_name_aliases_append_only
  before update or delete on public.medicine_name_aliases
  for each row execute function public.match_memory_append_only();

commit;
