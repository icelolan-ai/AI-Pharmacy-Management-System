"""🔴 The AI cannot write stock, lots or purchases — layers 1, 3 and 4 (Chat A, 6.3).

Layer 2 (a reading on the real test database leaves every stock table as it
was) is tests/integration/test_invoice_extraction_db.py.

Layer 1, code: every module on the reading path is read as Python (AST, not
text matching, D43-b). Its imports must not reach code that writes stock,
and the only SQL that changes anything is UPDATE public.invoice_scans.
Layer 3, process: the scan endpoints reach no purchase code; a reading
becomes stock only through the purchase endpoints, with a person's rights.
Layer 4, answer: no tools are offered to the AI and its answer is capped
(the request itself is checked in test_ai_provider.py).
"""

import ast
import re
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parents[1] / "app"
READING_PATH = [
    "services/invoice_extraction.py",
    "scan/invoice_answer.py",
    "scan/invoice_reading.py",
    "scan/invoice_prompt.py",
    "ai/__init__.py",
    "ai/base.py",
    "ai/gemini.py",
    "ai/read_invoices.py",
]
# Real table names, from backend/migrations.
STOCK_TABLES = ("purchases", "purchase_items", "medicine_lots", "inventory_transactions",
                "sales", "sale_items", "medicines", "suppliers")
WRITES = re.compile(r"\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|COPY|MERGE|UPSERT)\b", re.I)


def tree(relative: str) -> ast.Module:
    return ast.parse((APP / relative).read_text(encoding="utf8"))


def imports(module: ast.Module) -> set[str]:
    found = set()
    for node in ast.walk(module):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            found.add(node.module)
            found.update(f"{node.module}.{alias.name}" for alias in node.names)
    return found


def code_strings(module: ast.Module) -> list[str]:
    """Every string in the code, docstrings left out (they describe, they do not run)."""
    docstrings = set()
    for node in ast.walk(module):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.body:
            first = node.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
                docstrings.add(id(first.value))
    return [node.value for node in ast.walk(module)
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings]


def sql_writes(module: ast.Module) -> list[str]:
    """Strings that read as SQL changing something, joined where the code joins them."""
    joined = []
    for node in ast.walk(module):
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
            parts = [n.value for n in ast.walk(node) if isinstance(n, ast.Constant) and isinstance(n.value, str)]
            joined.append(" ".join(parts))
    # "SELECT ... FOR UPDATE" locks a row; it writes nothing.
    texts = [re.sub(r"\bFOR\s+UPDATE\b", "", text, flags=re.I) for text in code_strings(module) + joined]
    return [text for text in texts if WRITES.search(text) and re.search(r"\b(public\.|SET|INTO|FROM)\b", text)]


@pytest.mark.parametrize("relative", READING_PATH)
def test_the_reading_path_imports_nothing_that_writes_stock(relative):
    reached = imports(tree(relative))
    for name in reached:
        assert not name.startswith(("app.services.purchases", "app.services.lots", "app.services.sales",
                                    "app.services.medicines", "app.services.suppliers", "app.services.fefo",
                                    "app.routers")), f"{relative} imports {name}"


@pytest.mark.parametrize("relative", READING_PATH)
def test_the_reading_path_names_no_stock_table_in_its_code(relative):
    for text in code_strings(tree(relative)):
        for table in STOCK_TABLES:
            assert not re.search(rf"\b(public\.)?{table}\b", text), f"{relative} names {table}: {text[:80]!r}"


@pytest.mark.parametrize("relative", READING_PATH)
def test_the_only_sql_that_changes_anything_is_update_invoice_scans(relative):
    for text in sql_writes(tree(relative)):
        verbs = {verb.upper() for verb in WRITES.findall(text)}
        targets = re.findall(r"\bUPDATE\s+(\S+)", text, re.I)
        # Every UPDATE, not just one of them, and one statement per string.
        assert verbs == {"UPDATE"} and targets and set(targets) == {"public.invoice_scans"} and ";" not in text, (
            f"{relative} writes something else: {text[:120]!r}")


def test_the_scan_endpoints_reach_no_purchase_code():
    """Layer 3: from a photo to stock is a person's step, through the
    purchase endpoints with their own rights — never through a scan route."""
    for relative in ("routers/invoice_scans.py", "services/invoice_scans.py"):
        for name in imports(tree(relative)):
            assert "purchases" not in name and "lots" not in name, f"{relative} imports {name}"


def test_the_reading_offers_the_ai_no_tools():
    """Layer 4: the request carries no tools for the model to call."""
    for text in code_strings(tree("ai/gemini.py")):
        assert text not in ("tools", "functionDeclarations", "toolConfig"), text
