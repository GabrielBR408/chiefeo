"""
tokenscope.py — Python logging wrapper for the Anthropic SDK.

Drop-in replacement for `client.messages.create(...)`. Every call is mirrored
into a log destination so the TokenScope dashboard can read it.

Two log destinations, configured by env vars (use either, or both):

    FILE MODE (recommended for the single-file HTML dashboard on Dropbox):
        TOKENSCOPE_LOG_FILE   path to a .jsonl file the wrapper appends to.
                              e.g. ~/Dropbox/tokenscope/usage.jsonl
                              Parent directory is created if missing.

    SUPABASE MODE (for the future hosted React dashboard):
        SUPABASE_URL          https://xxxx.supabase.co
        SUPABASE_SERVICE_KEY  service-role key (server-side only)
        TOKENSCOPE_USER_ID    UUID of the Supabase auth user owning the logs

If neither destination is configured, the wrapper logs a one-time warning
and returns the API response normally — your code keeps working.

Logging runs on a background thread: a destination failure never blocks or
raises into the caller.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import anthropic

# ─── Pricing (USD per 1M tokens) ─────────────────────────────────────────────
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
        (getattr(usage, "input_tokens",                  0) / 1_000_000) * p["input"]
        + (getattr(usage, "output_tokens",               0) / 1_000_000) * p["output"]
        + (getattr(usage, "cache_read_input_tokens",     0) / 1_000_000) * p["cache_read"]
        + (getattr(usage, "cache_creation_input_tokens", 0) / 1_000_000) * p["cache_write"]
    )


# ─── Destination wiring ──────────────────────────────────────────────────────

def _file_target() -> Optional[Path]:
    raw = os.environ.get("TOKENSCOPE_LOG_FILE")
    if not raw:
        return None
    return Path(os.path.expanduser(raw)).resolve()


def _supabase_env() -> Optional[dict]:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    uid = os.environ.get("TOKENSCOPE_USER_ID")
    if url and key and uid:
        return {"url": url, "key": key, "uid": uid}
    return None


_anthropic_client: Optional[anthropic.Anthropic] = None
_supabase_client = None
_warned = False
_file_lock = threading.Lock()  # serialize appends so concurrent threads don't interleave


def _client() -> anthropic.Anthropic:
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = anthropic.Anthropic()
    return _anthropic_client


def _supabase(env: dict):
    global _supabase_client
    if _supabase_client is None:
        # Imported lazily so users on the file-only path don't need supabase-py.
        from supabase import create_client
        _supabase_client = create_client(env["url"], env["key"])
    return _supabase_client


def _warn_no_sink() -> None:
    global _warned
    if _warned:
        return
    _warned = True
    print(
        "[TokenScope] No log destination configured. Set TOKENSCOPE_LOG_FILE "
        "(file mode) or SUPABASE_URL + SUPABASE_SERVICE_KEY + TOKENSCOPE_USER_ID "
        "(Supabase mode). API calls still work, but nothing is being recorded.",
        file=sys.stderr,
    )


def _append_jsonl(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with _file_lock, path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")


def _log_async(row: dict) -> None:
    file = _file_target()
    sb = _supabase_env()

    if file is None and sb is None:
        _warn_no_sink()
        return

    def _go():
        if file is not None:
            try:
                _append_jsonl(file, row)
            except Exception as e:  # noqa: BLE001
                print(f"[TokenScope] file log failed: {e}", file=sys.stderr)
        if sb is not None:
            try:
                sb_row = {**row, "user_id": sb["uid"]}
                _supabase(sb).table("usage_logs").insert(sb_row).execute()
            except Exception as e:  # noqa: BLE001
                print(f"[TokenScope] supabase log failed: {e}", file=sys.stderr)

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
        "id":                  str(uuid.uuid4()),
        "created_at":          datetime.now(timezone.utc).isoformat(),
        "tag":                 tag,
        "model":               model,
        "stop_reason":         getattr(response, "stop_reason", None),
        "input_tokens":        getattr(usage, "input_tokens", 0),
        "output_tokens":       getattr(usage, "output_tokens", 0),
        "cache_read_tokens":   getattr(usage, "cache_read_input_tokens", 0) or 0,
        "cache_write_tokens":  getattr(usage, "cache_creation_input_tokens", 0) or 0,
        "cost_usd":            calculate_cost(model, usage),
        "duration_ms":         duration_ms,
        "metadata":            metadata or {},
    }
    _log_async(row)

    return response
