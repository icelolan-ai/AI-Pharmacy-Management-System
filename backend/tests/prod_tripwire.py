"""D86: no test reaches a production service — any service, not only the database.

The database already had db_guard. The bucket did not, and during 6.3 a test
asked the PROD bucket for a file (read only, nothing came back). The guard is
therefore put where every service call has to pass, not beside each service:

  - every HTTP request made with httpx (Storage, Auth, REST, and whatever
    service on the Supabase project is added later), sync or async;
  - every PostgreSQL connection made with psycopg (pool or direct).

If the address belongs to a production project, the call stops before it is
made, with ProductionTouched. It is a BaseException so that no
`except Exception` in the app can swallow it and carry on.

Production projects are the known PROD ref plus whatever backend/.env points
at, read here without printing anything.
"""

from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

import httpx
import psycopg
from dotenv import dotenv_values

from tests.db_guard import PROD_PROJECT_REF, ref_from_database_url, ref_from_supabase_url

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"


class ProductionTouched(BaseException):
    """A test tried to reach a production service. Nothing was sent."""


def production_refs() -> set[str]:
    refs = {PROD_PROJECT_REF}
    env = dotenv_values(ENV_PATH) if ENV_PATH.exists() else {}
    for found in (ref_from_database_url((env.get("DATABASE_URL") or "").strip()),
                  ref_from_supabase_url((env.get("SUPABASE_URL") or "").strip())):
        if found:
            refs.add(found)
    return refs


def is_production_url(url: str, refs: set[str]) -> bool:
    host = (urlsplit(str(url)).hostname or "").lower()
    return any(host == f"{ref}.supabase.co" or host.endswith(f".{ref}.supabase.co") for ref in refs)


def is_production_conninfo(conninfo: str, refs: set[str]) -> bool:
    return ref_from_database_url(conninfo or "") in refs


@contextmanager
def installed():
    """While active, production addresses are refused before any call."""
    refs = production_refs()
    sync_send, async_send = httpx.Client.send, httpx.AsyncClient.send
    connect = psycopg.Connection.connect.__func__
    module_connect = psycopg.connect

    def guarded_send(self, request, *args, **kwargs):
        if is_production_url(request.url, refs):
            raise ProductionTouched(f"a test tried to reach production: {request.url.host}")
        return sync_send(self, request, *args, **kwargs)

    async def guarded_async_send(self, request, *args, **kwargs):
        if is_production_url(request.url, refs):
            raise ProductionTouched(f"a test tried to reach production: {request.url.host}")
        return await async_send(self, request, *args, **kwargs)

    def guarded_connect(cls, conninfo="", *args, **kwargs):
        if is_production_conninfo(conninfo, refs):
            raise ProductionTouched("a test tried to connect to the production database")
        return connect(cls, conninfo, *args, **kwargs)

    def guarded_module_connect(conninfo="", *args, **kwargs):
        if is_production_conninfo(conninfo, refs):
            raise ProductionTouched("a test tried to connect to the production database")
        return module_connect(conninfo, *args, **kwargs)

    httpx.Client.send = guarded_send
    httpx.AsyncClient.send = guarded_async_send
    psycopg.Connection.connect = classmethod(guarded_connect)
    # psycopg.connect is its own name, bound when psycopg was imported: the
    # class above does not cover it (found the hard way — see D86's test).
    psycopg.connect = guarded_module_connect
    try:
        yield refs
    finally:
        httpx.Client.send, httpx.AsyncClient.send = sync_send, async_send
        psycopg.Connection.connect = classmethod(connect)
        psycopg.connect = module_connect
