"""No real invoice can be committed (6.3 · docs/06-ai-design.md 4 · Chat A).

One rule, used two ways:
  - tests/test_private_files.py checks everything git tracks or has staged;
  - the pre-commit hook on the owner's machine runs this file and refuses a
    commit that stages a picture or PDF not in fixtures/ALLOWED_IMAGES.txt.

The rule is about every picture anywhere in the repository, not about one
folder: a real invoice saved by mistake into tests/ or docs/ is caught too.

    python backend/tests/private_files.py      (what the hook runs)
"""

import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ALLOWED_FILE = REPO / "backend" / "tests" / "fixtures" / "ALLOWED_IMAGES.txt"
PICTURE = re.compile(r"\.(jpe?g|png|gif|webp|heic|heif|tiff?|bmp|pdf)$", re.IGNORECASE)


def allowed() -> set[str]:
    lines = ALLOWED_FILE.read_text(encoding="utf8").splitlines()
    return {line.strip() for line in lines if line.strip() and not line.startswith("#")}


def not_allowed(paths: list[str]) -> list[str]:
    permitted = allowed()
    return sorted(path for path in paths if PICTURE.search(path) and path not in permitted)


def git(*args: str) -> list[str]:
    out = subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True, encoding="utf8", check=True)
    return [line for line in out.stdout.splitlines() if line]


def main() -> int:
    staged = git("diff", "--cached", "--name-only", "--diff-filter=ACMR")
    refused = not_allowed(staged)
    if refused:
        print("Commit refused: pictures/PDFs that are not on the allowed list "
              "(real invoices never go into git — docs/06-ai-design.md 4):")
        for path in refused:
            print("  ", path)
        print("If a file is a made-up test picture, add it to backend/tests/fixtures/ALLOWED_IMAGES.txt.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
