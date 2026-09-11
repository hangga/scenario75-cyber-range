# Scenario75 Presentation Plan

## 1. Architecture

Show:

```text
Proxmox
  └── Linux VM
      ├── Docker Compose
      │   ├── Nginx :3075
      │   └── Node.js/Express :3000
      ├── OpenSSH :2275
      └── /opt/admin/logs
```

Explain that the range is deliberately deterministic so a Blue Team participant can reproduce the forensic trail.

## 2. Red Team

Demonstrate:

1. `X-Powered-By: Node.js`
2. `/robots.txt`
3. `/dashboard`
4. `pre_mfa_session`
5. `<script>` => 403
6. `<svg onload>` => WAF bypass
7. `window['docu'+'ment']['coo'+'kie']`
8. local telemetry
9. cookie replay
10. `adm_sess`
11. `/dashboard`
12. Red flag

## 3. Blue Team

SSH to port 2275.

Focus on:

```bash
grep '10.10.14.50' /opt/admin/logs/access.log
grep '18:50:15' /opt/admin/logs/error.log
grep '18:53:10' /opt/admin/logs/error.log
grep 'UEhBTlRPTUdSSUR' /opt/admin/logs/access.log
```

Then:

```bash
echo 'UEhBTlRPTUdSSUR7QkxVRV9MMGdfSHVudDNyX000c3Qzcn0}' | base64 -d
```

Expected:

```text
SCENARIO75{BLUE_L0G_HUnt3r_M4st3r}
```

## 4. Engineering discussion

Mention:

- Docker Compose gives deterministic service startup.
- Nginx generates realistic access telemetry.
- Node.js/Express implements the intentionally vulnerable challenge logic.
- Logs are generated separately so the Blue Team scenario remains reproducible.
- `/scripts/verify_lab.sh` validates the externally observable contract.
