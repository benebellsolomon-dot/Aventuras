#!/usr/bin/env python3
"""Pre-configure Aventuras to render images through the si-animator-bridge.

Inserts an AUTOMATIC1111-type image profile pointing at the bridge
(http://100.100.142.29:8001) into Aventuras's settings DB and selects it as the
imageGeneration service profile. Equivalent to doing it by hand in
Settings -> image generation; see research/30-aventuras-evaluation.md §5.2.

Safety: refuses to run while Aventuras is open (the app holds settings in memory
and would clobber direct DB writes on its next save), and backs up the DB first.

Usage:  python3 scripts/aventuras-setup-bridge-profile.py [--db PATH]
"""

import argparse
import json
import shutil
import sqlite3
import subprocess
import sys
import time
import uuid
from pathlib import Path

BRIDGE_URL = "http://100.100.142.29:8001"
PROFILE_NAME = "SI Bridge (4090)"
# Must be NON-EMPTY: Aventuras's hasRequiredCredentials() (imageUtils.ts) blocks portrait/
# image generation on an empty apiKey for a1111 profiles (only pollinations/comfyui are
# allowed keyless). The bridge ignores the value while tailnet no-auth is on.
PLACEHOLDER_API_KEY = "tailnet-noauth"
# The checkpoint title the bridge's /sdapi/v1/sd-models advertises today; cosmetic —
# the bridge's compat shim ignores override_settings and renders its house preset.
BRIDGE_MODEL_TITLE = "krea2"
DEFAULT_DB = (
    Path.home() / "Library" / "Application Support" / "com.karelian.aventura" / "aventura.db"
)


def fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def aventuras_running() -> bool:
    probe = subprocess.run(["pgrep", "-f", "Aventuras.app"], capture_output=True)
    return probe.returncode == 0


def load_setting(db: sqlite3.Connection, key: str):
    row = db.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return json.loads(row[0]) if row else None


def save_setting(db: sqlite3.Connection, key: str, value) -> None:
    db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (key, json.dumps(value)),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="path to aventura.db")
    parser.add_argument(
        "--allow-running",
        action="store_true",
        help="skip the running-app check (ONLY for testing against a copy)",
    )
    args = parser.parse_args()

    if not args.db.exists():
        fail(f"DB not found at {args.db} — has Aventuras been launched once?")
    if not args.allow_running and aventuras_running():
        fail("Aventuras is running. Quit it first (Cmd+Q), then re-run this script.")

    backup = args.db.with_name(f"{args.db.name}.bak-{time.strftime('%Y%m%d-%H%M%S')}")
    shutil.copy2(args.db, backup)
    print(f"backup: {backup}")

    db = sqlite3.connect(args.db)
    try:
        profiles = load_setting(db, "image_profiles") or []
        if not isinstance(profiles, list):
            fail(f"unexpected image_profiles shape: {type(profiles).__name__}")

        existing = next((p for p in profiles if p.get("baseUrl") == BRIDGE_URL), None)
        if existing:
            profile_id = existing["id"]
            if not existing.get("apiKey"):
                profiles = [
                    {**p, "apiKey": PLACEHOLDER_API_KEY} if p["id"] == profile_id else p
                    for p in profiles
                ]
                save_setting(db, "image_profiles", profiles)
                print(f"bridge profile present (id={profile_id}); filled empty apiKey "
                      "with a placeholder (app requires non-empty for a1111)")
            else:
                print(f"bridge profile already present (id={profile_id}); leaving it as-is")
        else:
            profile_id = str(uuid.uuid4())
            profiles = profiles + [
                {
                    "id": profile_id,
                    "name": PROFILE_NAME,
                    "providerType": "a1111",
                    "apiKey": PLACEHOLDER_API_KEY,
                    "baseUrl": BRIDGE_URL,
                    "model": BRIDGE_MODEL_TITLE,
                    "providerOptions": {},
                    "createdAt": int(time.time() * 1000),
                }
            ]
            save_setting(db, "image_profiles", profiles)
            print(f"added image profile '{PROFILE_NAME}' (id={profile_id})")

        services = load_setting(db, "system_services_settings")
        if not isinstance(services, dict) or "imageGeneration" not in services:
            fail("system_services_settings missing imageGeneration — app version mismatch?")
        image_gen = {**services["imageGeneration"], "profileId": profile_id}
        save_setting(db, "system_services_settings", {**services, "imageGeneration": image_gen})
        print("imageGeneration.profileId -> bridge profile")

        db.commit()
    finally:
        db.close()

    print("done. Launch Aventuras and check Settings -> image generation.")


if __name__ == "__main__":
    main()
