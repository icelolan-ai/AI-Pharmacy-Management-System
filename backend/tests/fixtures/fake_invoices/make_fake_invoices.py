"""Make the FAKE invoices used to build and check 6.3 (Chat A: printed and
handwritten, D65). Every name and number on them is plainly made up.

    python tests/fixtures/fake_invoices/make_fake_invoices.py

What each one carries, on purpose:
  A (printed tax invoice, 2 pages): free goods twice (D59), a repeat mark
    (D63), MFG/EXP dates that are ambiguous but can be settled from an
    unambiguous line (D64), the header year in พ.ศ. and the line years in
    ค.ศ. 2 digits, the totals only on page 2, the D61 structure (prices with
    VAT; "ยอดเงินหลังหักส่วนลด" is the base before VAT), and a fake bank
    account the prompt says never to copy.
  B (handwritten delivery note, 1 page): no LOT/EXP on the paper at all
    (D62), a repeat mark, one free line, one total and nothing else.

The pages are drawn as HTML and photographed by headless Microsoft Edge
(already on the machine): Pillow here cannot lay out Thai (no raqm), and
stacked Thai marks drawn wrong would test the drawing, not the reading.
Fonts come from Google Fonts (Sarabun; Sriracha for the handwriting). Then
Pillow makes each page look photographed: a slight turn, a desk around it,
JPEG. `truth.json` is written from the same data as the pictures.
"""

import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
EDGE = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
W, H = 1240, 1754  # A4 at 150 dpi

FAKE_A = {
    "file": "fake-a",
    "doc_kind": "tax_invoice",
    "supplier_name": "บริษัท ปลอมเพื่อทดสอบ ฟาร์มา จำกัด (FAKE)",
    "supplier_tax_id": "0000000000000",
    "invoice_no": "FAKE-0001",
    "doc_date": "04/09/2569",
    "pages": [
        [
            {"name": "พาราเซตามอล 500 มก. 10x10", "qty": "10", "unit": "กล่อง", "price": "35.00",
             "amount": "350.00", "lot": "FK2401", "mfg": "15.01.24", "exp": "14.01.27", "remark": ""},
            {"name": "พาราเซตามอล 500 มก. 10x10", "qty": "2", "unit": "กล่อง", "price": "", "amount": "",
             "lot": "FK2401", "mfg": "15.01.24", "exp": "14.01.27", "remark": "แถม"},
            {"name": "ยาแก้ไอน้ำดำ 60cc", "qty": "12", "unit": "ขวด", "price": "18.00", "amount": "216.00",
             "lot": "FK2402", "mfg": "05.06.25", "exp": "05.06.28", "remark": ""},
            {"name": "------ 180cc", "qty": "6", "unit": "ขวด", "price": "45.00", "amount": "270.00",
             "lot": "FK2403", "mfg": "10.03.25", "exp": "10.03.28", "remark": ""},
        ],
        [
            {"name": "ผงเกลือแร่ ORS รสส้ม", "qty": "50", "unit": "ซอง", "price": "4.00", "amount": "200.00",
             "lot": "FK2404", "mfg": "20.02.25", "exp": "19.02.27", "remark": ""},
            {"name": "ผงเกลือแร่ ORS รสส้ม", "qty": "10", "unit": "ซอง", "price": "", "amount": "",
             "lot": "FK2404", "mfg": "20.02.25", "exp": "19.02.27", "remark": "แถมพิเศษ"},
        ],
    ],
    "totals": [
        ("รวมเงิน", "1,036.00"),
        ("ส่วนลด", "36.00"),
        ("ยอดเงินหลังหักส่วนลด", "934.58"),
        ("ภาษีมูลค่าเพิ่ม 7%", "65.42"),
        ("จำนวนเงินรวมทั้งสิ้น", "1,000.00"),
    ],
}

FAKE_B = {
    "file": "fake-b",
    "doc_kind": "handwritten",
    "supplier_name": "ร้านส่งยาปลอม (ตัวอย่าง)",
    "supplier_tax_id": None,
    "invoice_no": "0042",
    "doc_date": "12/09/2569",
    "pages": [
        [
            {"name": "แอมม็อกซี่ 500", "qty": "5", "unit": "กล่อง", "price": "120", "amount": "600", "remark": ""},
            {"name": "------ 250", "qty": "3", "unit": "กล่อง", "price": "80", "amount": "240", "remark": ""},
            {"name": "ยาธาตุน้ำแดง", "qty": "6", "unit": "ขวด", "price": "", "amount": "", "remark": "แถม"},
        ],
    ],
    "totals": [("รวม", "840")],
}

PRINTED_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=block');
body { margin:0; width:%dpx; height:%dpx; background:#fff; font-family:'Sarabun'; color:#111; }
.page { padding:70px 80px; box-sizing:border-box; height:100%%; position:relative; }
h1 { font-size:34px; margin:0 0 6px; } .sub { font-size:20px; margin:2px 0; }
.box { border:2px solid #222; padding:14px 18px; margin:18px 0; font-size:20px; display:flex; justify-content:space-between; }
table { width:100%%; border-collapse:collapse; font-size:19px; }
th, td { border:1px solid #333; padding:8px 6px; } th { background:#eee; }
td.n { text-align:right; } .tot { width:52%%; margin-left:auto; margin-top:22px; }
.tot td { font-size:20px; } .pg { position:absolute; right:80px; top:40px; font-size:19px; }
.foot { position:absolute; bottom:60px; left:80px; right:80px; font-size:17px; color:#333; }
""" % (W, H)

HAND_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Sriracha&family=Sarabun:wght@400;700&display=block');
body { margin:0; width:%dpx; height:%dpx; background:#fbf8ef; font-family:'Sarabun'; color:#222; }
.page { padding:70px 80px; box-sizing:border-box; height:100%%;
        background-image:repeating-linear-gradient(#fbf8ef 0 63px, #b9c7dd 63px 65px); }
h1 { font-size:36px; margin:0 0 4px; text-align:center; }
.printed { font-size:21px; }
.hand { font-family:'Sriracha'; color:#1f3a93; font-size:34px; }
.row { display:flex; gap:24px; height:65px; align-items:flex-end; }
.c1 { width:52%%; } .c2 { width:14%%; } .c3 { width:14%%; } .c4 { width:16%%; text-align:right; }
.hdr { font-size:21px; border-bottom:2px solid #555; height:50px; }
""" % (W, H)


def _printed_page(inv, page_index):
    lines = inv["pages"][page_index]
    first_no = sum(len(p) for p in inv["pages"][:page_index]) + 1
    rows = "".join(
        f"<tr><td>{first_no + i}</td><td>{ln['name']}</td><td class=n>{ln['qty']}</td><td>{ln['unit']}</td>"
        f"<td class=n>{ln['price']}</td><td class=n>{ln['amount']}</td><td>{ln['lot']}</td>"
        f"<td>{ln['mfg']}</td><td>{ln['exp']}</td><td>{ln['remark']}</td></tr>"
        for i, ln in enumerate(lines)
    )
    last = page_index == len(inv["pages"]) - 1
    totals = ""
    if last:
        totals = "<table class=tot>" + "".join(
            f"<tr><td>{label}</td><td class=n>{amount}</td></tr>" for label, amount in inv["totals"]
        ) + "</table>"
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{PRINTED_CSS}</style></head><body>
<div class=page>
<div class=pg>หน้า {page_index + 1}/{len(inv['pages'])}</div>
<h1>ใบกำกับภาษี / ใบส่งของ</h1>
<div class=sub>{inv['supplier_name']}</div>
<div class=sub>เลขประจำตัวผู้เสียภาษี {inv['supplier_tax_id']} · ที่อยู่ 1 ถนนสมมติ แขวงทดสอบ (ปลอม)</div>
<div class=box><span>ลูกค้า: ร้านยาทดสอบ (ปลอม) · 999 ซอยตัวอย่าง</span>
<span>เลขที่ {inv['invoice_no']} · วันที่ {inv['doc_date']}</span></div>
<table><tr><th>ที่</th><th>รายการ</th><th>จำนวน</th><th>หน่วย</th><th>ราคา/หน่วย</th><th>จำนวนเงิน</th>
<th>LOT</th><th>MFG</th><th>EXP</th><th>หมายเหตุ</th></tr>{rows}</table>
{totals}
<div class=foot>โอนเงินเข้าบัญชี ธนาคารสมมติ เลขที่ 000-0-00000-0 (บัญชีปลอม ห้ามใช้)</div>
</div></body></html>"""


def _hand_page(inv):
    rows = "".join(
        f"<div class=row><span class='c1 hand'>{ln['name']}</span><span class='c2 hand'>{ln['qty']} {ln['unit']}</span>"
        f"<span class='c3 hand'>{ln['price'] or ln['remark']}</span><span class='c4 hand'>{ln['amount']}</span></div>"
        for ln in inv["pages"][0]
    )
    label, amount = inv["totals"][0]
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{HAND_CSS}</style></head><body>
<div class=page>
<h1>ใบส่งของชั่วคราว</h1>
<div class=row><span class=printed>จาก</span><span class=hand>{inv['supplier_name']}</span></div>
<div class=row><span class=printed>เลขที่</span><span class=hand>{inv['invoice_no']}</span>
<span class=printed>วันที่</span><span class=hand>{inv['doc_date']}</span></div>
<div class='row hdr'><span class='c1 printed'>รายการ</span><span class='c2 printed'>จำนวน</span>
<span class='c3 printed'>ราคา</span><span class='c4 printed'>เป็นเงิน</span></div>
{rows}
<div class=row><span class=c1></span><span class=c2></span><span class='c3 hand'>{label}</span>
<span class='c4 hand'>{amount}</span></div>
<div class=row><span class=printed>ผู้รับของ ................................</span></div>
</div></body></html>"""


def _shoot(html: str, out_png: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "page.html"
        page.write_text(html, encoding="utf8")
        # Its own profile: a headless Edge sharing the desktop Edge's profile
        # exits without drawing anything.
        result = subprocess.run(
            [str(EDGE), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
             f"--user-data-dir={Path(tmp) / 'profile'}", f"--window-size={W},{H}",
             "--virtual-time-budget=8000", f"--screenshot={out_png}", page.as_uri()],
            capture_output=True, text=True, timeout=120,
        )
        # msedge.exe hands the work to another process and returns at once;
        # the picture lands a moment later.
        for _ in range(60):
            if out_png.exists() and out_png.stat().st_size > 0:
                time.sleep(0.5)
                break
            time.sleep(0.5)
        if not out_png.exists():
            raise RuntimeError(f"Edge drew nothing (exit {result.returncode}): {result.stderr[-400:]}")


def _as_photo(png: Path, jpg: Path, turn: float) -> None:
    """A slight turn on a desk, a little soft, JPEG — like a phone photo."""
    paper = Image.open(png).convert("RGB")
    desk = Image.new("RGB", (W + 160, H + 160), (96, 84, 72))
    desk.paste(paper, (80, 80))
    photo = desk.rotate(turn, resample=Image.BICUBIC, fillcolor=(96, 84, 72))
    photo.filter(ImageFilter.GaussianBlur(0.6)).save(jpg, "JPEG", quality=85)
    png.unlink()


def _truth(inv) -> dict:
    lines = []
    for page_no, page in enumerate(inv["pages"], start=1):
        for ln in page:
            ln = dict(ln)
            if inv["doc_kind"] == "handwritten":
                # The handwritten note has one column for both: "5 กล่อง".
                # The truth is what the paper says, not what we meant.
                ln["qty"], ln["unit"] = f"{ln['qty']} {ln['unit']}", None
                # Its price column holds "แถม" on the free line, not a remark.
                if not ln["price"] and ln["remark"]:
                    ln["price"], ln["remark"] = None, ln["remark"]
            lines.append({"page_no": page_no, "line_no": len(lines) + 1, **ln})
    return {"doc_kind": inv["doc_kind"], "supplier_name": inv["supplier_name"],
            "supplier_tax_id": inv["supplier_tax_id"], "invoice_no": inv["invoice_no"],
            "doc_date": inv["doc_date"], "page_count": len(inv["pages"]), "lines": lines,
            "totals_page": len(inv["pages"]), "totals": [list(t) for t in inv["totals"]]}


def main() -> int:
    if not EDGE.exists():
        print("Microsoft Edge not found at", EDGE)
        return 1
    truth = {}
    for inv in (FAKE_A, FAKE_B):
        for index in range(len(inv["pages"])):
            png = HERE / f"{inv['file']}-p{index + 1}.png"
            html = _printed_page(inv, index) if inv["doc_kind"] == "tax_invoice" else _hand_page(inv)
            _shoot(html, png)
            _as_photo(png, HERE / f"{inv['file']}-p{index + 1}.jpg", turn=1.5 if index == 0 else -1.0)
        truth[inv["file"]] = _truth(inv)
    (HERE / "truth.json").write_text(json.dumps(truth, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print("made:", ", ".join(sorted(p.name for p in HERE.glob("fake-*.jpg"))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
