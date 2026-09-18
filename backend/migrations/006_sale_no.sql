-- =====================================================================
-- Migration 006: Human-readable sale number (เลขที่บิล)
-- AI Pharmacy Management System — Phase 5 (งาน 5.4 follow-up, D26)
--
-- Format: S-YYMMDD-NNN
--   YYMMDD = business date in Asia/Bangkok (D9), Buddhist year, last 2 digits
--            18 ก.ย. 2569 -> 690918
--   NNN    = per-day running number, restarts at 001 every business day,
--            at least 3 digits and widening past 999 rather than wrapping.
--
-- Order matters: add the column nullable, backfill every existing row, and
-- only then make it NOT NULL and unique. Doing it the other way round fails
-- the moment the table already holds sales.
--
-- No secrets in this file.
-- =====================================================================

begin;

alter table public.sales
  add column sale_no text;

-- Backfill: number each existing sale within its own business day, oldest first.
with numbered as (
  select
    id,
    'S-'
      || to_char(
           ((sale_date at time zone 'Asia/Bangkok')::date + interval '543 years'),
           'YYMMDD'
         )
      || '-'
      || lpad(
           (row_number() over (
              partition by (sale_date at time zone 'Asia/Bangkok')::date
              order by created_at, id
            ))::text,
           3, '0'
         ) as sale_no
  from public.sales
)
update public.sales s
   set sale_no = n.sale_no
  from numbered n
 where n.id = s.id;

alter table public.sales
  alter column sale_no set not null;

-- The real guard against two sales taking the same number at the same moment.
create unique index sales_sale_no_key on public.sales (sale_no);

commit;
