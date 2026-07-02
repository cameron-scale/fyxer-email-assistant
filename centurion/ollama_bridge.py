#!/usr/bin/env python3
"""Ollama bridge worker — run this on YOUR machine (the one with Ollama).

It polls the Centurion server for queued quality-upgrade jobs, runs each prompt
on your LOCAL Ollama model, and posts the text back. The server compliance-
checks every result before applying it. If this worker is off, Centurion keeps
running on templates — this only makes it smarter, never blocks it.

Usage (from the centurion/ folder):
    python3 ollama_bridge.py --server https://centurion-dashboard.onrender.com \
        --token YOUR_DASHBOARD_TOKEN [--model llama3.1:8b] [--interval 30]

Requires: Ollama running locally (`ollama serve`) with the model pulled
(`ollama pull llama3.1:8b`), and `pip install requests`.
"""
from __future__ import annotations

import argparse
import sys
import time

import requests

sys.path.insert(0, ".")  # allow running from the centurion/ folder
from intelligence.language.local_llm import LocalLLMProvider  # noqa: E402


def run_once(server: str, token: str, provider: LocalLLMProvider) -> int:
    """Fetch queued jobs, work them locally, post results. Returns jobs done."""
    r = requests.get(f"{server}/api/bridge/jobs",
                     headers={"X-Centurion-Token": token}, timeout=30)
    r.raise_for_status()
    jobs = r.json().get("jobs", [])
    done = 0
    for job in jobs:
        jid = job["id"]
        print(f"[bridge] job #{jid} ({job['kind']}) — generating locally…")
        try:
            result = provider.generate(job["prompt"], schema=job.get("schema") or None)
            if not isinstance(result, dict):
                result = {"text": str(result)}
        except Exception as e:
            print(f"[bridge] generation failed: {e}")
            continue
        resp = requests.post(f"{server}/api/bridge/result",
                             headers={"X-Centurion-Token": token},
                             json={"token": token, "id": jid, "result": result},
                             timeout=60)
        note = resp.json().get("note", resp.status_code) if resp.headers.get(
            "content-type", "").startswith("application/json") else resp.status_code
        print(f"[bridge] job #{jid} -> {note}")
        done += 1
    return done


def main() -> None:
    ap = argparse.ArgumentParser(description="Centurion Ollama bridge worker")
    ap.add_argument("--server", required=True, help="Centurion dashboard URL")
    ap.add_argument("--token", required=True, help="CENTURION_DASHBOARD_TOKEN")
    ap.add_argument("--model", default="llama3.1:8b")
    ap.add_argument("--interval", type=float, default=30.0,
                    help="seconds between polls")
    ap.add_argument("--once", action="store_true", help="one pass, then exit")
    args = ap.parse_args()

    provider = LocalLLMProvider(model=args.model)
    if not provider.available():
        print("Ollama isn't reachable at localhost:11434. Start it with "
              "`ollama serve` (and `ollama pull " + args.model + "` once), then rerun.")
        sys.exit(1)

    server = args.server.rstrip("/")
    print(f"[bridge] serving quality upgrades to {server} with {args.model} — Ctrl+C to stop.")
    while True:
        try:
            n = run_once(server, args.token, provider)
            if n:
                print(f"[bridge] {n} job(s) completed.")
        except Exception as e:
            print(f"[bridge] pass failed ({e}); retrying…")
        if args.once:
            break
        time.sleep(max(5.0, args.interval))


if __name__ == "__main__":
    main()
