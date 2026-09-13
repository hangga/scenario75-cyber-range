# Scenario75 Cyber Range

A self-contained Red vs Blue cyber range for the **Cookies Reuse & MFA Bypass** scenario.

> This project is intentionally vulnerable and is designed to run only in an isolated lab.

## Architecture

```text
Proxmox VM
├── Docker Compose
│   ├── nginx       -> HTTP :3075
│   └── app         -> Node.js/Express :3000
└── OpenSSH         -> TCP :2275
    analyst / blue_team_rocks
```

The VM hostname used by the lab is `feedback.admin.local`.

## Quick start

On a fresh Debian/Ubuntu/Kali VM:

```bash
sudo ./scripts/install_vm.sh
sudo ./scripts/start_lab.sh
```

Then add the lab hostname on the Blue/Red workstation:

```text
<VM_IP> feedback.admin.local
```

Open:

```text
http://feedback.admin.local:3075/
```

SSH:

```bash
ssh -p 2275 analyst@<VM_IP>
```

Password:

```text
blue_team_rocks
```

Logs are stored on the VM at:

```text
/opt/admin/logs/access.log
/opt/admin/logs/error.log
```

## Red Team walkthrough

1. Visit `/` and inspect the HTTP response headers.
2. `X-Powered-By: Node.js` reveals the backend technology.
3. Read `/robots.txt` and discover `/api/verify-mfa`.
4. Inspect the HTML source and find the robots.txt hint.
5. Observe the unauthenticated `pre_mfa_session` cookie.
6. Submit a normal `<script>` payload to `POST /feedback`. The WAF returns `403`.
7. Bypass the intentionally weak WAF with an HTML5 `<svg onload>` payload.
8. The WAF also blocks direct cookie-keyword access. Use the required bracket-notation expression:
   `window['docu'+'ment']['coo'+'kie']`
9. The payload sends the stolen `pre_mfa_session` value to `/api/telemetry`.
10. Replay the stolen `pre_mfa_session` cookie against `/api/session/replay` to obtain an `adm_sess...` cookie without calling `/api/verify-mfa`.
11. Visit `/dashboard` with the replayed admin cookie.
12. The reflected payload is rendered inside `.xss-payload`.
13. Capture the final Red flag:

```text
SCENARIO75{RED_C00k13_MFA_Byp4ss_0wn3d}
```

[Red Team walkthrough: Step-by-Step Guide >>](https://github.com/hangga/scenario75-cyber-range/blob/main/Red-Team-Walkthrough.md)

## Blue Team walkthrough

SSH into the VM:

```bash
ssh -p 2275 analyst@<VM_IP>
```

Inspect:

```bash
sudo cat /opt/admin/logs/access.log
sudo cat /opt/admin/logs/error.log
```

Useful clues:

- attacker IP: `10.10.14.50`
- attacker UA: `Mozilla/5.0`
- first WAF block: `18:50:15`
- successful `/dashboard`: `18:51:55`
- authentication anomaly: `18:53:10`
- attacker never reaches `/api/verify-mfa`
- suspicious `X-Forwarded-For` value is Base64

Decode:

```bash
printf '%s' 'UEhBTlRPTUdSSUR7QkxVRV9MMGdfSHVudDNyX000c3Qzcn0}' | base64 -d
```

The decoded Blue flag is:

```text
SCENARIO75{BLUE_L0G_HUnt3r_M4st3r}
```

## Forensic Base64 Marker

The Blue Team investigation includes a Base64-encoded value in the
X-Forwarded-For header.

Decode it with:

```bash
printf '%s' 'UEhBTlRPTUdSSUR7QkxVRV9MMGdfSHVudDNyX000c3Qzcn0}' | base64 -d
```

The decoded value is:

SCENARIO75{BLUE_L0g_HUnt3r_M4st3r}

## Verification

After starting the range:

```bash
./scripts/verify_lab.sh
```

The verifier checks the important externally observable requirements, including the port, headers, robots.txt, cookie, WAF responses, session replay behavior, flags, and forensic log markers.

## Reset

The application is intentionally deterministic. To reset the generated forensic logs:

```bash
sudo ./scripts/generate_logs.sh
```

To restart:

```bash
sudo docker compose -f /opt/scenario75/docker-compose.yml down
sudo docker compose -f /opt/scenario75/docker-compose.yml up -d --build
```

## [Full Scenario >>](https://github.com/hangga/scenario75-cyber-range/blob/main/SCENARIO.md)
