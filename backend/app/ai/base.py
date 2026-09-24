"""What every AI provider must look like from the rest of the app (D53).

The point of the seam is that the shop is not married to one company. A
provider is anything that can turn a prompt into text and say what it cost;
swapping one for another is a line in `.env`, not a change in any caller.

Nothing in this package ever prints, logs or returns the API key. Error
messages name the setting, never its value.
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class AIResult:
    """One answer, with what it cost to get it.

    Token counts are optional because not every provider reports them, and a
    provider that does not must say so with None rather than guess a number.
    """

    text: str
    provider: str
    model: str
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None
    latency_ms: int


class AIProvider(Protocol):
    """A provider is a name, a model and one call."""

    name: str
    model: str

    def complete(self, prompt: str, *, timeout: float = ...) -> AIResult:
        """Send `prompt`, return the answer. Raises AppError on failure."""
        ...
