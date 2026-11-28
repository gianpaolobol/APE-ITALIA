import copy
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

path = Path(__file__).with_name("verify-staging-runtime-config.py")
spec = importlib.util.spec_from_file_location("guard", path)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

API = "https://api-staging.example.test"
WEB = "https://web-staging.example.test"
OIDC = "https://auth-staging.example.test/realms/ape"
MODEL = {"services": {
    "api": {"environment": {"PUBLIC_API_URL": API, "OIDC_ISSUER": OIDC,
                            "OIDC_JWKS_URL": OIDC + "/protocol/openid-connect/certs",
                            "STRIPE_SECRET_KEY": "sk_test_SYNTHETIC"}},
    "web": {"environment": {"WEB_BASE_URL": WEB, "API_BASE_URL": API, "OIDC_ISSUER": OIDC}},
    "caddy": {"environment": {"API_DOMAIN": "api-staging.example.test",
                              "WEB_DOMAIN": "web-staging.example.test"}}
}}

class GuardTests(unittest.TestCase):
    def test_valid(self):
        guard.validate(MODEL, API, WEB, OIDC)
        model = copy.deepcopy(MODEL)
        for service in ("api", "web"):
            model["services"][service]["environment"]["OIDC_ISSUER"] = ""
        model["services"]["api"]["environment"]["OIDC_JWKS_URL"] = ""
        model["services"]["api"]["environment"]["STRIPE_SECRET_KEY"] = ""
        guard.validate(model, API, WEB, "")

    def test_reject_effective_overrides(self):
        cases = [
            ("api", "PUBLIC_API_URL", "https://api.example.test"),
            ("web", "WEB_BASE_URL", API), ("web", "API_BASE_URL", WEB),
            ("caddy", "WEB_DOMAIN", "web.example.test"),
            ("api", "OIDC_ISSUER", "https://auth.example.test/realms/ape"),
            ("web", "OIDC_ISSUER", OIDC + "-other"),
            ("api", "OIDC_JWKS_URL", "https://auth.example.test/certs"),
            ("api", "OIDC_JWKS_URL", OIDC + "/../certs"),
            ("api", "STRIPE_SECRET_KEY", "sk_live_SYNTHETIC"),
            ("api", "STRIPE_SECRET_KEY", "rk_live_SYNTHETIC"),
        ]
        for service, key, value in cases:
            with self.subTest(service=service, key=key):
                model = copy.deepcopy(MODEL)
                model["services"][service]["environment"][key] = value
                with self.assertRaises(ValueError):
                    guard.validate(model, API, WEB, OIDC)

    def test_cli_never_echoes_secret(self):
        model = copy.deepcopy(MODEL)
        sentinel = "synthetic-sensitive-value-not-a-real-secret"
        model["services"]["api"]["environment"]["STRIPE_SECRET_KEY"] = sentinel
        p = subprocess.run([sys.executable, str(path), API, WEB, OIDC],
                           input=json.dumps(model), text=True, capture_output=True)
        self.assertNotEqual(p.returncode, 0)
        self.assertNotIn(sentinel, p.stdout + p.stderr)

if __name__ == "__main__":
    unittest.main()
