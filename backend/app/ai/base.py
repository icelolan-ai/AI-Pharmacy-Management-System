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
    # Tokens a model spends reasoning before it answers. They are reported
    # apart from the answer, and on some models they are most of the total:
    # a one-word reply came back as 1 answer token and 106 thinking tokens.
    thinking_tokens: int | None
    total_tokens: int | None
    latency_ms: int


@dataclass(frozen=True)
class ModelInfo:
    """One model a provider says it offers, as the provider describes it.

    Nothing here is filled in by us: a limit the provider does not report is
    None, not a number from memory.
    """

    name: str
    display_name: str | None
    can_generate: bool
    input_token_limit: int | None
    output_token_limit: int | None


class AIProvider(Protocol):
    """A provider is a name, a model and two calls."""

    name: str
    model: str | None

    def complete(self, prompt: str, *, timeout: float = ...) -> AIResult:
        """Send `prompt`, return the answer. Raises AppError on failure."""
        ...

    def list_models(self, *, timeout: float = ...) -> list[ModelInfo]:
        """Ask the provider what it really offers — needs a key, not a model."""
        ...
