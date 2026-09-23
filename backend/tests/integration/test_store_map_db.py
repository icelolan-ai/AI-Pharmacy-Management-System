"""ผังร้าน (U-8.2) against the real database.

Two things are being proved here.

D36: every endpoint with a response model is called for real and every field
the model declares is checked to be present. Unit tests with hand-written rows
cannot see a SELECT that forgot a column.

The permission rule Chat A set for U-8: reading the map is open to every
signed-in role, because a cashier has to find where a medicine sits, while
editing belongs to the owner alone. Nothing here answers with cost or value.
"""

import pytest

from app import db
from app.schemas.store_map import MAX_POINTS, PointOut, ShapeOut, StoreMapOut
from tests.integration.conftest import api, insert_medicine

pytestmark = pytest.mark.db

ROOM = {"name": "ร้านชั้นล่าง", "width_mm": 5377, "height_mm": 5801}

SHAPE = {
    "kind": "shelf",
    "label": "เชลฟ์กลางร้าน 1",
    "x_mm": 500,
    "y_mm": 800,
    "width_mm": 1200,
    "height_mm": 400,
    "height_z_mm": 1500,
    "sort_order": 1,
}

POINT = {"code": "A1", "name": "ชั้นบนซ้าย", "detail": "ยาแก้ปวด", "x_mm": 600, "y_mm": 900}


def make_map(client, **overrides):
    response = api(client, "put", "/api/v1/store-map", "owner", json={**ROOM, **overrides})
    assert response.status_code == 200, response.text
    return response.json()


# --- the map itself -------------------------------------------------------


def test_no_map_yet_is_not_an_error(client):
    """U-8.3 has to say "there is no map" in words rather than draw an empty
    room, so it needs an answer, not a 404."""
    response = api(client, "get", "/api/v1/store-map", "owner")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body == {"map": None, "shapes": [], "points": []}


def test_put_map_returns_every_declared_field(client):
    created = make_map(client)
    for field in StoreMapOut.model_fields:
        assert field in created, f"PUT /api/v1/store-map dropped {field!r}"
    assert created["width_mm"] == 5377
    assert created["updated_by_name"] is not None, "the join to user_profiles must resolve"


def test_put_map_twice_updates_rather_than_duplicates(client):
    first = make_map(client)
    second = make_map(client, name="ร้านชั้นบน", width_mm=6000)
    assert second["id"] == first["id"], "a second save must not create a second map"
    assert second["name"] == "ร้านชั้นบน"
    assert second["width_mm"] == 6000


def test_map_cannot_shrink_below_what_is_already_placed(client):
    make_map(client)
    api(client, "post", "/api/v1/store-map/shapes", "owner", json=SHAPE)
    response = api(
        client, "put", "/api/v1/store-map", "owner",
        json={**ROOM, "width_mm": 1000, "height_mm": 1000},
    )
    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


# --- shapes ---------------------------------------------------------------


def test_shape_returns_every_declared_field(client):
    make_map(client)
    response = api(client, "post", "/api/v1/store-map/shapes", "owner", json=SHAPE)
    assert response.status_code == 201, response.text
    row = response.json()
    for field in ShapeOut.model_fields:
        assert field in row, f"POST /api/v1/store-map/shapes dropped {field!r}"
    assert row["height_z_mm"] == 1500, "2.5D reads this column; it must survive the round trip"


def test_shape_outside_the_room_is_refused(client):
    make_map(client)
    response = api(
        client, "post", "/api/v1/store-map/shapes", "owner",
        json={**SHAPE, "x_mm": 5000, "width_mm": 1000},
    )
    assert response.status_code == 400, response.text


def test_shape_can_be_moved_and_removed(client):
    make_map(client)
    shape_id = api(client, "post", "/api/v1/store-map/shapes", "owner", json=SHAPE).json()["id"]

    moved = api(
        client, "patch", f"/api/v1/store-map/shapes/{shape_id}", "owner", json={"x_mm": 700}
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["x_mm"] == 700

    nothing = api(client, "patch", f"/api/v1/store-map/shapes/{shape_id}", "owner", json={})
    assert nothing.status_code == 400

    removed = api(client, "delete", f"/api/v1/store-map/shapes/{shape_id}", "owner")
    assert removed.status_code == 204
    assert api(client, "get", "/api/v1/store-map", "owner").json()["shapes"] == []


def test_unknown_field_is_refused(client):
    make_map(client)
    response = api(
        client, "post", "/api/v1/store-map/shapes", "owner", json={**SHAPE, "colour": "red"}
    )
    assert response.status_code == 400, response.text


# --- points ---------------------------------------------------------------


def test_point_returns_every_declared_field(client):
    make_map(client)
    response = api(client, "post", "/api/v1/store-map/points", "owner", json=POINT)
    assert response.status_code == 201, response.text
    row = response.json()
    for field in PointOut.model_fields:
        assert field in row, f"POST /api/v1/store-map/points dropped {field!r}"
    assert row["medicine_count"] == 0, "a new mark holds nothing yet"


def test_point_code_is_unique_per_map_whatever_the_case(client):
    make_map(client)
    api(client, "post", "/api/v1/store-map/points", "owner", json=POINT)
    clash = api(
        client, "post", "/api/v1/store-map/points", "owner", json={**POINT, "code": "a1"}
    )
    assert clash.status_code == 409, clash.text
    assert clash.json()["error"]["code"] == "CONFLICT"


def test_point_outside_the_room_is_refused(client):
    make_map(client)
    response = api(
        client, "post", "/api/v1/store-map/points", "owner", json={**POINT, "x_mm": 99_000}
    )
    assert response.status_code == 400, response.text


def test_point_can_be_renamed_moved_and_removed(client):
    make_map(client)
    point_id = api(client, "post", "/api/v1/store-map/points", "owner", json=POINT).json()["id"]

    changed = api(
        client, "patch", f"/api/v1/store-map/points/{point_id}", "owner",
        json={"name": "ชั้นบนขวา", "x_mm": 1200},
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["name"] == "ชั้นบนขวา"
    assert changed.json()["x_mm"] == 1200

    removed = api(client, "delete", f"/api/v1/store-map/points/{point_id}", "owner")
    assert removed.status_code == 204
    assert api(client, "get", "/api/v1/store-map", "owner").json()["points"] == []


def test_medicine_count_is_counted_by_the_database(client):
    """The browser plots; it does not total (the rule for every chart and now
    for the map). Two medicines are linked directly, and the endpoint has to
    report two without the browser ever seeing the link rows."""
    map_row = make_map(client)
    point_id = api(client, "post", "/api/v1/store-map/points", "owner", json=POINT).json()["id"]
    first = insert_medicine("Map Med 1")
    second = insert_medicine("Map Med 2", barcode="MAP-2")
    with db.get_transaction() as cur:
        cur.execute(
            "INSERT INTO public.store_map_point_medicines (point_id, medicine_id)"
            " VALUES (%s, %s), (%s, %s)",
            (point_id, first, point_id, second),
        )

    points = api(client, "get", "/api/v1/store-map", "owner").json()["points"]
    assert len(points) == 1
    assert points[0]["medicine_count"] == 2
    assert points[0]["map_id"] == map_row["id"]


def test_deleting_a_point_takes_its_medicine_links_with_it(client):
    make_map(client)
    point_id = api(client, "post", "/api/v1/store-map/points", "owner", json=POINT).json()["id"]
    medicine_id = insert_medicine("Cascade Med")
    with db.get_transaction() as cur:
        cur.execute(
            "INSERT INTO public.store_map_point_medicines (point_id, medicine_id) VALUES (%s, %s)",
            (point_id, medicine_id),
        )

    assert api(client, "delete", f"/api/v1/store-map/points/{point_id}", "owner").status_code == 204

    with db.get_transaction() as cur:
        cur.execute("SELECT count(*) AS n FROM public.store_map_point_medicines")
        assert cur.fetchone()["n"] == 0
        cur.execute("SELECT count(*) AS n FROM public.medicines WHERE id = %s", (medicine_id,))
        assert cur.fetchone()["n"] == 1, "removing a mark must never remove the medicine"


def test_the_thousandth_point_is_the_last_one(client):
    """The cap lives in the service, not in a constraint that would count the
    rows on every insert. It still has to hold."""
    map_row = make_map(client)
    with db.get_transaction() as cur:
        cur.execute(
            "INSERT INTO public.store_map_points (map_id, code, name, x_mm, y_mm)"
            " SELECT %s, 'P' || g, 'จุดที่ ' || g, 10, 10"
            " FROM generate_series(1, %s) AS g",
            (map_row["id"], MAX_POINTS - 1),
        )

    last = api(client, "post", "/api/v1/store-map/points", "owner", json=POINT)
    assert last.status_code == 201, last.text

    over = api(
        client, "post", "/api/v1/store-map/points", "owner", json={**POINT, "code": "OVER"}
    )
    assert over.status_code == 400, over.text
    assert str(MAX_POINTS) in over.json()["error"]["message"]


# --- who may do what ------------------------------------------------------


@pytest.mark.parametrize("role", ["owner", "pharmacist", "staff"])
def test_every_role_may_read_the_map(client, role):
    """A cashier has to find where a medicine sits."""
    make_map(client)
    response = api(client, "get", "/api/v1/store-map", role)
    assert response.status_code == 200, f"{role}: {response.text}"
    assert response.json()["map"]["name"] == ROOM["name"]


@pytest.mark.parametrize("role", ["pharmacist", "staff"])
def test_only_the_owner_may_change_the_map(client, role):
    make_map(client)
    shape_id = api(client, "post", "/api/v1/store-map/shapes", "owner", json=SHAPE).json()["id"]
    point_id = api(client, "post", "/api/v1/store-map/points", "owner", json=POINT).json()["id"]

    attempts = [
        ("put", "/api/v1/store-map", {**ROOM, "name": "แอบเปลี่ยน"}),
        ("post", "/api/v1/store-map/shapes", {**SHAPE, "label": "แอบเพิ่ม"}),
        ("patch", f"/api/v1/store-map/shapes/{shape_id}", {"x_mm": 10}),
        ("delete", f"/api/v1/store-map/shapes/{shape_id}", None),
        ("post", "/api/v1/store-map/points", {**POINT, "code": "X9"}),
        ("patch", f"/api/v1/store-map/points/{point_id}", {"name": "แอบเปลี่ยน"}),
        ("delete", f"/api/v1/store-map/points/{point_id}", None),
    ]
    for method, path, body in attempts:
        kwargs = {"json": body} if body is not None else {}
        response = api(client, method, path, role, **kwargs)
        assert response.status_code == 403, f"{role} {method} {path} -> {response.status_code}"

    # And nothing moved.
    after = api(client, "get", "/api/v1/store-map", "owner").json()
    assert after["map"]["name"] == ROOM["name"]
    assert len(after["shapes"]) == 1 and len(after["points"]) == 1


def test_signed_out_callers_get_nothing(client):
    make_map(client)
    assert client.get("/api/v1/store-map").status_code == 401
    assert client.put("/api/v1/store-map", json=ROOM).status_code == 401


def test_the_map_never_answers_with_cost_or_value(client):
    """D32/D33: the map says where things are. What they are worth stays
    behind the endpoints that already guard it."""
    make_map(client)
    api(client, "post", "/api/v1/store-map/points", "owner", json=POINT)
    api(client, "post", "/api/v1/store-map/shapes", "owner", json=SHAPE)

    body = api(client, "get", "/api/v1/store-map", "staff").text
    for word in ("cost", "price", "value", "total_amount", "unit_cost", "selling_price"):
        assert word not in body, f"the map answered with {word!r}"
