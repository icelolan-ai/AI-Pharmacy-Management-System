import { apiFetch } from "@/lib/api/client";

/** ผังร้าน (U-8) — an optional way to find where a medicine sits.
 *
 *  Nothing in the main flow (scan → receive → sell) reads any of this. If the
 *  map fails to load, every one of those screens works exactly as before.
 *
 *  All coordinates are real millimetres as integers, origin at the room's
 *  top-left corner, x to the right and y downwards.
 */

export type MapShapeKind =
  | "wall_shelf"
  | "shelf"
  | "pillar"
  | "counter"
  | "door"
  | "room"
  | "other";

export type MapShape = {
  id: string;
  map_id: string;
  kind: MapShapeKind;
  label: string;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  rotation_deg: number;
  /** Height of the object. Only the tilted 2.5D view reads it (U-8.6). */
  height_z_mm: number;
  sort_order: number;
};

export type MapPoint = {
  id: string;
  map_id: string;
  /** The short label on the marker, e.g. "A1". */
  code: string;
  name: string;
  detail: string | null;
  x_mm: number;
  y_mm: number;
  /** Counted by the database, never added up here. */
  medicine_count: number;
};

export type StoreMap = {
  id: string;
  name: string;
  width_mm: number;
  height_mm: number;
  updated_at: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
};

export type StoreMapView = {
  /** null when the shop has not drawn one. Never a 404. */
  map: StoreMap | null;
  shapes: MapShape[];
  points: MapPoint[];
};

/** Every signed-in role may read it: a cashier has to find where a medicine
 *  sits. Only the owner may change it, which is enforced by the backend. */
export function getStoreMap({ signal }: { signal?: AbortSignal } = {}): Promise<StoreMapView> {
  return apiFetch<StoreMapView>("/api/v1/store-map", { signal, cache: "no-store" });
}

export const SHAPE_KIND_LABEL: Record<MapShapeKind, string> = {
  wall_shelf: "ชั้นวางติดผนัง",
  shelf: "เชลฟ์กลางร้าน",
  pillar: "เสา",
  counter: "เคาน์เตอร์",
  door: "ประตู",
  room: "ห้องภายใน",
  other: "อื่น ๆ",
};

/** Fill per kind. Decoration only: every shape is named in words in the list
 *  beside the drawing, because D34 forbids colour carrying meaning. */
export const SHAPE_KIND_FILL: Record<MapShapeKind, string> = {
  wall_shelf: "#bfdbfe",
  shelf: "#fecaca",
  pillar: "#ddd6fe",
  counter: "#bbf7d0",
  door: "#fed7aa",
  room: "#e2e8f0",
  other: "#e2e8f0",
};
