import json
import plistlib
import runpy
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
module = runpy.run_path(str(HERE / "check-ios-protection.py"))
check, key, expected = module["check"], module["KEY"], module["EXPECTED"]


class ProtectionTests(unittest.TestCase):
    def test_expo_config(self):
        config = json.loads((HERE.parent / "apps/mobile/app.json").read_text())
        self.assertEqual(config["expo"]["ios"]["entitlements"][key], expected)

    def test_generated_entitlement(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "App.entitlements"
            path.write_bytes(plistlib.dumps({key: expected}))
            check(temp)
            for value in ("NSFileProtectionNone", "NSFileProtectionCompleteUntilFirstUserAuthentication"):
                path.write_bytes(plistlib.dumps({key: value}))
                with self.assertRaises(ValueError):
                    check(temp)

    def test_missing_or_ambiguous_target(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                check(temp)
            for name in ("App.entitlements", "Other.entitlements"):
                (Path(temp) / name).write_bytes(plistlib.dumps({key: expected}))
            with self.assertRaises(ValueError):
                check(temp)


if __name__ == "__main__":
    unittest.main()
