"""GET /reports/sales-timeseries — the daily line behind the dashboard chart.

Two things are worth proving against a real database rather than a fake
cursor: that a sale is filed under the business date in the store's timezone
(D9) and not the UTC date, and that days with no sales come back as zero
instead of being dropped. A list with holes in it draws a line straight from
the day before a closure to the day after, which reads as trade that never
happened.
"""

from datetime import timedelta
from decimal import Decimal

import pytest

from tests.integration.conftest import api, insert_lot, insert_medicine

pytestmark = pytest.mark.db


def _sell(client, medicine_id, quantity=1):
    response = api(
        client,
        "post",
        "/api/v1/sales",
        "owner",
        json={"items": [{"medicine_id": str(medicine_id), "quantity": quantity}]},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_every_day_in_the_window_comes_back(client, today):
    body = api(client, "get", "/api/v1/reports/sales-timeseries?days=30", "owner")
    assert body.status_code == 200, body.text
    page = body.json()

    assert len(page["days"]) == 30, "a missing day would be drawn straight through"
    assert page["date_to"] == str(today)
    assert page["date_from"] == str(today - timedelta(days=29))

    dates = [day["date"] for day in page["days"]]
    assert dates == sorted(dates), "the line has to run forwards"
    assert len(set(dates)) == 30, "no day may appear twice"


def test_days_without_sales_are_zero_not_absent(client):
    response = api(client, "get", "/api/v1/reports/sales-timeseries?days=7", "owner")
    page = response.json()
    assert len(page["days"]) == 7
    for day in page["days"]:
        assert day["sale_count"] == 0
        assert day["total_amount"] == "0.00"
    assert page["total_amount"] == "0.00"
    assert page["busiest_day"] is None, "no sales means no busiest day, not a guess"


def test_a_sale_lands_on_todays_business_date(client, today):
    medicine_id = insert_medicine("Timeseries Med", selling_price="25.00")
    insert_lot(medicine_id, lot_number="TS-L1", quantity=10, exp_offset_days=90)
    _sell(client, medicine_id, quantity=2)

    page = api(client, "get", "/api/v1/reports/sales-timeseries?days=30", "owner").json()
    by_date = {day["date"]: day for day in page["days"]}

    assert by_date[str(today)]["sale_count"] == 1
    assert Decimal(by_date[str(today)]["total_amount"]) == Decimal("50.00")
    assert page["total_amount"] == "50.00"
    assert page["busiest_day"] == str(today)

    earlier = [day for date_key, day in by_date.items() if date_key != str(today)]
    assert all(day["sale_count"] == 0 for day in earlier), "only today had a sale"


def test_window_totals_add_up_to_the_days(client):
    medicine_id = insert_medicine("Adds Up Med", selling_price="12.50")
    insert_lot(medicine_id, lot_number="TS-L2", quantity=20, exp_offset_days=90)
    _sell(client, medicine_id, quantity=2)
    _sell(client, medicine_id, quantity=1)

    page = api(client, "get", "/api/v1/reports/sales-timeseries?days=30", "owner").json()
    summed = sum(Decimal(day["total_amount"]) for day in page["days"])
    assert summed == Decimal(page["total_amount"]), "the header must match its own days"
    assert Decimal(page["total_amount"]) == Decimal("37.50")


def test_window_size_is_bounded(client):
    for query, expected in (("days=0", 400), ("days=366", 400), ("days=365", 200), ("days=1", 200)):
        response = api(client, "get", f"/api/v1/reports/sales-timeseries?{query}", "owner")
        assert response.status_code == expected, f"{query} -> {response.status_code}"


def test_staff_cannot_read_it(client):
    """Same gate as every other report page (D32/D33), enforced at the endpoint."""
    assert api(client, "get", "/api/v1/reports/sales-timeseries", "staff").status_code == 403
    assert api(client, "get", "/api/v1/reports/sales-timeseries", "pharmacist").status_code == 200
