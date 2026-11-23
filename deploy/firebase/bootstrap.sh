#!/usr/bin/env bash
# One-time Firebase setup, run inside the bootstrap workflow with the owner's temporary gcloud login.
# Idempotent. Creates/reuses: Google Cloud project, Firebase, App Distribution, Android app,
# tester group (owner's email), a service account limited to App Distribution, and Workload Identity
# Federation trusting ONLY this GitHub repository (no keys anywhere). Prints non-secret identifiers.
set -euo pipefail
REPO="${REPO:?}"; PACKAGE="it.apeitalia.app"
ACCOUNT=$(gcloud config get-value account 2>/dev/null)
log() { echo "[bootstrap] $*" >&2; }

PROJECT=$(gcloud projects list --filter="projectId:ape-italia*" --format="value(projectId)" --sort-by=createTime | head -1)
if [ -z "$PROJECT" ]; then
  PROJECT="ape-italia-$(openssl rand -hex 3)"
  log "creating project $PROJECT"
  gcloud projects create "$PROJECT" --name="APE Italia" --quiet
fi
gcloud config set project "$PROJECT" --quiet >/dev/null 2>&1
NUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
log "project $PROJECT ($NUM)"

gcloud services enable firebase.googleapis.com firebaseappdistribution.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com serviceusage.googleapis.com --project "$PROJECT" --quiet

TOKEN=$(gcloud auth print-access-token)
api() { curl -sS -H "Authorization: Bearer $TOKEN" -H "X-Goog-User-Project: $PROJECT" -H "Content-Type: application/json" "$@"; }
wait_op() { # $1 operation name on firebase.googleapis.com
  for _ in $(seq 1 60); do R=$(api "https://firebase.googleapis.com/v1beta1/$1"); [ "$(echo "$R" | jq -r '.done // false')" = true ] && { echo "$R"; return; }; sleep 3; done
  echo "operation timeout: $1" >&2; return 1; }

if [ "$(api -o /dev/null -w '%{http_code}' "https://firebase.googleapis.com/v1beta1/projects/$PROJECT")" != 200 ]; then
  log "adding Firebase to $PROJECT"
  OP=$(api -X POST -d '{}' "https://firebase.googleapis.com/v1beta1/projects/$PROJECT:addFirebase" | jq -r '.name // empty')
  [ -n "$OP" ] || { api -X POST -d '{}' "https://firebase.googleapis.com/v1beta1/projects/$PROJECT:addFirebase" >&2; exit 1; }
  wait_op "$OP" >/dev/null
fi

APP_ID=$(api "https://firebase.googleapis.com/v1beta1/projects/$PROJECT/androidApps" | jq -r --arg p "$PACKAGE" '.apps[]? | select(.packageName==$p) | .appId' | head -1)
if [ -z "$APP_ID" ]; then
  log "registering Android app $PACKAGE"
  OP=$(api -X POST -d "{\"packageName\":\"$PACKAGE\",\"displayName\":\"APE Italia\"}" "https://firebase.googleapis.com/v1beta1/projects/$PROJECT/androidApps" | jq -r '.name')
  APP_ID=$(wait_op "$OP" | jq -r '.response.appId')
fi
log "android app $APP_ID"

# Tester group with the owner's account (email stays in Firebase, never in the repository).
AD="https://firebaseappdistribution.googleapis.com/v1/projects/$NUM"
api -X POST -d '{"displayName":"Tester interni"}' "$AD/groups?groupId=interni" >/dev/null || true
api -X POST -d "{\"emails\":[\"$ACCOUNT\"]}" "$AD/groups/interni:batchJoin" >/dev/null
log "tester group 'interni' ready"

SA_NAME=github-app-distribution
SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || gcloud iam service-accounts create "$SA_NAME" --display-name="GitHub Actions - App Distribution" --quiet
for i in $(seq 1 10); do gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 && break; sleep 3; done
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role=roles/firebaseappdistro.admin --condition=None --quiet >/dev/null

gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions" --quiet
gcloud iam workload-identity-pools providers describe ape-italia --location=global --workload-identity-pool=github >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc ape-italia --location=global --workload-identity-pool=github \
    --display-name="APE Italia repository" --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository=='$REPO'" --quiet
gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUM/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" --quiet >/dev/null

jq -n --arg project "$PROJECT" --arg number "$NUM" --arg app "$APP_ID" --arg sa "$SA" \
  --arg provider "projects/$NUM/locations/global/workloadIdentityPools/github/providers/ape-italia" \
  '{projectId:$project, projectNumber:$number, androidAppId:$app, serviceAccount:$sa, workloadIdentityProvider:$provider, testerGroup:"interni"}'
