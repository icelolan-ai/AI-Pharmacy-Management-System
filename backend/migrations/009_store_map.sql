-- =====================================================================
-- Migration 009: ผังร้าน (U-8) — store map, shapes, marked points
-- AI Pharmacy Management System — Phase 6 (U-8.1, approved)
--
-- U-8 เป็น "ตัวเลือกเสริม" ไม่ใช่ระบบหลัก
-- ระบบหลักคือ สแกน -> เข้าคลัง -> ขายยา (พิมพ์/ยิงบาร์โค้ด) และต้องทำงานได้
-- ครบทุกอย่างแม้ผังจะพังหรือถูกลบทิ้งทั้งหมด
--
-- ไม่มี ALTER ตารางเดิมแม้แถวเดียว ทั้ง 4 ตารางนี้เป็นของใหม่ล้วน
-- ความผูกพันกับโลกเดิมมีเส้นเดียว: store_map_point_medicines.medicine_id
-- ชี้ไปที่ medicines(id) พร้อม on delete cascade (อนุมัติแล้ว) ทิศทางคือ
-- ตารางใหม่อ้างตารางเก่า ไม่ใช่ทางกลับกัน — ลบ 4 ตารางนี้ทิ้งทั้งหมดเมื่อไร
-- ระบบหลักยังทำงานครบ
--
-- หน่วยเป็นมิลลิเมตรจริง เป็นจำนวนเต็ม จุดกำเนิด (0,0) อยู่มุมซ้ายบนของห้อง
-- x ไปทางขวา y ลงล่าง เก็บเป็นขนาดจริงไม่ใช่พิกัดสัมพัทธ์ เพราะวันที่วัดห้อง
-- ใหม่แล้วขนาดเปลี่ยน ของที่วางไว้ต้องอยู่ที่เดิม ไม่ใช่ขยับตามกันทั้งหมด
-- 2D กับ 2.5D ใช้ข้อมูลชุดเดียวกัน ต่างกันแค่วิธีฉายภาพ (ใช้ height_z_mm)
--
-- กฎข้อ 65 (SaaS): store_maps.store_id เป็นที่เดียวที่ผูกกับร้าน ตารางที่เหลือ
-- ถึงร้านผ่าน map_id — วันที่ทำหลายร้านจริงจึงแก้ที่เดียว
--
-- RLS เปิดแต่ไม่มี Policy เหมือนทุกตารางในโปรเจกต์นี้: client เข้าผ่าน Data API
-- ไม่ได้เลย มีแต่ backend (ต่อตรง) ที่อ่าน/เขียนได้
--
-- ไม่มีค่าลับในไฟล์นี้ และไม่มีข้อมูลผังจริงของร้าน — ผู้ใช้จะวาดเองใน U-8.4
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 9.1 store_maps — ผังหนึ่งผัง (เผื่อหลายผัง/หลายชั้นในอนาคต)
--     UI รุ่นแรกใช้ผังเดียว แต่โครงตารางรองรับหลายผังตั้งแต่ต้น จะได้ไม่ต้อง
--     migration รอบสองเมื่อร้านอยากแยกชั้นบน/ชั้นล่าง
-- ---------------------------------------------------------------------
create table public.store_maps (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid,
  name       text not null check (btrim(name) <> ''),
  -- ขนาดห้องจริงเป็นมิลลิเมตร ขอบบนกว้างพอสำหรับอาคาร 100 เมตร
  width_mm   integer not null check (width_mm between 100 and 100000),
  height_mm  integer not null check (height_mm between 100 and 100000),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create index store_maps_store on public.store_maps (store_id) where is_active;

-- ---------------------------------------------------------------------
-- 9.2 store_map_shapes — ของที่วางอยู่ในห้อง
--     สี่เหลี่ยมอย่างเดียว (MVP ตามกฎ 66): ผังที่ผู้ใช้ให้มาเป็นสี่เหลี่ยมล้วน
--     และรูปตัว L ประกอบจากสองสี่เหลี่ยมได้ ถ้าวันหนึ่งต้องการรูปอิสระจริง ๆ
--     ค่อยเพิ่มตารางจุดยอดต่างหาก โดยไม่ต้องแก้ตารางนี้
-- ---------------------------------------------------------------------
create table public.store_map_shapes (
  id           uuid primary key default gen_random_uuid(),
  map_id       uuid not null references public.store_maps (id) on delete cascade,
  kind         text not null check (kind in (
                 'wall_shelf',  -- ชั้นวางยาติดผนัง
                 'shelf',       -- เชลฟ์กลางร้าน
                 'pillar',      -- เสา
                 'counter',     -- เคาน์เตอร์
                 'door',        -- ประตู
                 'room',        -- ห้องเล็กภายใน
                 'other'
               )),
  -- ทุกอย่างบนผังต้องมีชื่อเป็นข้อความ (D34) ห้ามสื่อด้วยสีหรือตำแหน่งอย่างเดียว
  label        text not null check (btrim(label) <> ''),
  x_mm         integer not null,
  y_mm         integer not null,
  width_mm     integer not null check (width_mm > 0),
  height_mm    integer not null check (height_mm > 0),
  rotation_deg integer not null default 0 check (rotation_deg between 0 and 359),
  -- ความสูงของตัวของ ใช้ตอนวาดมุมเอียง 2.5D เท่านั้น 0 = ราบกับพื้น
  height_z_mm  integer not null default 0 check (height_z_mm between 0 and 10000),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index store_map_shapes_map on public.store_map_shapes (map_id, sort_order, id);

-- ---------------------------------------------------------------------
-- 9.3 store_map_points — จุดที่ผู้ใช้ mark ไว้ 1–1000 จุดต่อผัง
--     เพดาน 1000 จุดบังคับที่ backend ไม่ใช่ที่นี่: constraint ที่ต้องนับแถว
--     ทุกครั้งที่ insert จะทำให้การเพิ่มจุดช้าลงตามจำนวนจุดที่มีอยู่
--
--     x_mm/y_mm ต้องอยู่ในกรอบของผัง แต่ข้ามตารางไปเช็คใน CHECK ไม่ได้
--     backend เป็นคนตรวจ (และเป็นทางเดียวที่เขียนตารางนี้ได้อยู่แล้ว)
-- ---------------------------------------------------------------------
create table public.store_map_points (
  id         uuid primary key default gen_random_uuid(),
  map_id     uuid not null references public.store_maps (id) on delete cascade,
  -- ป้ายสั้นที่เขียนกำกับจุดบนผัง เช่น "A1" — บนผังมีแค่รูปทรงกับเลขนี้
  -- ส่วนชื่อเต็มอยู่ในตารางข้าง ๆ เพราะ D45 ห้ามตัวหนังสือใน <svg>
  code       text not null check (btrim(code) <> '' and length(code) <= 8),
  name       text not null check (btrim(name) <> ''),
  detail     text,
  x_mm       integer not null check (x_mm >= 0),
  y_mm       integer not null check (y_mm >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- เลขกำกับห้ามซ้ำในผังเดียวกัน ไม่งั้นบนผังจะมี "A1" สองจุด
create unique index store_map_points_code on public.store_map_points (map_id, lower(btrim(code)));
create index store_map_points_map on public.store_map_points (map_id, id);

-- ---------------------------------------------------------------------
-- 9.4 store_map_point_medicines — ยา อยู่ตรงไหนบ้าง
--     many-to-many: ยาตัวเดียวกันวางได้หลายจุด และจุดหนึ่งมีได้หลายยา
--
--     ผูกกับ "ยา" ไม่ใช่ "ล็อต" โดยตั้งใจ: ล็อตเกิดและหมดไปตลอดเวลา ถ้าผูก
--     กับล็อตผู้ใช้จะต้องมาย้ายหมุดใหม่ไม่จบสิ้น ส่วนตัวกรองล็อต/วันหมดอายุ
--     ยัง join จาก medicines -> medicine_lots ได้ตามปกติ
--
--     on delete cascade: ลบยาแล้วลิงก์ต้องหายตาม ไม่งั้นชื่อยาที่ไม่มีอยู่จริง
--     จะไปโผล่ในช่องขาย ซึ่งเป็นบั๊กที่คนหน้าร้านเจอ
-- ---------------------------------------------------------------------
create table public.store_map_point_medicines (
  point_id    uuid not null references public.store_map_points (id) on delete cascade,
  medicine_id uuid not null references public.medicines (id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id),
  primary key (point_id, medicine_id)
);

-- "ยาตัวนี้อยู่จุดไหนบ้าง" — ทิศทางตรงข้ามกับ primary key
create index store_map_point_medicines_medicine
  on public.store_map_point_medicines (medicine_id);

-- ---------------------------------------------------------------------
-- 9.5 RLS: เปิดทุกตาราง ไม่มี Policy (เหมือนทุกตารางในโปรเจกต์นี้)
-- ---------------------------------------------------------------------
alter table public.store_maps                enable row level security;  -- ไม่มี Policy
alter table public.store_map_shapes          enable row level security;  -- ไม่มี Policy
alter table public.store_map_points          enable row level security;  -- ไม่มี Policy
alter table public.store_map_point_medicines enable row level security;  -- ไม่มี Policy

-- ---------------------------------------------------------------------
-- 9.6 updated_at ดูแลตัวเอง ใช้ฟังก์ชันเดิมที่มีอยู่แล้ว
-- ---------------------------------------------------------------------
create trigger trg_store_maps_updated_at
  before update on public.store_maps
  for each row execute function public.set_updated_at();

create trigger trg_store_map_shapes_updated_at
  before update on public.store_map_shapes
  for each row execute function public.set_updated_at();

create trigger trg_store_map_points_updated_at
  before update on public.store_map_points
  for each row execute function public.set_updated_at();

commit;
