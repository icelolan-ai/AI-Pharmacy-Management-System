import { apiFetch } from "@/lib/api/client";
import { addMoney } from "@/lib/format/money";

/** One allocation the FEFO planner would cut, in the order it would cut it.
 *  Field names follow docs/03-api-openapi.json (FefoPreviewOut). */
export type FefoAllocation = {
  lot_id: string;
  lot_number: string;
  expiry_date: string;
  quantity: number;
};

export type FefoPreview = {
  medicine_id: string;
  requested: number;
  available: number;
  sufficient: boolean;
  allocations: FefoAllocation[];
};

export function getFefoPreview(
  medicineId: string,
  quantity: number,
  signal?: AbortSignal,
): Promise<FefoPreview> {
  return apiFetch<FefoPreview>(
    `/api/v1/medicines/${medicineId}/fefo-preview?quantity=${quantity}`,
    { signal, cache: "no-store" },
  );
}

/** The API returns ONE ROW PER LOT, not a medicine with a nested lots array.
 *  Group with `groupSaleItems` when the screen needs one line per medicine. */
export type SaleItem = {
  medicine_id: string;
  medicine_name: string | null;
  lot_id: string;
  lot_number: string;
  expiry_date: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
};

export type Sale = {
  id: string;
  sale_date: string;
  discount_amount: string;
  tax_amount: string;
  total_amount: string;
  items: SaleItem[];
};

export type SaleLine = {
  medicine_id: string;
  medicine_name: string | null;
  unit_price: string;
  quantity: number;
  subtotal: string;
  lots: { lot_id: string; lot_number: string; expiry_date: string; quantity: number }[];
};

/** Per-lot rows -> one line per medicine, keeping every lot for the receipt (Q4). */
export function groupSaleItems(items: SaleItem[]): SaleLine[] {
  const lines = new Map<string, SaleLine>();
  for (const item of items) {
    const key = `${item.medicine_id}|${item.unit_price}`;
    const line = lines.get(key);
    if (line) {
      line.quantity += item.quantity;
      line.subtotal = addMoney(line.subtotal, item.subtotal);
      line.lots.push(pickLot(item));
    } else {
      lines.set(key, {
        medicine_id: item.medicine_id,
        medicine_name: item.medicine_name,
        unit_price: item.unit_price,
        quantity: item.quantity,
        subtotal: item.subtotal,
        lots: [pickLot(item)],
      });
    }
  }
  return [...lines.values()];
}

function pickLot(item: SaleItem) {
  return {
    lot_id: item.lot_id,
    lot_number: item.lot_number,
    expiry_date: item.expiry_date,
    quantity: item.quantity,
  };
}

export type SaleCreateInput = {
  items: { medicine_id: string; quantity: number }[];
};

export function createSale(input: SaleCreateInput): Promise<Sale> {
  return apiFetch<Sale>("/api/v1/sales", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getSale(saleId: string, signal?: AbortSignal): Promise<Sale> {
  return apiFetch<Sale>(`/api/v1/sales/${saleId}`, { signal, cache: "no-store" });
}

/** B-8 fallback: if the create response somehow carries no lot detail, read the
 *  sale back so the receipt can still print Lot and EXP. */
export async function createSaleWithLots(input: SaleCreateInput): Promise<Sale> {
  const sale = await createSale(input);
  const hasLots = sale.items?.length > 0 && sale.items.every((item) => Boolean(item.lot_number));
  return hasLots ? sale : getSale(sale.id);
}

/** INSUFFICIENT_STOCK details is an ARRAY of shortages (one per medicine). */
export type StockShortage = { medicine_id: string; requested: number; available: number };

export function parseShortages(details: unknown): StockShortage[] {
  const list = Array.isArray(details) ? details : details ? [details] : [];
  return list.filter(
    (entry): entry is StockShortage =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as StockShortage).medicine_id === "string",
  );
}

