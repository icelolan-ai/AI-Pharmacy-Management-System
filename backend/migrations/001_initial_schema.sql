-- =====================================================================
-- Migration 001: Initial Schema
-- AI Pharmacy Management System — Phase 2 (Database / Medicine Model)
-- Spec:   docs/02-database-schema.md
-- Target: Supabase project "ai-pharmacy-management" (PostgreSQL)
--
-- Tables are created in FK dependency order:
--   medicines, suppliers -> invoices -> purchases -> purchase_items
--   -> medicine_lots -> sales -> sale_items
--   -> inventory_transactions, audit_logs
--
-- No secrets in this file. Do not add passwords or API keys here.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Shared trigger function: keep updated_at current on UPDATE
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3.1 medicines — ข้อมูลสินค้าหลัก
-- ---------------------------------------------------------------------
create table public.medicines (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid,
  name              text not null,
  generic_name      text,
  strength          text,
  dosage_form       text,
  manufacturer      text,
  category          text,
  barcode           text unique,
  active_ingredient text,
  reorder_point     integer,
  is_active         boolean default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 3.2 suppliers — ผู้จำหน่าย
-- ---------------------------------------------------------------------
create table public.suppliers (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid,
  name           text not null,
  contact_person text,
  phone          text,
  email          text,
  address        text,
  lead_time_days integer,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 3.6 invoices — เอกสารต้นฉบับ (created before purchases, which reference it)
-- ---------------------------------------------------------------------
create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  invoice_number    text,
  supplier_id       uuid references public.suppliers (id),
  invoice_date      date,
  file_url          text not null,
  raw_extraction    jsonb,
  confidence_scores jsonb,
  review_status     text default 'pending'
                    check (review_status in ('pending', 'reviewed', 'confirmed')),
  created_at        timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 3.4 purchases — การสั่งซื้อ/รับสินค้า
-- ---------------------------------------------------------------------
create table public.purchases (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid,
  supplier_id     uuid not null references public.suppliers (id),
  invoice_id      uuid references public.invoices (id),
  purchase_date   date not null,
  discount_amount numeric(10, 2) default 0,
  tax_amount      numeric(10, 2) default 0,
  total_amount    numeric(10, 2) not null,
  status          text default 'draft'
                  check (status in ('draft', 'confirmed', 'discrepancy')),
  created_by      uuid references auth.users (id),
  created_at      timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 3.5 purchase_items — รายการย่อยในใบสั่งซื้อ
-- ---------------------------------------------------------------------
create table public.purchase_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_id       uuid not null references public.purchases (id),
  medicine_id       uuid not null references public.medicines (id),
  quantity_invoiced integer not null,
  quantity_actual   integer,
  unit_cost         numeric(10, 2) not null,
  lot_number        text not null,
  expiry_date       date not null,
  subtotal          numeric(10, 2) not null,
  created_at        timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 3.3 medicine_lots — Lot แต่ละชุดที่รับเข้ามา (ตารางสำคัญที่สุด)
-- ---------------------------------------------------------------------
create table public.medicine_lots (
  id                 uuid primary key default gen_random_uuid(),
  medicine_id        uuid not null references public.medicines (id),
  supplier_id        uuid references public.suppliers (id),
  purchase_item_id   uuid references public.purchase_items (id),
  lot_number         text not null,
  quantity_received  integer not null check (quantity_received >= 0),
  quantity_remaining integer not null check (quantity_remaining >= 0),
  cost_per_unit      numeric(10, 2) not null check (cost_per_unit >= 0),
  expiry_date        date not null,
  received_date      date not null default current_date,
  status             text default 'active'
                     check (status in ('active', 'expired', 'depleted', 'damaged')),
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- FEFO lookups
create index idx_medicine_lots_medicine_expiry
  on public.medicine_lots (medicine_id, expiry_date);

-- Expiry Intelligence dashboard
create index idx_medicine_lots_status_expiry
  on public.medicine_lots (status, expiry_date);

-- ---------------------------------------------------------------------
-- 3.7 sales — การขาย
-- ---------------------------------------------------------------------
create table public.sales (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid,
  sale_date       timestamptz default now(),
  discount_amount numeric(10, 2) default 0,
  tax_amount      numeric(10, 2) default 0,
  total_amount    numeric(10, 2) not null,
  created_by      uuid references auth.users (id),
  created_at      timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 3.8 sale_items — รายการย่อยในการขาย
-- ---------------------------------------------------------------------
create table public.sale_items (
  id              uuid primary key default gen_random_uuid(),
  sale_id         uuid not null references public.sales (id),
  medicine_id     uuid not null references public.medicines (id),
  medicine_lot_id uuid not null references public.medicine_lots (id),
  quantity        integer not null check (quantity > 0),
  unit_price      numeric(10, 2) not null,
  subtotal        numeric(10, 2) not null,
  created_at      timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 3.9 inventory_transactions — บันทึกทุกการเปลี่ยนแปลง Stock
-- ---------------------------------------------------------------------
create table public.inventory_transactions (
  id               uuid primary key default gen_random_uuid(),
  medicine_lot_id  uuid not null references public.medicine_lots (id),
  transaction_type text check (transaction_type in (
                     'purchase', 'sale', 'return', 'adjustment',
                     'damage', 'expired', 'correction'
                   )),
  quantity_change  integer not null,
  quantity_before  integer not null,
  quantity_after   integer not null,
  reference_type   text,
  reference_id     uuid,
  notes            text,
  created_by       uuid references auth.users (id),
  created_at       timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 3.10 audit_logs — Audit Trail ทั่วไป
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id  uuid not null,
  action     text check (action in ('insert', 'update', 'delete')),
  old_value  jsonb,
  new_value  jsonb,
  changed_by uuid references auth.users (id),
  reason     text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
create trigger trg_medicines_updated_at
  before update on public.medicines
  for each row execute function public.set_updated_at();

create trigger trg_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

create trigger trg_medicine_lots_updated_at
  before update on public.medicine_lots
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5. Row Level Security
-- Single-store version: authenticated users can read/write every table.
-- The backend uses the service_role key, which bypasses RLS.
-- Role-specific policies are planned for Phase 3.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'medicines', 'suppliers', 'invoices', 'purchases', 'purchase_items',
    'medicine_lots', 'sales', 'sale_items', 'inventory_transactions',
    'audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "authenticated_full_access" on public.%I
         for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end;
$$;

commit;
