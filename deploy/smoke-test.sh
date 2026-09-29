#!/usr/bin/env bash
# End-to-end check of a running stack, through the reverse proxy:
#
#   deploy/smoke-test.sh [base-url]        # default http://localhost:8080
#
# Signs up a new organization, builds a form, uploads a file, submits a
# response and reads it back, then invites a teammate who accepts (when email
# is off, so the invite link comes back to the caller). Each run leaves that
# test data behind, so point it
# at a throwaway stack (CI, or a local docker-compose.prod.yaml), not production.
# Needs only bash and curl.

set -euo pipefail

BASE="${1:-http://localhost:8080}"
BASE="${BASE%/}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

step() { printf '\n== %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

# request METHOD PATH EXPECTED_STATUS [curl args...] — prints the body.
request() {
  local method="$1" path="$2" expected="$3"
  shift 3
  local status
  status="$(curl -sS -o "$WORK/body" -w '%{http_code}' -X "$method" "$@" "$BASE$path")" \
    || fail "$method $path: request failed"
  [[ "$status" == "$expected" ]] \
    || fail "$method $path: expected $expected, got $status: $(head -c 300 "$WORK/body")"
  cat "$WORK/body"
}

# json_field NAME — first string value of "NAME" in the JSON on stdin.
json_field() {
  sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p" | head -n 1
}

step "Health"
ready="$(request GET /health/ready 200)"
[[ "$ready" == *'"status":"ok"'* ]] || fail "/health/ready: $ready"
echo "$ready"

step "API reference"
spec="$(request GET /api/openapi.json 200)"
[[ "$spec" == *'"openapi":"3.1.0"'* ]] || fail "/api/openapi.json is not an OpenAPI 3.1 document"
echo "OpenAPI document served"

step "Frontend pages"
for page in / /auth /dashboard /builder; do
  request GET "$page" 200 >/dev/null
  echo "GET $page 200"
done

step "Sign up"
org="smoke$(date +%s)$RANDOM"
token="$(request POST /api/auth/signup 201 \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$org@example.com\",\"password\":\"Smoke-test-$RANDOM-pass\",\"organizationName\":\"$org\"}" \
  | json_field token)"
[[ -n "$token" ]] || fail "signup returned no token"
auth=(-H "authorization: Bearer $token")
request GET /api/forms 401 >/dev/null
echo "created $org; /api/forms without a token is 401"

step "Create form"
form_id="$(request POST /api/forms 201 "${auth[@]}" \
  -H 'content-type: application/json' \
  -d '{"title":"Smoke test","schema":[{"id":"name","type":"text","label":"Name","required":true}]}' \
  | json_field id)"
[[ -n "$form_id" ]] || fail "create form returned no id"
request GET "/api/forms/$form_id/public" 200 >/dev/null
request GET "/form/$form_id" 200 >/dev/null
echo "form $form_id is public"

step "Upload a file"
# A 1x1 PNG.
png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4DwABAQEABRjYTgAAAABJRU5ErkJggg=='
file_url="$(request POST /api/uploads 200 \
  -H 'content-type: application/json' \
  -d "{\"formId\":\"$form_id\",\"fileName\":\"dot.png\",\"fileData\":\"$png\"}" \
  | json_field fileUrl)"
[[ -n "$file_url" ]] || fail "upload returned no fileUrl"
# fileUrl is absolute (PUBLIC_URL); fetch it through the base URL given here.
file_path="/api/files/${file_url#*/api/files/}"
request GET "$file_path" 200 -D "$WORK/headers" >/dev/null
grep -qi '^content-type: image/png' "$WORK/headers" || fail "download is not image/png"
echo "uploaded and downloaded $file_path"

step "Submit and read back"
request POST "/api/responses/$form_id" 201 \
  -H 'content-type: application/json' -d '{"name":"Ada"}' >/dev/null
responses="$(request GET "/api/responses/$form_id" 200 "${auth[@]}")"
[[ "$responses" == *'"name":"Ada"'* ]] || fail "response not listed: $responses"
csv="$(request GET "/api/responses/$form_id/export" 200 "${auth[@]}")"
[[ "$csv" == *Ada* ]] || fail "response not in CSV export: $csv"
echo "response stored, listed and exported"

step "Team"
me="$(request GET /api/auth/me 200 "${auth[@]}")"
[[ "$me" == *'"role":"OWNER"'* ]] || fail "/api/auth/me: $me"
teammate="teammate-$org@example.com"
invite="$(request POST /api/org/invites 201 "${auth[@]}" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$teammate\",\"role\":\"MEMBER\"}")"
invite_url="$(json_field inviteUrl <<<"$invite")"
if [[ -z "$invite_url" ]]; then
  # Email is configured, so the link went to an inbox this script can't read.
  echo "invite emailed to $teammate (accept step skipped)"
else
  member_token="$(request POST /api/invites/accept 201 \
    -H 'content-type: application/json' \
    -d "{\"token\":\"${invite_url#*#}\",\"password\":\"Smoke-member-$RANDOM-pass\"}" \
    | json_field token)"
  [[ -n "$member_token" ]] || fail "accepting the invite returned no token"
  members="$(request GET /api/org/members 200 "${auth[@]}")"
  [[ "$members" == *"$teammate"* ]] || fail "new member not listed: $members"
  request GET /api/org/invites 403 -H "authorization: Bearer $member_token" >/dev/null
  echo "invited and added $teammate; members can't see invitations"
fi

printf '\nSmoke test passed against %s\n' "$BASE"
