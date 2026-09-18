import { groupSaleItems, type Sale } from "@/lib/api/sales";
import type { StoreProfile } from "@/lib/api/store";
import { formatDateTimeBE, formatExpiryBE } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";

/** A5 portrait receipt (Q1 · Q2 · Q4).
 *
 *  Wording is fixed: this is a "ใบเสร็จรับเงิน" and nothing else. The tax-document
 *  wording Q2 forbids must not appear anywhere on the page. It never shows what
 *  the shop paid, and has no cash-received or change box.
 *  An unset shop profile prints no header at all rather than a made-up one.
 */
export function SaleReceipt({
  sale,
  store,
  copy,
  copyDateText,
}: {
  sale: Sale;
  store: StoreProfile | null;
  copy: boolean;
  copyDateText: string;
}) {
  const lines = groupSaleItems(sale.items);
  const totalUnits = lines.reduce((total, line) => total + line.quantity, 0);
  const hasHeader = Boolean(store?.name?.trim());

  return (
    <div className="receipt">
      {hasHeader ? (
        <header className="head">
          <p className="shop-name">{store?.name}</p>
          {store?.address ? <p className="shop-line">{store.address}</p> : null}
          {store?.phone ? <p className="shop-line">โทร. {store.phone}</p> : null}
          {store?.license_no ? (
            <p className="shop-small">เลขที่ใบอนุญาต {store.license_no}</p>
          ) : null}
          {store?.tax_id ? <p className="shop-small">เลขประจำตัวผู้เสียภาษี {store.tax_id}</p> : null}
        </header>
      ) : null}

      <h1 className="title">ใบเสร็จรับเงิน</h1>
      {copy ? <p className="copy">( สำเนา — พิมพ์ซ้ำ {copyDateText} )</p> : null}

      <dl className="meta">
        <div>
          <dt>เลขที่บิล</dt>
          <dd className="sale-no">{sale.sale_no}</dd>
        </div>
        <div>
          <dt>วันเวลา</dt>
          <dd>{formatDateTimeBE(sale.sale_date)} น.</dd>
        </div>
        {/* D27: no seller on record means no line at all — never a dash,
            never "ไม่ระบุ", and never whoever happens to be printing. */}
        {sale.sold_by_name ? (
          <div>
            <dt>ผู้ขาย</dt>
            <dd>{sale.sold_by_name}</dd>
          </div>
        ) : null}
      </dl>

      <table className="items">
        <thead>
          <tr>
            <th className="left">รายการ</th>
            <th className="right">จำนวน</th>
            <th className="right">รวม</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={`${line.medicine_id}-${line.unit_price}`}>
              <td className="left">
                <span className="medicine">{line.medicine_name ?? "-"}</span>
                {line.lots.map((lot) => (
                  <span key={lot.lot_id} className="lot">
                    Lot {lot.lot_number} · EXP {formatExpiryBE(lot.expiry_date)}
                  </span>
                ))}
              </td>
              <td className="right nowrap">
                {line.quantity} × {formatMoney(line.unit_price)}
              </td>
              <td className="right nowrap">{formatMoney(line.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="count">รวม {lines.length} รายการ ({totalUnits} ชิ้น)</p>
      <p className="total">
        <span>รวมทั้งสิ้น</span>
        <span>{formatMoney(sale.total_amount)} บาท</span>
      </p>

      <footer className="foot">
        <p>ขอบคุณที่ใช้บริการ</p>
        <p>กรุณาเก็บใบเสร็จไว้เป็นหลักฐาน</p>
        <p>ยาที่ซื้อแล้วไม่รับคืนหรือเปลี่ยน ยกเว้นกรณีสินค้าชำรุดหรือผิดรายการ</p>
        <p className="sign">ลงชื่อผู้รับเงิน ..............................................</p>
      </footer>
    </div>
  );
}
