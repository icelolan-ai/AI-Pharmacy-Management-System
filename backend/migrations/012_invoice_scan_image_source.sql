-- =====================================================================
-- Migration 012: บันทึกว่าไฟล์ที่เก็บ มาจากไฟล์ไหน และถูกแก้หรือไม่ (D68 แก้ไข · งาน 6.2)
-- AI Pharmacy Management System
--
-- What "original" means from here on
--   kind = 'original' is the copy kept AS EVIDENCE. It is NOT the bytes the
--   phone sent. A phone photo can be 18.7 MB (measured on a real iPhone);
--   the backend shrinks it to at most ORIGINAL_MAX_EDGE_PX on the long edge
--   before storing it, because rule 30 asks for a document that can be read
--   and whose content is unchanged, not for the highest resolution.
--   The word stays in the kind column; this header is where it is defined.
--
-- Because the stored file may not be what arrived, every row now says what
-- did arrive and whether these bytes are it:
--   source_content_type  what the first bytes of the upload really were
--   source_bytes         its size
--   source_width_px/     its dimensions as stored in the file, before any
--   source_height_px     turning to follow the camera's EXIF orientation
--   source_sha256        fingerprint of exactly the bytes the phone sent.
--                        The only way to answer, later, "which file did this
--                        picture come from" — for example in a dispute with a
--                        supplier.
--   reencoded            true when the stored bytes are not the uploaded
--                        bytes: shrunk, turned upright, or converted to JPEG
--
-- The check below makes "not re-encoded" impossible to claim falsely: when
-- reencoded is false, size and dimensions must equal the source's exactly.
-- A bug that re-encodes and forgets to say so is refused by the database.
--
-- Columns live on the row, not in a second table: where a file came from
-- belongs to that file, and every audit would otherwise need a join. Not
-- jsonb, because jsonb cannot carry the check.
--
-- A for_ai row carries the same source values as its original: both are
-- made from the same upload.
--
-- width_px / height_px become NOT NULL: 6.2 accepts images only (PDF was
-- taken out until a supplier really sends one), so every stored file has
-- dimensions.
--
-- The table is still empty on both projects (checked before running), so
-- NOT NULL needs no backfill.
--
-- No secrets in this file.
-- =====================================================================

begin;

alter table public.invoice_scan_images
  add column source_content_type text    not null check (btrim(source_content_type) <> ''),
  add column source_bytes        integer not null check (source_bytes > 0),
  add column source_width_px     integer not null check (source_width_px > 0),
  add column source_height_px    integer not null check (source_height_px > 0),
  add column source_sha256       text    not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  -- No default: every insert has to say whether it changed the file.
  add column reencoded           boolean not null;

alter table public.invoice_scan_images
  alter column width_px  set not null,
  alter column height_px set not null;

alter table public.invoice_scan_images
  add constraint invoice_scan_images_unchanged_means_identical check (
    reencoded
    or (bytes = source_bytes
        and width_px = source_width_px
        and height_px = source_height_px)
  );

commit;
