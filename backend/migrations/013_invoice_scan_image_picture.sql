-- =====================================================================
-- Migration 013: ลายนิ้วมือของ "ภาพ" และคำบอกของมือถือ (งาน 6.2 · Chat A ข้อ C ทาง ข. · D75)
-- AI Pharmacy Management System
--
-- Why 012's rule has to change
--   012 said: a file stored "not re-encoded" must have exactly the bytes,
--   width and height of what arrived. From 6.2 on, the evidence copy loses
--   its GPS position and the AI copy loses all its metadata — removed from
--   the header, without re-encoding (measured: the compressed picture stays
--   identical byte for byte, decoded pixels identical). The bytes therefore
--   differ while the picture does not, and 012 would refuse a true row.
--   Recording such a file as re-encoded would write down something worse
--   than the truth, so the rule is changed instead.
--
-- The new rule compares the picture, not the file:
--   picture_sha256         fingerprint of every part of the stored JPEG that
--                          decodes the picture — quantization and Huffman
--                          tables, frame header, scan data — and none of the
--                          parts that only describe it (APP1 EXIF/XMP,
--                          APP3-13 incl. IPTC, APP15, comments). Defined in
--                          backend/app/scan/jpeg.py.
--   source_picture_sha256  the same fingerprint of what arrived; null when
--                          what arrived was not a JPEG.
--   reencoded = false now means: same width, same height, same picture
--   fingerprint. Trimming a header passes; touching a table or a pixel is
--   refused by the database, whatever the code believed it did.
--
-- client_reported_resized (D75)
--   Whether the file the backend received had already been shrunk on the
--   phone. 🔴 This is what the client SAYS. Nothing here can check it (D69):
--   treat it as a hint about how the upload was made, never as evidence.
--   source_bytes and source_sha256 keep their meaning — the bytes the
--   backend received — which was always all we could know. We never knew
--   the size of the file the camera made.
--
-- Rows written before 013 (PROD: 4 rows from the iPhone test, all
-- reencoded = true) keep both fingerprints null. Null means "not known",
-- which is the truth: the uploaded bytes were never kept, so nobody can say
-- what their picture fingerprint was. Nothing is filled in after the fact
-- (Chat A). Null cannot slip through the rule below: a row that claims
-- reencoded = false must carry a fingerprint, so a null fails at once.
--
-- From 013 on every new row carries picture_sha256 (every stored file is a
-- JPEG); that check is added NOT VALID so it binds new rows only and leaves
-- the four old rows as they are. source_picture_sha256 is null only when
-- the upload was not a JPEG. client_reported_resized is false for the old
-- rows, which is known, not guessed: phone shrinking did not exist then.
--
-- No secrets in this file.
-- =====================================================================

begin;

alter table public.invoice_scan_images
  add column picture_sha256        text check (picture_sha256        ~ '^[0-9a-f]{64}$'),
  add column source_picture_sha256 text check (source_picture_sha256 ~ '^[0-9a-f]{64}$'),
  -- Default only to fill existing rows (there was no phone shrinking before
  -- 013), then dropped: every insert has to say.
  add column client_reported_resized boolean not null default false;

alter table public.invoice_scan_images
  alter column client_reported_resized drop default;

-- Every stored file is a JPEG, so every new row has a picture fingerprint.
-- NOT VALID: binds every row written from now on; rows from before 013
-- stay null ("not known") and are never back-filled.
alter table public.invoice_scan_images
  add constraint invoice_scan_images_picture_required
  check (picture_sha256 is not null) not valid;

alter table public.invoice_scan_images
  drop constraint invoice_scan_images_unchanged_means_identical;

-- Both "is not null" are needed. With only the stored one, a row whose
-- source fingerprint is null makes `picture_sha256 = source_picture_sha256`
-- NULL rather than false, and a CHECK lets NULL through — found by the test
-- that inserts exactly that row.
alter table public.invoice_scan_images
  add constraint invoice_scan_images_unchanged_means_same_picture check (
    reencoded
    or (width_px = source_width_px
        and height_px = source_height_px
        and picture_sha256 is not null
        and source_picture_sha256 is not null
        and picture_sha256 = source_picture_sha256)
  );

commit;
