#!/usr/bin/env python3
"""
Piano Studio - Local-First Cloud Sync

1. Fetches any pending edits made online.
2. Shows a diff against your local scores/ and lets you [a]ccept, [k]eep local, or [s]kip.
3. Pushes your local scores/*.abc (excluding sample.abc) to your private cloud store.

Uses only Python standard library. Reads PIANO_STUDIO_URL and OWNER_PASSPHRASE
from .env.local if present, or prompts interactively.
"""

import difflib
import getpass
import json
import os
import urllib.error
import urllib.request

SCORES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scores")
ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env.local")


def load_env_local():
    env = {}
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def api_request(base_url, path, passphrase, method="GET", payload=None):
    url = f"{base_url.rstrip('/')}{path}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "x-owner-passphrase": passphrase,
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} on {path}: {body}") from e


def review_pending_edits(base_url, passphrase):
    res = api_request(base_url, "/api/save?action=pending", passphrase, method="GET")
    pending = res.get("pending", {})
    if not pending:
        print("No pending online edits.")
        return

    print(f"\nFound {len(pending)} pending online edit(s):\n")
    resolved = []

    for filename, info in pending.items():
        remote_content = info.get("content", "")
        updated_at = info.get("updatedAt", "unknown time")
        local_path = os.path.join(SCORES_DIR, filename)

        print(f"=== {filename} (edited {updated_at}) ===")
        if os.path.exists(local_path):
            with open(local_path, "r", encoding="utf-8") as f:
                local_content = f.read()
            if local_content == remote_content:
                print("  (Identical to local file — auto-clearing)")
                resolved.append(filename)
                continue
            diff = difflib.unified_diff(
                local_content.splitlines(keepends=True),
                remote_content.splitlines(keepends=True),
                fromfile=f"local/{filename}",
                tofile=f"online/{filename}",
            )
            print("".join(diff))
        else:
            print("  [NEW FILE created online]")
            print(remote_content[:400] + ("..." if len(remote_content) > 400 else ""))

        while True:
            choice = input("  [a]ccept online edit, [k]eep local, [s]kip? ").strip().lower()
            if choice in ("a", "accept"):
                with open(local_path, "w", encoding="utf-8") as f:
                    f.write(remote_content)
                print(f"  -> Saved online edit to {local_path}")
                resolved.append(filename)
                break
            elif choice in ("k", "keep"):
                print("  -> Kept local version (online edit discarded)")
                resolved.append(filename)
                break
            elif choice in ("s", "skip"):
                print("  -> Skipped (kept pending)")
                break

    if resolved:
        api_request(
            base_url,
            "/api/save?action=clear-pending",
            passphrase,
            method="POST",
            payload={"filenames": resolved},
        )


def push_local_scores(base_url, passphrase):
    scores = {}
    for name in sorted(os.listdir(SCORES_DIR)):
        if not name.endswith(".abc") or name == "sample.abc":
            continue
        full_path = os.path.join(SCORES_DIR, name)
        if os.path.isfile(full_path):
            with open(full_path, "r", encoding="utf-8") as f:
                scores[name] = f.read()

    res = api_request(
        base_url,
        "/api/save?action=push-scores",
        passphrase,
        method="POST",
        payload={"scores": scores},
    )
    print(f"\nSynced {res.get('count', len(scores))} private score(s) to cloud.")


def main():
    env = load_env_local()
    base_url = env.get("PIANO_STUDIO_URL") or input("Piano Studio URL (e.g. https://pianostudio.semere.dev): ").strip()
    passphrase = env.get("OWNER_PASSPHRASE") or getpass.getpass("Owner passphrase: ")

    review_pending_edits(base_url, passphrase)
    push_local_scores(base_url, passphrase)
    print("Done!")


if __name__ == "__main__":
    main()
