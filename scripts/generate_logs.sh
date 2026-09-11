#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="/opt/admin/logs"
mkdir -p "$LOG_DIR"

cat >"$LOG_DIR/access.log" <<'EOF'
192.168.1.100 - - [12/Sep/2026:18:40:01 +0700] "GET / HTTP/1.1" 200 1842 "-" "Mozilla/5.0" xff="-"
192.168.1.100 - - [12/Sep/2026:18:40:03 +0700] "GET /robots.txt HTTP/1.1" 200 74 "-" "Mozilla/5.0" xff="-"
10.10.14.50 - - [12/Sep/2026:18:50:14 +0700] "GET / HTTP/1.1" 200 1842 "-" "Mozilla/5.0" xff="10.10.14.50"
10.10.14.50 - - [12/Sep/2026:18:50:15 +0700] "POST /feedback HTTP/1.1" 403 27 "-" "Mozilla/5.0" xff="10.10.14.50"
10.10.14.50 - - [12/Sep/2026:18:50:22 +0700] "POST /feedback HTTP/1.1" 201 514 "-" "Mozilla/5.0" xff="10.10.14.50"
10.10.14.50 - - [12/Sep/2026:18:50:28 +0700] "POST /api/telemetry HTTP/1.1" 200 11 "-" "Mozilla/5.0" xff="10.10.14.50"
10.10.14.50 - - [12/Sep/2026:18:51:10 +0700] "GET /api/session/replay?pre_mfa_session=pending_mfa_verification HTTP/1.1" 200 111 "-" "Mozilla/5.0" xff="10.10.14.50"
10.10.14.50 - - [12/Sep/2026:18:51:55 +0700] "GET /dashboard HTTP/1.1" 200 1432 "-" "Mozilla/5.0" xff="10.10.14.50"
10.10.14.50 - - [12/Sep/2026:18:53:10 +0700] "GET /dashboard?payload=%3Csvg%20onload%3Dalert(1)%3E HTTP/1.1" 200 1511 "-" "Mozilla/5.0" xff="UEhBTlRPTUdSSUR7QkxVRV9MMGdfSHVudDNyX000c3Qzcn0}"
192.168.1.100 - - [12/Sep/2026:18:55:01 +0700] "GET /healthz HTTP/1.1" 200 38 "-" "Mozilla/5.0" xff="-"
EOF

cat >"$LOG_DIR/error.log" <<'EOF'
2026-09-12T18:50:15+07:00 WAF block: blocked keyword <script> from attacker simulation
2026-09-12T18:50:22+07:00 WAF bypass accepted: HTML5 <svg> payload
2026-09-12T18:50:28+07:00 CRITICAL cookie reuse event: attacker collected pre_mfa_session
2026-09-12T18:51:10+07:00 CRITICAL cookie reuse event: pre_mfa_session replay promoted to admin session
2026-09-12T18:51:10+07:00 MFA verification endpoint not reached by attacker IP 10.10.14.50
2026-09-12T18:53:10+07:00 Authentication bypass anomaly
EOF

chmod 644 "$LOG_DIR/access.log" "$LOG_DIR/error.log"
echo "Deterministic Scenario75 logs generated at $LOG_DIR"
