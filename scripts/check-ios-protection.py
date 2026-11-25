#!/usr/bin/env python3
"""Verify the generated iOS app target requests complete file protection."""
import plistlib
import sys
from pathlib import Path

KEY = "com.apple.developer.default-data-protection"
EXPECTED = "NSFileProtectionComplete"

def check(target):
    candidates = list(Path(target).glob("*.entitlements"))
    if len(candidates) != 1:
        raise ValueError("Expected exactly one app target entitlements file")
    with candidates[0].open("rb") as source:
        entitlements = plistlib.load(source)
    if entitlements.get(KEY) != EXPECTED:
        raise ValueError("App target does not request complete file protection")

if __name__ == "__main__":
    check(sys.argv[1])
    print("Generated iOS app entitlement verified (not signed/device verified).")
