"""ถ่ายรูปใบส่งของ endpoints on the real test database and the real test bucket (6.2 · D36).

Every file here goes through the real app, the real shrink and the real
Storage API of the ai-pharmacy-test project. What is in the bucket is read
from storage.objects, so "nothing was stored" is checked where it would show.

Files uploaded by a test are removed when it ends; the bucket is emptied
before the first test too, in case an earlier run was cut short.
"""

import hashlib
import io
import os
import time

import httpx
import pytest
from dotenv import dotenv_values
from PIL import Image
from pydantic import SecretStr

from app import db
from app.config import get_settings
from app.errors import AppError
from app.scan.storage import BUCKET, Storage
from app.services import invoice_scans as service
from tests.db_guard import ENV_TEST_PATH, TEST_PROJECT_REF, ref_from_supabase_url
from tests.integration.conftest import TEST_CONFIG, api, count_rows, headers

pytestmark = pytest.mark.db

BASE = "/api/v1/invoice-scans"
RED, BLUE, WHITE = (220, 30, 30), (30, 30, 220), (255, 255, 255)


# --- the test bucket ---------------------------------------------------------

def _objects() -> list[dict]:
    with db.get_transaction() as cur:
        cur.execute(
            "SELECT name, (metadata->>'size')::bigint AS size FROM storage.objects"
            " WHERE bucket_id = %s ORDER BY name",
            (BUCKET,),
        )
        return cur.fetchall()


@pytest.fixture
def storage(monkeypatch):
    url = TEST_CONFIG["supabase_url"].rstrip("/")
    # The guard already refused anything but the test project; say so again
    # here, because this fixture is about to delete files.
    assert ref_from_supabase_url(url) == TEST_PROJECT_REF
    key = (dotenv_values(ENV_TEST_PATH).get("TEST_SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    assert key, "TEST_SUPABASE_SERVICE_ROLE_KEY is empty in backend/.env.test"
    test_storage = Storage(base_url=url, key=SecretStr(key))
    monkeypatch.setattr(service, "get_storage", lambda: test_storage)
    test_storage.remove([o["name"] for o in _objects()])
    yield test_storage
    test_storage.remove([o["name"] for o in _objects()])


# --- real image files --------------------------------------------------------

def _jpeg(image: Image.Image, quality=90, exif=None) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=quality, **({"exif": exif} if exif else {}))
    return buffer.getvalue()


def _png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()


def _page_image() -> bytes:
    return _jpeg(Image.new("RGB", (1200, 900), WHITE))


def _noise_jpeg(width, height, quality=95) -> bytes:
    return _jpeg(Image.frombytes("RGB", (width, height), os.urandom(width * height * 3)), quality)


@pytest.fixture(scope="module")
def phone_sized_noise() -> bytes:
    """A genuine 48 MP JPEG of pure noise, about 57 MB."""
    return _noise_jpeg(8064, 6048)


def _upload(client, scan_id, data, content_type="image/jpeg", role="owner"):
    """A page is the request body itself, as the web sends it."""
    return client.post(
        f"{BASE}/{scan_id}/pages",
        content=data,
        headers={**headers(role), "Content-Type": content_type},
    )


def _new_scan(client) -> str:
    response = api(client, "post", BASE)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _rows(scan_id) -> list[dict]:
    with db.get_transaction() as cur:
        cur.execute(
            "SELECT * FROM public.invoice_scan_images WHERE scan_id = %s ORDER BY page_no, kind",
            (scan_id,),
        )
        return cur.fetchall()


# --- who may use it ----------------------------------------------------------

@pytest.mark.parametrize(
    ("method", "path"),
    [("post", ""), ("get", ""), ("get", "/00000000-0000-4000-8000-000000000000"),
     ("post", "/00000000-0000-4000-8000-000000000000/pages"),
     ("delete", "/00000000-0000-4000-8000-000000000000/pages/1")],
)
def test_staff_cannot_use_any_scan_endpoint(client, method, path):
    assert api(client, method, BASE + path, "staff").status_code == 403


def test_pharmacist_can_start_a_scan(client, storage):
    assert api(client, "post", BASE, "pharmacist").status_code == 201


# --- one page, end to end ----------------------------------------------------

def test_a_page_becomes_two_files_and_two_rows(client, storage):
    scan_id = _new_scan(client)
    data = _page_image()
    response = _upload(client, scan_id, data)
    assert response.status_code == 201, response.text
    assert response.json()["page_no"] == 1

    rows = _rows(scan_id)
    assert [r["kind"] for r in rows] == ["for_ai", "original"]
    for row in rows:
        assert row["source_sha256"] == hashlib.sha256(data).hexdigest()
        assert row["source_bytes"] == len(data)
    assert sorted(o["name"] for o in _objects()) == sorted(r["storage_path"] for r in rows)


def test_the_page_is_shown_only_through_a_signed_link(client, storage):
    scan_id = _new_scan(client)
    data = _page_image()
    _upload(client, scan_id, data)

    page = api(client, "get", f"{BASE}/{scan_id}").json()["pages"][0]
    url = page["image_url"]
    assert "/storage/v1/object/sign/" in url and "token=" in url
    fetched = httpx.get(url, timeout=30)
    assert fetched.status_code == 200
    assert fetched.content == data, "the original is the file kept as it came (small upright JPEG)"

    # The same file without the signature, or as if public, is refused.
    path = next(r["storage_path"] for r in _rows(scan_id) if r["kind"] == "original")
    base = TEST_CONFIG["supabase_url"].rstrip("/")
    assert httpx.get(f"{base}/storage/v1/object/{BUCKET}/{path}", timeout=30).status_code >= 400
    assert httpx.get(f"{base}/storage/v1/object/public/{BUCKET}/{path}", timeout=30).status_code >= 400


def test_every_read_makes_a_fresh_link(client, storage):
    scan_id = _new_scan(client)
    _upload(client, scan_id, _page_image())
    first = api(client, "get", f"{BASE}/{scan_id}").json()["pages"][0]["image_url"]
    time.sleep(1.1)  # the token carries its issue time in whole seconds
    second = api(client, "get", f"{BASE}/{scan_id}").json()["pages"][0]["image_url"]
    assert first != second


def test_the_ai_copy_has_no_link_in_any_answer(client, storage):
    scan_id = _new_scan(client)
    _upload(client, scan_id, _noise_jpeg(2400, 1800))
    for_ai_path = next(r["storage_path"] for r in _rows(scan_id) if r["kind"] == "for_ai")
    for body in (api(client, "get", f"{BASE}/{scan_id}").text, api(client, "get", BASE).text):
        assert for_ai_path not in body and "for_ai" not in body


# --- limits: what is stored never exceeds them, whatever arrives -------------

def test_a_huge_real_photo_is_stored_within_every_limit(client, storage, monkeypatch, phone_sized_noise):
    # Let a 57 MB file past the upload gate, to see what the shrink stores.
    monkeypatch.setattr(get_settings(), "max_upload_bytes", 80 * 1024 * 1024)
    scan_id = _new_scan(client)
    response = _upload(client, scan_id, phone_sized_noise)
    assert response.status_code == 201, response.text

    settings = get_settings()
    rows = {r["kind"]: r for r in _rows(scan_id)}
    assert max(rows["original"]["width_px"], rows["original"]["height_px"]) == settings.original_max_edge_px
    assert max(rows["for_ai"]["width_px"], rows["for_ai"]["height_px"]) == settings.ai_image_max_edge_px
    assert rows["original"]["reencoded"] and rows["for_ai"]["reencoded"]
    assert rows["original"]["source_bytes"] == len(phone_sized_noise)
    # The fingerprint is of what the phone sent, not of the smaller copy
    # (on a file stored unchanged the two would be the same and hide this).
    for row in rows.values():
        assert row["source_sha256"] == hashlib.sha256(phone_sized_noise).hexdigest()
        assert row["source_sha256"] != hashlib.sha256(
            httpx.get(storage.signed_url(row["storage_path"], 60), timeout=60).content
        ).hexdigest()

    # Sizes as the bucket itself recorded them.
    sizes = {o["name"]: o["size"] for o in _objects()}
    for row in rows.values():
        assert sizes[row["storage_path"]] == row["bytes"]
        assert sizes[row["storage_path"]] <= settings.stored_max_bytes


def test_an_upload_over_the_gate_is_refused_and_nothing_is_stored(client, storage, phone_sized_noise):
    assert len(phone_sized_noise) > get_settings().max_upload_bytes
    scan_id = _new_scan(client)
    response = _upload(client, scan_id, phone_sized_noise)
    assert response.status_code == 413
    assert "ลองกดถ่ายรูป" in response.json()["error"]["message"]
    assert _rows(scan_id) == [] and _objects() == []


def test_the_gate_holds_when_no_size_is_declared(client, storage, phone_sized_noise):
    """Sent in chunks with no Content-Length: the body is cut off as it is
    read, not trusted from a header."""
    scan_id = _new_scan(client)

    def chunks():
        for start in range(0, len(phone_sized_noise), 1024 * 1024):
            yield phone_sized_noise[start:start + 1024 * 1024]

    response = _upload(client, scan_id, chunks())
    assert response.status_code == 413
    assert _rows(scan_id) == [] and _objects() == []


def test_a_stored_file_cannot_be_overwritten(storage):
    """Evidence is written once. Paths are random, so the app never tries —
    this holds the bucket call itself to refusing if it ever did."""
    path = "overwrite-probe/page.jpg"
    first = _page_image()
    storage.upload(path, first, "image/jpeg")
    with pytest.raises(AppError) as caught:
        storage.upload(path, _jpeg(Image.new("RGB", (50, 50), RED)), "image/jpeg")
    assert caught.value.code == "STORAGE_UNAVAILABLE"
    assert httpx.get(storage.signed_url(path, 60), timeout=30).content == first


# --- what the bytes say, not the label ---------------------------------------

def test_heic_is_refused_with_a_way_out(client, storage):
    scan_id = _new_scan(client)
    heic = b"\0\0\0\x18ftypheic\0\0\0\0" + b"\0" * 256
    # Labelled as JPEG on purpose: the label is not what decides.
    response = _upload(client, scan_id, heic, "image/jpeg")
    assert response.status_code == 415
    assert response.json()["error"]["message"] == (
        "รูปนี้เป็นรูปแบบที่ยังเปิดไม่ได้ ลองกดถ่ายรูปแทนการเลือกจากคลังรูป"
    )
    assert _rows(scan_id) == [] and _objects() == []


def test_pdf_is_refused(client, storage):
    scan_id = _new_scan(client)
    response = _upload(client, scan_id, b"%PDF-1.7\n" + b"\0" * 256, "application/pdf")
    assert response.status_code == 415
    assert "PDF" in response.json()["error"]["message"]
    assert _objects() == []


def test_a_png_labelled_jpeg_is_recorded_as_png(client, storage):
    scan_id = _new_scan(client)
    response = _upload(client, scan_id, _png(Image.new("RGB", (800, 600), WHITE)), "image/jpeg")
    assert response.status_code == 201
    assert {r["source_content_type"] for r in _rows(scan_id)} == {"image/png"}
    assert {r["content_type"] for r in _rows(scan_id)} == {"image/jpeg"}


def test_an_empty_upload_is_refused(client, storage):
    assert _upload(client, _new_scan(client), b"").status_code == 400


# --- a photo the camera stored turned is stored upright ----------------------

def test_an_exif_turned_photo_is_upright_in_the_bucket(client, storage):
    upright = Image.new("RGB", (600, 400), WHITE)
    upright.paste(RED, (0, 0, 600, 80))
    upright.paste(BLUE, (0, 320, 600, 400))
    # How a phone held upright stores it: pixels turned, tag 6 to turn back.
    exif = Image.Exif()
    exif[0x0112] = 6
    data = _jpeg(upright.transpose(Image.Transpose.ROTATE_90), quality=95, exif=exif.tobytes())

    scan_id = _new_scan(client)
    assert _upload(client, scan_id, data).status_code == 201
    url = api(client, "get", f"{BASE}/{scan_id}").json()["pages"][0]["image_url"]
    stored = Image.open(io.BytesIO(httpx.get(url, timeout=30).content))
    assert stored.size == (600, 400)
    top, bottom = stored.getpixel((300, 30)), stored.getpixel((300, 370))
    assert top[0] > 150 and top[2] < 100, "top edge should be red"
    assert bottom[2] > 150 and bottom[0] < 100, "bottom edge should be blue"


# --- pages: numbering, deleting, locking -------------------------------------

def test_pages_number_on_and_a_deleted_page_takes_its_files(client, storage):
    scan_id = _new_scan(client)
    for _ in range(2):
        assert _upload(client, scan_id, _page_image()).status_code == 201
    page_1_paths = {r["storage_path"] for r in _rows(scan_id) if r["page_no"] == 1}

    assert api(client, "delete", f"{BASE}/{scan_id}/pages/1").status_code == 204
    assert {r["page_no"] for r in _rows(scan_id)} == {2}
    assert not page_1_paths & {o["name"] for o in _objects()}

    assert _upload(client, scan_id, _page_image()).json()["page_no"] == 3
    pages = api(client, "get", f"{BASE}/{scan_id}").json()["pages"]
    assert [p["page_no"] for p in pages] == [2, 3]


def test_page_changes_are_audited(client, storage):
    scan_id = _new_scan(client)
    _upload(client, scan_id, _page_image())
    api(client, "delete", f"{BASE}/{scan_id}/pages/1")
    assert count_rows("audit_logs", "WHERE table_name = 'invoice_scan_images' AND action = 'insert'") == 2
    assert count_rows("audit_logs", "WHERE table_name = 'invoice_scan_images' AND action = 'delete'") == 2
    assert count_rows("audit_logs", "WHERE table_name = 'invoice_scans' AND action = 'insert'") == 1


def test_deleting_a_page_that_is_not_there_is_404(client, storage):
    assert api(client, "delete", f"{BASE}/{_new_scan(client)}/pages/7").status_code == 404


def test_a_scan_sent_for_reading_is_locked(client, storage):
    scan_id = _new_scan(client)
    _upload(client, scan_id, _page_image())
    with db.get_transaction() as cur:
        cur.execute("UPDATE public.invoice_scans SET status = 'extracting' WHERE id = %s", (scan_id,))
    before = _objects()
    assert _upload(client, scan_id, _page_image()).status_code == 409
    assert api(client, "delete", f"{BASE}/{scan_id}/pages/1").status_code == 409
    assert _objects() == before


def test_files_do_not_outlive_a_failed_save(client, storage, monkeypatch):
    """If the rows cannot be written after the files went up, the files go."""
    def broken_audit(*args, **kwargs):
        raise RuntimeError("audit write failed")

    scan_id = _new_scan(client)
    monkeypatch.setattr(service, "write_audit", broken_audit)
    with pytest.raises(RuntimeError):
        _upload(client, scan_id, _page_image())
    assert _rows(scan_id) == [] and _objects() == []


def test_an_unknown_scan_is_404(client, storage):
    missing = "00000000-0000-4000-8000-000000000000"
    assert api(client, "get", f"{BASE}/{missing}").status_code == 404
    assert _upload(client, missing, _page_image()).status_code == 404


def test_the_list_counts_pages_not_files(client, storage):
    scan_id = _new_scan(client)
    for _ in range(2):
        _upload(client, scan_id, _page_image())
    listed = api(client, "get", BASE).json()
    assert [(s["id"], s["page_count"]) for s in listed] == [(scan_id, 2)]


# --- 🔴 D68: only the for_ai copy can reach an AI -----------------------------

def test_only_for_ai_copies_are_offered_to_an_ai(client, storage):
    scan_id = _new_scan(client)
    for _ in range(2):
        _upload(client, scan_id, _noise_jpeg(2400, 1800))
    rows = _rows(scan_id)
    for_ai = [r["storage_path"] for r in sorted(rows, key=lambda r: r["page_no"]) if r["kind"] == "for_ai"]
    originals = {r["storage_path"] for r in rows if r["kind"] == "original"}

    offered = service.paths_for_ai(scan_id)
    assert offered == for_ai
    assert not set(offered) & originals
