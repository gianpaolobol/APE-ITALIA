#!/usr/bin/env python3
"""Make the latest APE Italia build installable via TestFlight for the account holder.

Uses the App Store Connect API key from the environment (ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 or
ASC_KEY_P8_BASE64). Idempotent: waits for the latest build to finish processing, declares export
compliance (no non-exempt encryption), ensures an internal beta group "Interni" with access to all
builds, and adds the team's account holder (and admins) as internal testers. Emails are never
printed (public repository logs).
"""
import base64, json, os, sys, time, urllib.error, urllib.request
import jwt  # PyJWT

BUNDLE_ID = os.environ.get("BUNDLE_ID", "it.apeitalia.app")
API = "https://api.appstoreconnect.apple.com"


def key_pem():
    pem = os.environ.get("ASC_KEY_P8", "").strip()
    if not pem:
        pem = base64.b64decode(os.environ["ASC_KEY_P8_BASE64"]).decode()
    return pem.replace("\r", "")


def token():
    now = int(time.time())
    return jwt.encode({"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 1100, "aud": "appstoreconnect-v1"},
                      key_pem(), algorithm="ES256", headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"})


def call(method, path, body=None, ok=(200, 201, 204)):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        if e.code in ok:
            return e.code, {}
        return e.code, {"_error": raw}


def must(method, path, body=None):
    code, data = call(method, path, body)
    if code not in (200, 201, 204):
        print(f"::error::{method} {path.split('?')[0]} -> {code}: {data.get('_error', '')[:800]}")
        sys.exit(1)
    return data


def log(msg):
    print(f"[testflight] {msg}", flush=True)


app = must("GET", f"/v1/apps?filter[bundleId]={BUNDLE_ID}&limit=1")["data"]
if not app:
    print(f"::error::No App Store Connect app with bundle id {BUNDLE_ID}"); sys.exit(1)
app_id = app[0]["id"]
log(f"app {app_id}")

build = None
for i in range(60):  # up to ~30 min
    builds = must("GET", f"/v1/builds?filter[app]={app_id}&sort=-uploadedDate&limit=1&fields[builds]=version,processingState,usesNonExemptEncryption,expired")["data"]
    if not builds:
        log("no build yet, waiting"); time.sleep(30); continue
    build = builds[0]
    st = build["attributes"]["processingState"]
    log(f"build {build['attributes']['version']} state {st}")
    if st == "VALID":
        break
    if st in ("FAILED", "INVALID"):
        print("::error::Apple rejected the build during processing"); sys.exit(1)
    time.sleep(30)
else:
    print("::error::Build still processing after 30 minutes; run this workflow again later"); sys.exit(1)

bid = build["id"]
if build["attributes"].get("usesNonExemptEncryption") is None:
    code, data = call("PATCH", f"/v1/builds/{bid}", {"data": {"type": "builds", "id": bid, "attributes": {"usesNonExemptEncryption": False}}})
    log(f"export compliance declared ({code})")

groups = must("GET", f"/v1/apps/{app_id}/betaGroups?limit=50")["data"]
grp = next((g for g in groups if g["attributes"].get("isInternalGroup") and g["attributes"]["name"] == "Interni"), None)
if not grp:
    grp = must("POST", "/v1/betaGroups", {"data": {"type": "betaGroups", "attributes": {"name": "Interni", "isInternalGroup": True, "hasAccessToAllBuilds": True},
                                                   "relationships": {"app": {"data": {"type": "apps", "id": app_id}}}}})["data"]
    log("internal group 'Interni' created")
gid = grp["id"]
if not grp["attributes"].get("hasAccessToAllBuilds"):
    code, _ = call("POST", f"/v1/betaGroups/{gid}/relationships/builds", {"data": [{"type": "builds", "id": bid}]})
    log(f"build added to group ({code})")

users = must("GET", "/v1/users?limit=200")["data"]
targets = [u for u in users if "ACCOUNT_HOLDER" in u["attributes"].get("roles", [])] or \
          [u for u in users if "ADMIN" in u["attributes"].get("roles", [])]
existing = {t["attributes"].get("email", "").lower() for t in must("GET", f"/v1/betaGroups/{gid}/betaTesters?limit=200")["data"]}
for u in targets:
    a = u["attributes"]; email = a["username"]
    if email.lower() in existing:
        log("account holder already a tester"); continue
    code, data = call("POST", "/v1/betaTesters", {"data": {"type": "betaTesters",
        "attributes": {"email": email, "firstName": a.get("firstName") or "Tester", "lastName": a.get("lastName") or "APE"},
        "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": gid}]}}}})
    if code in (200, 201):
        log("account holder added as internal tester (TestFlight invitation sent)")
    else:
        print(f"::error::adding tester failed ({code}): {data.get('_error', '')[:800]}"); sys.exit(1)

with open(os.environ.get("GITHUB_STEP_SUMMARY", os.devnull), "a") as f:
    f.write(f"### TestFlight\n- Build {build['attributes']['version']} pronta (VALID), gruppo interno **Interni**, titolare aggiunto come tester.\n"
            "- Installa dall'app TestFlight sull'iPhone (accedi con lo stesso Apple ID dell'account sviluppatore).\n")
log("done")
