"""
tokenscope.py — Python logging wrapper for the Anthropic SDK.

Drop into any Python project, set the env vars below, and replace your
`client.messages.create(...)` calls with `claude_call(tag=..., ...)`.

Required env:
    ANTHROPIC_API_KEY        sk-ant-…
    SUPABASE_URL             https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY     service-role key (server-side only)
    TOKENSCOPE_USER_ID       UUID of the Supabase auth user that owns these logs

The Supabase insert runs on a background thread — a logging failure never
blocks or raises into the caller.
"""

from __future__ import annotations

import os
import time
import threading
from typing import Any, Optional

import anthropic
from supabase import create_client, Client

# ─── Pricing (USD per 1M tokens) ─────────────────────────────────────────────
# Verify at https://docs.anthropic.com/en/docs/about-claude/pricing before
# shipping — these change.
PRICING: dict[str, dict[str, float]] = {
    "claude-opus-4-7":            {"input": 15.00, "output": 75.00, "cache_read": 1.50, "cache_write": 18.75},
    "claude-opus-4-6":            {"input": 15.00, "output": 75.00, "cache_read": 1.50, "cache_write": 18.75},
    "claude-sonnet-4-6":          {"input":  3.00, "output": 15.00, "cache_read": 0.30, "cache_write":  3.75},
    "claude-haiku-4-5-20251001":  {"input":  0.80, "output":  4.00, "cache_read": 0.08, "cache_write":  1.00},
}

FALLBACK_MODEL = "claude-sonnet-4-6"


def calculate_cost(model: str, usage: Any) -> float:
    p = PRICING.get(model, PRICING[FALLBACK_MODEL])
    return (
        (getattr(usage, "input_tokens",                0) / 1_000_000) * p["input"]
        + (getattr(usage, "output_tokens",             0) / 1_000_000) * p["output"]
        + (getattr(usage, "cache_read_input_tokens",   0) / 1_000_000) * p["cache_read"]
        + (getattr(usage, "cache_creation_input_tokens", 0) / 1_000_000) * p["cache_write"]
    )


# ─── Lazy singletons ─────────────────────────────────────────────────────────

_anthropic_client: Optional[anthropic.Anthropic] = None
_supabase_client: Optional[Client] = None


def _client() -> anthropic.Anthropic:
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = anthropic.Anthropic()
    return _anthropic_client


def _supabase() -> Client:
    global _supabase_client
    if _supabase_client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise RuntimeError("[TokenScope] SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        _supabase_client = create_client(url, key)
    return _supabase_client


def _log_row_async(row: dict) -> None:
    def _go():
        try:
            _supabase().table("usage_logs").insert(row).execute()
        except Exception as e:  # noqa: BLE001 — best-effort logging
            print(f"[TokenScope] log failed: {e}")
    threading.Thread(target=_go, daemon=True).start()


# ─── Public API ──────────────────────────────────────────────────────────────

def claude_call(
    tag: str,
    messages: list,
    model: str = FALLBACK_MODEL,
    system: Optional[str] = None,
    max_tokens: int = 1024,
    metadata: Optional[dict] = None,
    **kwargs: Any,
):
    if not tag:
        raise ValueError("[TokenScope] claude_call requires a `tag`")

    request = {"model": model, "max_tokens": max_tokens, "messages": messages, **kwargs}
    if system is not None:
        request["system"] = system

    start = time.time()
    response = _client().messages.create(**request)
    duration_ms = int((time.time() - start) * 1000)

    usage = response.usage
    row = {
        "user_id":            os.environ.get("TOKENSCOPE_USER_ID"),
        "tag":                tag,
        "model":              model,
        "stop_reason":        getattr(response, "stop_reason", None),
        "input_tokens":       getattr(usage, "input_tokens", 0),
        "output_tokens":      getattr(usage, "output_tokens", 0),
        "cache_read_tokens":  getattr(usage, "cache_read_input_tokens", 0) or 0,
        "cache_write_tokens": getattr(usage, "cache_creation_input_tokens", 0) or 0,
        "cost_usd":           calculate_cost(model, usage),
        "duration_ms":        duration_ms,
        "metadata":           metadata or {},
    }
    _log_row_async(row)

    return response
