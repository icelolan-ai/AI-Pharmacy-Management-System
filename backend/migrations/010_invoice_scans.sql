-- =====================================================================
-- Migration 010: สแกนใบส่งของ (Phase 6 งาน 6.1)
-- AI Pharmacy Management System
--
-- Two new tables and nothing else. No existing table is altered, and
-- medicine_lots is not touched: the two cost columns of D60 belong to 6.6.
--
-- One scan is one document as photographed — a delivery note or a tax
-- invoice, one page or several. It moves through
--     uploaded -> extracting -> needs_review -> converted
-- or ends in rejected (a person said no) or failed (the machine could not).
-- `converted` is the state a purchase is attached in.
--
-- Free goods, repeat marks and ambiguous dates (D59, D63, D64) are not
-- columns. They live inside `extracted`, which is jsonb, because 6.3 will
-- reshape them more than once: locking them into columns now would mean
-- ALTERing them away again later.
--
-- Money is integer satang, the same as everywhere else in this project.
--
-- store_id is a plain uuid with no foreign key, like the five tables that
-- already carry one (medicines, purchases, sales, suppliers, store_maps).
-- There is no stores table to point at yet; กฎข้อ 65 adds one when the
-- system serves more than one shop, and every store_id gets its key then.
--
-- RLS is on with no policy, like every table here: only the backend reads
-- and writes these. The images themselves are in the private Storage bucket
-- invoice-scans; this table holds the path, never the bytes.
--
-- No secrets in this file.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 10.1 invoice_scans — one photographed document
-- ---------------------------------------------------------------------
create table public.invoice_scans (
  id                   uuid primary key default gen_random_uuid(),
  store_id             uuid,
  status               text not null default 'uploaded' check (status in (
                         'uploaded',     -- images are in the bucket, nothing read yet
                         'extracting',   -- a provider is reading it
                         'needs_review', -- read; waiting for a person
                         'converted',    -- became a purchase
                         'rejected',     -- a person decided not to use it
                         'failed'        -- could not be read; see failed_reason
                       )),
  -- What kind of paper it is. Null until something has looked at it.
  -- The handwritten delivery note is the one the shop uses every day (D62).
  doc_kind             text check (doc_kind in (
                         'tax_invoice', 'delivery_note', 'handwritten', 'unknown'
                       )),
  created_by           uuid references auth.users (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Which machine read it, with what instructions, and what it cost. Kept so
  -- a wrong reading can be traced to the model and prompt that produced it.
  provider             text,
  model                text,
  prompt_version       text,
  tokens_in            integer check (tokens_in >= 0),
  tokens_out           integer check (tokens_out >= 0),
  cost_estimate_satang integer check (cost_estimate_satang >= 0),

  -- The provider's answer exactly as it came back, for looking into later,
  -- and the same answer turned into this project's shape.
  raw_response         jsonb,
  extracted            jsonb,

  -- Set only once the scan becomes a purchase. A purchase that is later
  -- removed leaves the scan behind as evidence rather than taking it along.
  purchase_id          uuid references public.purchases (id) on delete set null,
  failed_reason        text
);

create index invoice_scans_store_status on public.invoice_scans (store_id, status, created_at desc);
create index invoice_scans_purchase on public.invoice_scans (purchase_id) where purchase_id is not null;

-- ---------------------------------------------------------------------
-- 10.2 invoice_scan_images — the pages of one scan
--      The bytes are in Storage (bucket invoice-scans, private); this row
--      is where to find them and what they are.
-- ---------------------------------------------------------------------
create table public.invoice_scan_images (
  id           uuid primary key default gen_random_uuid(),
  scan_id      uuid not null references public.invoice_scans (id) on delete cascade,
  page_no      integer not null check (page_no >= 1),
  storage_path text not null check (btrim(storage_path) <> ''),
  content_type text not null,
  bytes        integer not null check (bytes > 0),
  uploaded_at  timestamptz not null default now(),
  -- One image per page of a scan; page 2 cannot be uploaded twice.
  constraint invoice_scan_images_page unique (scan_id, page_no)
);

-- ---------------------------------------------------------------------
-- 10.3 RLS: on, no policy — the same as every table in this project
-- ---------------------------------------------------------------------
alter table public.invoice_scans       enable row level security;  -- ไม่มี Policy
alter table public.invoice_scan_images enable row level security;  -- ไม่มี Policy

create trigger trg_invoice_scans_updated_at
  before update on public.invoice_scans
  for each row execute function public.set_updated_at();

commit;
