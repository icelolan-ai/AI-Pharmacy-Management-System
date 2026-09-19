import type { Purchase } from "@/lib/api/purchases";
import { hasMismatch, itemDifference, itemHasMismatch } from "@/lib/api/purchases";
import type { StoreProfile } from "@/lib/api/store";
import { formatDateTimeBE, formatExpiryBE } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";

/** A4 goods-received note.
 *
 *  Dated from confirmed_at (D30): a draft opened on Monday and counted on
 *  Wednesday is a Wednesday receipt. It never prints the shop's tax number
 *  (D31), never invents a shop header, and carries no page numbering.
 *  A receipt with a count mismatch shows the difference ON THE PAPER, not
 *  only on screen, so the person signing it can see what was short.
 */
export function PurchaseNote({
  purchase,
  store,
}: {
  purchase: Purchase;
  store: StoreProfile | null;
}) {
  const hasHeader = Boolean(store?.name?.trim());
  const mismatched = purchase.items.filter(itemHasMismatch);

  return (
    <div className="note">
      {hasHeader ? (
        <header className="head">
          <p className="shop-name">{store?.name}</p>
          {store?.address ? <p className="shop-line">{store.address}</p> : null}
          {store?.phone ? <p className="shop-line">โทร. {store.phone}</p> : null}
          {store?.owner_name ? <p className="shop-small">โดย {store.owner_name}</p> : null}
          {store?.license_no ? (
            <p className="shop-small">เลขที่ใบอนุญาต {store.license_no}</p>
          ) : null}
          {/* D31: the shop's tax number is stored but never printed. */}
        </header>
      ) : null}

      <h1 className="title">ใบรับสินค้า</h1>
      {hasMismatch(purchase) ? (
        <p className="flag">( จำนวนไม่ตรงกับใบส่งของ )</p>
      ) : null}

      <dl className="meta">
        <div>
          <dt>เลขที่ใบรับ</dt>
          <dd className="doc-no">{purchase.purchase_no ?? "—"}</dd>
        </div>
        <div>
          <dt>เลขที่ใบส่งของ</dt>
          <dd>{purchase.invoice_no ?? "—"}</dd>
        </div>
        <div>
          <dt>ผู้จำหน่าย</dt>
          <dd>{purchase.supplier_name ?? "—"}</dd>
        </div>
        <div>
          <dt>วันที่รับเข้า</dt>
          <dd>{purchase.confirmed_at ? `${formatDateTimeBE(purchase.confirmed_at)} น.` : "—"}</dd>
        </div>
        {/* D30: no receiver on record means no line at all. */}
        {purchase.created_by_name ? (
          <div>
            <dt>ผู้รับของ</dt>
            <dd>{purchase.created_by_name}</dd>
          </div>
        ) : null}
      </dl>

      <table className="items">
        <thead>
          <tr>
            <th className="left">รายการ</th>
            <th className="right">ตามใบส่งของ</th>
            <th className="right">รับจริง</th>
            <th className="right">ต้นทุน/หน่วย</th>
            <th className="right">รวม</th>
          </tr>
        </thead>
        <tbody>
          {purchase.items.map((item) => {
            const difference = itemDifference(item);
            return (
              <tr key={item.id}>
                <td className="left">
                  <span className="medicine">{item.medicine_name ?? "-"}</span>
                  <span className="lot">
                    Lot {item.lot_number} · EXP {formatExpiryBE(item.expiry_date)}
                  </span>
                </td>
                <td className="right nowrap">{item.quantity_invoiced}</td>
                <td className="right nowrap">
                  {item.quantity_actual ?? item.quantity_invoiced}
                  {difference !== 0 ? (
                    <span className="diff">
                      {difference < 0 ? " ขาด " : " เกิน "}
                      {Math.abs(difference)}
                    </span>
                  ) : null}
                </td>
                <td className="right nowrap">{formatMoney(item.unit_cost)}</td>
                <td className="right nowrap">{formatMoney(item.subtotal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="count">รวม {purchase.items.length} รายการ</p>
      <p className="total">
        <span>รวมทั้งสิ้น</span>
        <span>{formatMoney(purchase.total_amount)} บาท</span>
      </p>

      {mismatched.length > 0 ? (
        <section className="mismatch">
          <p className="mismatch-title">รายการที่จำนวนไม่ตรงกับใบส่งของ</p>
          {mismatched.map((item) => {
            const difference = itemDifference(item);
            return (
              <p key={`m-${item.id}`} className="mismatch-line">
                {item.medicine_name} (Lot {item.lot_number}) — ใบส่งของ {item.quantity_invoiced} ·
                รับจริง {item.quantity_actual} · {difference < 0 ? "ขาด" : "เกิน"}{" "}
                {Math.abs(difference)}
              </p>
            );
          })}
        </section>
      ) : null}

      <footer className="foot">
        <div className="signs">
          <p>ลงชื่อผู้รับของ ................................</p>
          <p>ลงชื่อผู้ส่งของ ................................</p>
        </div>
      </footer>
    </div>
  );
}
