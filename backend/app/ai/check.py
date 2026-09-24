"""ทดสอบการเชื่อมต่อ AI

    python -m app.ai.check list   ถามผู้ให้บริการว่ามีโมเดลอะไรให้ใช้จริง
    python -m app.ai.check        ส่งข้อความสั้น ๆ 1 ประโยค แล้วรายงานเวลาและ token

`list` needs a key and nothing else. It exists because nobody should be
guessing model names: the provider is asked, and its answer is what a model is
chosen from.

Nothing here prints the key. When something is missing it says which line of
which file to fill in, which is the one thing a person needs at that moment.
"""

import sys

from app.ai import get_provider
from app.config import ConfigError
from app.errors import AppError

PROMPT = "ตอบสั้น ๆ คำเดียวว่า พร้อม"


def _fail_config(exc: ConfigError) -> int:
    print(f"ยังเรียก AI ไม่ได้: {exc}")
    print("แก้ที่ backend/.env — ดูชื่อตัวแปรได้จาก backend/.env.example")
    return 2


def _fail_call(exc: AppError) -> int:
    print(f"เรียกไม่สำเร็จ: {exc.message}")
    if exc.details:
        print(f"รายละเอียด    : {exc.details}")
    return 1


def list_models() -> int:
    try:
        provider = get_provider(need_model=False)
    except ConfigError as exc:
        return _fail_config(exc)
    try:
        models = provider.list_models()
    except AppError as exc:
        return _fail_call(exc)

    usable = sorted((m for m in models if m.can_generate), key=lambda m: m.name)
    other = len(models) - len(usable)
    print(f"ผู้ให้บริการ : {provider.name}")
    print(f"โมเดลทั้งหมด : {len(models)} · ใช้สร้างข้อความได้ {len(usable)} · อื่น ๆ {other}")
    print()
    print(f"{'ชื่อ (ใส่ใน AI_MODEL)':<44}{'รับได้ (token)':>16}{'ตอบได้ (token)':>16}")
    for m in usable:
        limit_in = f"{m.input_token_limit:,}" if m.input_token_limit else "-"
        limit_out = f"{m.output_token_limit:,}" if m.output_token_limit else "-"
        print(f"{m.name:<44}{limit_in:>16}{limit_out:>16}")
    return 0


def ping() -> int:
    try:
        provider = get_provider()
    except ConfigError as exc:
        return _fail_config(exc)

    print(f"ผู้ให้บริการ : {provider.name}")
    print(f"โมเดล        : {provider.model}")
    print(f"ข้อความที่ส่ง : {PROMPT}")

    try:
        result = provider.complete(PROMPT)
    except AppError as exc:
        return _fail_call(exc)

    print(f"คำตอบ        : {result.text.strip()[:200]}")
    print(f"เวลาที่ตอบ   : {result.latency_ms} ms")
    print(
        "token ที่ใช้  : "
        f"prompt {result.prompt_tokens} · "
        f"คำตอบ {result.completion_tokens} · "
        f"คิด {result.thinking_tokens if result.thinking_tokens is not None else '-'} · "
        f"รวม {result.total_tokens}"
    )
    return 0


def main(argv: list[str]) -> int:
    # A Windows console defaults to cp1252, which cannot encode Thai: without
    # this the tool dies on its own first line of output.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if argv[:1] == ["list"]:
        return list_models()
    if argv:
        print(f"ไม่รู้จักคำสั่ง {argv[0]!r} — ใช้ได้: list หรือไม่ใส่อะไรเลย")
        return 2
    return ping()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
