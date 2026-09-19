-- =====================================================================
-- Migration 008: Purchase paperwork fields
-- AI Pharmacy Management System — Phase 5 (D28 · D29 · D30)
--
-- D28  purchases.invoice_no   เลขที่ใบส่งของ, typed by hand.
--      Nullable: a draft may not have it yet. The API insists on it at
--      confirm time instead. The `invoices` table is NOT used here — it is
--      reserved for OCR in Phase 8 and its file_url is NOT NULL, which would
--      force a fake value (กฎข้อ 4).
--
-- D29  purchases.purchase_no  เลขที่ใบรับสินค้า, format R-YYMMDD-NNN.
--      Issued only when the purchase LEAVES draft (confirmed or discrepancy),
--      so abandoning a draft never burns a number. That is why the column is
--      nullable and a CHECK — not NOT NULL — carries the rule: a draft may
--      have no number, anything else must have one.
--
-- D30  purchases.confirmed_at When the goods were actually counted in. The A4
--      note prints this, not created_at: a draft opened on Monday and counted
--      on Wednesday is a Wednesday receipt.
--
-- Every column is added IF NOT EXISTS, so re-running is safe and a column that
-- already exists is left alone.
--
-- No secrets and no shop data in this file.
-- =====================================================================

begin;

alter table public.purchases add column if not exists invoice_no   text;
alter table public.purchases add column if not exists purchase_no  text;
alter table public.purchases add column if not exists confirmed_at timestamptz;

-- Backfill: only rows that already left draft get a number, oldest first
-- within their own business day. Drafts stay NULL on purpose.
with numbered as (
  select
    id,
    'R-'
      || to_char(
           ((created_at at time zone 'Asia/Bangkok')::date + interval '543 years'),
           'YYMMDD'
         )
      || '-'
      || lpad(
           (row_number() over (
              partition by (created_at at time zone 'Asia/Bangkok')::date
              order by created_at, id
            ))::text,
           3, '0'
         ) as purchase_no
  from public.purchases
  where status <> 'draft' and purchase_no is null
)
update public.purchases p
   set purchase_no = n.purchase_no
  from numbered n
 where n.id = p.id;

-- Rows confirmed before this migration have no record of when; created_at is
-- the closest honest value available.
update public.purchases
   set confirmed_at = created_at
 where status <> 'draft' and confirmed_at is null;

create unique index if not exists purchases_purchase_no_key
  on public.purchases (purchase_no);

-- NULL is allowed only while the purchase is still a draft.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'purchases_purchase_no_required'
  ) then
    alter table public.purchases
      add constraint purchases_purchase_no_required
      check (status = 'draft' or purchase_no is not null);
  end if;
end $$;

commit;
