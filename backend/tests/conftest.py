"""Test settings: set before app modules import, so tests never use real secrets.

Process environment overrides backend/.env in pydantic-settings.
The dummy DATABASE_URL points at a closed port; unit tests must not touch a
real database (TestClient is used without the lifespan context).
"""

import os

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "postgresql://test:test@127.0.0.1:1/test"
os.environ["SUPABASE_URL"] = "https://test-project.supabase.co"
os.environ["CORS_ORIGINS"] = "http://localhost:3000"
