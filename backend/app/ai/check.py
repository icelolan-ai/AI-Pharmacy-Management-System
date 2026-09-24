"""ทดสอบว่าเรียก AI ติดจริง — python -m app.ai.check

Sends one short sentence, no image, and reports what it cost: which provider
and model answered, how long it took, and how many tokens were spent.

Nothing here prints the key. When the key is missing it says which line of
which file to fill in, which is the one thing a person needs at that moment.
"""

import sys

from app.ai import get_provider
from app.config import ConfigError
from app.errors import AppError

PROMPT = "ตอบสั้น ๆ คำเดียวว่า พร้อม"


def main() -> int:
    # A Windows console defaults to cp1252, which cannot encode Thai: without
    # this the tool dies on its own first line of output.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    try:
        provider = get_provider()
    except ConfigError as exc:
        print(f"ยังเรียก AI ไม่ได้: {exc}")
        print("แก้ที่ backend/.env — ดูชื่อตัวแปรได้จาก backend/.env.example")
        return 2

    print(f"ผู้ให้บริการ : {provider.name}")
    print(f"โมเดล        : {provider.model}")
    print(f"ข้อความที่ส่ง : {PROMPT}")

    try:
        result = provider.complete(PROMPT)
    except AppError as exc:
        print(f"เรียกไม่สำเร็จ: {exc.message}")
        if exc.details:
            print(f"รายละเอียด    : {exc.details}")
        return 1

    print(f"คำตอบ        : {result.text.strip()[:200]}")
    print(f"เวลาที่ตอบ   : {result.latency_ms} ms")
    print(
        "token ที่ใช้  : "
        f"prompt {result.prompt_tokens} · "
        f"คำตอบ {result.completion_tokens} · "
        f"รวม {result.total_tokens}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
