# Taskrypt security

Taskrypt is designed defensively, but **no application is completely secure**. This document states what is protected, against whom, and what is not.

## Assets

1. Document contents (IDs, contracts, medical/financial records).
2. Task data (may contain personal information).
3. Account credentials and sessions.
4. Encryption keys.

## Threat model

| Threat | Mitigation | Residual risk |
| --- | --- | --- |
| Another user reads/modifies my data via the API | RLS on every table (select/insert/update/delete, owner only); composite FKs `(id, user_id)` block cross-user references; ownership forced in `sync_push`; `user_id` immutable trigger. Verified on Postgres in `tests/server`. | Misconfiguration if migrations are edited without re-running the server tests. |
| Anonymous access | `anon` has no table grants; RPCs are `authenticated` only; bucket is private. | — |
| Direct object access / guessing URLs | Private bucket; policies require `<auth.uid()>/<uuid>/<uuid>`; random object keys; 60 s signed URLs only. | A signed URL leaked within 60 s is usable by whoever holds it. |
| Malicious upload (renamed executable, oversize, path tricks) | Extension allow-list + magic-byte check on device; MIME allow-list + `file_size_limit` on the bucket; MIME/size/name/storage-key checks in Postgres; filenames sanitised (separators, control & bidi chars, reserved names); paths built only from UUIDs. | Magic bytes are a heuristic (e.g. any ZIP passes as DOCX). Files are never executed or rendered by the server. |
| Quota abuse / spam | Per-user storage quota trigger (users cannot raise it — column grants); `sync_push` limits (200/call, 3000/min); Supabase Auth rate limits. | Add CAPTCHA and edge rate limiting for public launches. |
| Stolen / rooted device, backups | Local DB per user; documents encrypted at rest with AES-256-GCM using keys in Keychain/Keystore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`); iOS `NSFileProtectionComplete`; Android `allowBackup=false`; session tokens encrypted at rest; optional biometric lock; app-switcher snapshot obscured. | Task rows and document *metadata* in SQLite are protected by the OS sandbox / file protection, not by app-level encryption (consider SQLCipher). A compromised OS can read memory while unlocked. |
| Lost phone while signed in | Biometric lock; sign out elsewhere via password change (`signOut({scope:'others'})`); offline grant expires. | Until the grant expires the lost device can open cached data if its OS passcode is known. |
| Session theft | PKCE flow; refresh-token rotation; tokens never logged; encrypted storage. | Tokens in memory on a compromised device. |
| Server compromise / insider | Optional **zero-knowledge mode**: documents encrypted on device with a DEK wrapped by a scrypt-derived key from a separate passphrase; server stores only ciphertext + wrapped key. | Metadata (names, sizes, dates, tasks) is not end-to-end encrypted. Standard-mode files are readable by anyone with storage admin access. |
| Tampered offline files | Authenticated encryption detects any modification, truncation, reordering or swapping between documents; SHA-256 verified on download/upload. | — |
| Secrets in the app bundle | Only `EXPO_PUBLIC_*` public values; service-role key exists only in the Edge Function environment; account deletion is server-side. | The anon key is public by design. |
| Sensitive data in logs | Logger is silent in production except scrubbed error scopes; redacts tokens, e-mails, keys and byte buffers. | Crash reporters (if added) must be configured with the same scrubbing. |
| Clock manipulation to win conflicts | Server clamps `client_updated_at` to `now() + 5 min`. | A user can only affect their own data. |

## Known limitations (by design)

- **Offline cannot detect revocation.** While disconnected, the app cannot learn about password changes, account suspension or deletion. On reconnect it re-validates and signs out (and wipes on deletion).
- **Zero-knowledge implications:** no passphrase recovery; every new device needs the passphrase once; such files cannot be shared by link; server-side MIME validation sees ciphertext only.
- **Local metadata is not app-encrypted** (see above).
- **LWW conflict resolution** can discard a concurrent field edit on another device.

## Production security checklist

- [ ] Separate Supabase projects for development and production; production keys only in EAS production environment.
- [ ] `npx supabase db push` applied; `npm run test:server` passes against the same migrations.
- [ ] Confirm in the dashboard: every table shows **RLS enabled**; bucket `vault` is **private** with the 50 MiB limit and MIME list.
- [ ] Email confirmations ON, OTP length 6, custom templates installed, redirect URL allow-list contains only `taskrypt://auth/callback`.
- [ ] Leaked-password protection, CAPTCHA (hCaptcha/Turnstile) and auth rate limits reviewed.
- [ ] Refresh-token rotation ON; JWT expiry ≤ 1 h.
- [ ] `delete-account` function deployed; service-role key stored only as a function secret; key rotated if it was ever shared.
- [ ] pg_cron housekeeping scheduled; orphaned-object cleanup job added.
- [ ] `npm audit` reviewed; dependencies pinned via lockfile; Dependabot/Renovate enabled.
- [ ] Release builds: `EXPO_PUBLIC_APP_ENV=production`, no dev client, Hermes on, ProGuard/R8 enabled.
- [ ] Privacy policy reviewed by counsel and published; App Store privacy labels / Play data-safety form completed.
- [ ] Optional: certificate pinning, SQLCipher for local metadata, jailbreak/root heuristics, Play Integrity / App Attest.
- [ ] Penetration test of the API with two real accounts (try reading/updating the other account's rows and objects).

## Reporting

Replace with your security contact (e.g. `security@yourdomain`) before release.
