#!/usr/bin/env python3
"""Read-only verification of exact TestFlight build and existing internal access."""
import base64, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
import jwt

API = "https://api.appstoreconnect.apple.com"
BUNDLE_ID = "it.apeitalia.app"

def fail(message):
    print(f"::error::{message}")
    sys.exit(1)

def token():
    pem = os.environ.get("ASC_KEY_P8", "").strip()
    if not pem:
        pem = base64.b64decode(os.environ["ASC_KEY_P8_BASE64"]).decode()
    now = int(time.time())
    return jwt.encode({"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 1100,
                       "aud": "appstoreconnect-v1"}, pem.replace("\r", ""), algorithm="ES256",
                      headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"})

def data(path, params):
    url = API + path + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, method="GET", headers={"Authorization": "Bearer " + token()})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            body = json.load(response)
    except urllib.error.HTTPError as error:
        fail(f"App Store Connect read failed (HTTP {error.code})")
    except (OSError, ValueError):
        fail("App Store Connect read failed")
    if (body.get("links") or {}).get("next"):
        fail("Paginated result; verify manually in App Store Connect")
    return body["data"]

expected = os.environ.get("EXPECTED_BUILD_NUMBER", "")
if not re.fullmatch(r"[1-9][0-9]*", expected):
    fail("Missing verified upload build number")
apps = data("/v1/apps", {"filter[bundleId]": BUNDLE_ID, "limit": 2})
if len(apps) != 1:
    fail("Expected exactly one App Store Connect app")
app_id = apps[0]["id"]
for attempt in range(60):
    builds = data("/v1/builds", {"filter[app]": app_id, "filter[version]": expected, "limit": 2,
        "fields[builds]": "version,processingState,usesNonExemptEncryption,expired"})
    if len(builds) > 1:
        fail("Ambiguous build number; verify platform and version manually")
    if builds:
        build = builds[0]
        attrs = build["attributes"]
        if attrs.get("version") != expected or attrs.get("expired") is not False:
            fail("Build expired or does not match verified upload")
        state = attrs.get("processingState")
        print(f"[testflight] exact build {expected} processing state {state}", flush=True)
        if state == "VALID":
            break
        if state in ("FAILED", "INVALID"):
            fail("Apple rejected exact build")
    time.sleep(30)
else:
    fail("Exact uploaded build has not become VALID")
# The existing flag is only an observation, not a determination of exemption.
if attrs.get("usesNonExemptEncryption") is not False:
    fail("Export compliance requires manual verification in App Store Connect")
groups = data(f"/v1/apps/{app_id}/betaGroups", {"limit": 50})
matches = [g for g in groups if g["attributes"].get("isInternalGroup") is True
           and g["attributes"].get("name") == "Interni"]
if len(matches) != 1:
    fail("Configure internal group Interni in App Store Connect")
group = matches[0]
gid = group["id"]
if group["attributes"].get("hasAccessToAllBuilds") is not True:
    linked = data(f"/v1/betaGroups/{gid}/builds", {"limit": 200})
    if not any(b["id"] == build["id"] for b in linked):
        fail("Assign exact build to Interni in App Store Connect")
users = data("/v1/users", {"limit": 200})
owners = {u["attributes"]["username"].lower() for u in users
          if "ACCOUNT_HOLDER" in u["attributes"].get("roles", [])}
testers = data(f"/v1/betaGroups/{gid}/betaTesters", {"limit": 200})
if not owners or not any(t["attributes"].get("email", "").lower() in owners for t in testers):
    fail("Account holder membership not verified")
print(f"[testflight] exact build {expected} VALID, not expired; group and holder membership verified")
with open(os.environ.get("GITHUB_STEP_SUMMARY", os.devnull), "a") as summary:
    summary.write(f"### TestFlight\n- Exact build {expected}: VALID, not expired; internal group and holder membership verified.\n"
                  "- Recorded encryption flag is false; correctness must be confirmed by owner.\n"
                  "- Invitation acceptance and physical installation are not verified.\n")
