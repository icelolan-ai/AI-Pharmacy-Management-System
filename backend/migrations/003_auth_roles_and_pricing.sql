-- =====================================================================
-- Migration 003: Auth Roles and Pricing
-- AI Pharmacy Management System — Phase 3 (Backend API)
-- Spec:   docs/03-api-spec.md (section 2 D2/D3/D4, section 2.1, section 3)
-- Target: Supabase project "ai-pharmacy-management" (PostgreSQL)
--
-- D3: drop "authenticated_full_access" policies (deny direct client access)
-- D2: add public.user_profiles (owner / pharmacist / staff)
-- D4: add medicines.selling_price
--
-- No secrets in this file. Do not add passwords or API keys here.
-- =====================================================================

begin;

-- D3: ปิดการเข้าถึงตรงจาก Client (Deny by default)
do $$
declare t text;
begin
  foreach t in array array[
    'medicines','suppliers','invoices','purchases','purchase_items',
    'medicine_lots','sales','sale_items','inventory_transactions','audit_logs'
  ]
  loop
    execute format('drop policy if exists "authenticated_full_access" on public.%I', t);
  end loop;
end;
$$;

-- D2: Role ของผู้ใช้
create table public.user_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  role        text not null check (role in ('owner', 'pharmacist', 'staff')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.user_profiles enable row level security;  -- ไม่มี Policy

create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- D4: ราคาขาย
alter table public.medicines
  add column selling_price numeric(10, 2) check (selling_price >= 0);

commit;
