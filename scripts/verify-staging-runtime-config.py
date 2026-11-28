"""Fail closed on the effective staging Compose configuration, without logging values."""
import json
import re
import sys
from urllib.parse import urlsplit

ORIGIN = r"https://[a-z0-9-]+(?:\.[a-z0-9-]+)+"
ISSUER = ORIGIN + r"(?:/[A-Za-z0-9._~-]+)*"

def staging_url(value, issuer=False):
    if not isinstance(value, str) or not re.fullmatch(ISSUER if issuer else ORIGIN, value):
        return False
    p = urlsplit(value)
    return (any(re.search(r"(?:^|-)staging(?:-|$)", label) for label in p.hostname.split("."))
            and not any(part in (".", "..") for part in p.path.split("/")))

def validate(model, api, web, issuer):
    if not staging_url(api) or not staging_url(web) or api == web:
        raise ValueError("Invalid expected staging origins")
    if issuer and not staging_url(issuer, issuer=True):
        raise ValueError("Invalid expected staging issuer")
    def env(service):
        value = model["services"][service]["environment"]
        if not isinstance(value, dict):
            raise ValueError("Invalid effective environment")
        return value
    a, w, c = env("api"), env("web"), env("caddy")
    if (a.get("PUBLIC_API_URL") != api or w.get("API_BASE_URL") != api
            or w.get("WEB_BASE_URL") != web
            or c.get("API_DOMAIN") != urlsplit(api).hostname
            or c.get("WEB_DOMAIN") != urlsplit(web).hostname):
        raise ValueError("Effective staging origins mismatch")
    if any((e.get("OIDC_ISSUER") or "") != issuer for e in (a, w)):
        raise ValueError("Effective staging issuer mismatch")
    jwks = a.get("OIDC_JWKS_URL") or ""
    if jwks and (not issuer or not staging_url(jwks, issuer=True)
                 or not jwks.startswith(issuer + "/")):
        raise ValueError("Effective staging JWKS URL mismatch")
    stripe = a.get("STRIPE_SECRET_KEY") or ""
    if stripe and (not isinstance(stripe, str) or not re.fullmatch(r"(?:sk|rk)_test_[A-Za-z0-9]+", stripe)):
        raise ValueError("Effective Stripe credential is not test-only")

def main():
    try:
        if len(sys.argv) != 4:
            raise ValueError("Missing expected staging configuration")
        validate(json.load(sys.stdin), *sys.argv[1:])
    except Exception:
        # No exception details: the model can contain secrets.
        print("Effective staging configuration rejected; check private staging settings", file=sys.stderr)
        return 1
    print("Effective staging configuration passed")
    return 0

if __name__ == "__main__":
    sys.exit(main())
