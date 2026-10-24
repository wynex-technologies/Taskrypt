# Taskrypt

A premium, offline-first productivity app for **Android and iOS**: task management with a living mascot (Kora) and a **private, encrypted document vault**. Built with React Native, Expo SDK 58, TypeScript and Supabase.

> Architecture and sync rules: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Threat model and production checklist: [docs/SECURITY.md](docs/SECURITY.md)

---

## Status at a glance

| Area | State |
| --- | --- |
| Tasks (CRUD, priorities, lists, categories, tags, recurrence, reminders, search, filters, sort, calendar, history, statistics) | ✅ Implemented · unit/integration-tested on real SQLite |
| Offline-first storage, durable sync queue, idempotent push, paginated pull, deterministic conflict resolution | ✅ Implemented · tested across simulated devices |
| Supabase schema, RLS, storage policies, quota, validation, `sync_push` RPC | ✅ Implemented · **migration executed and attacked on real Postgres (PGlite)** |
| Document vault (import, magic-byte validation, upload with progress/cancel/retry, folders, rename/move/copy/delete, favorites, recents, search, type filters, sort, storage usage) | ✅ Implemented · upload/download/integrity paths tested with fakes |
| Local encryption (chunked AES-256-GCM, HKDF per-file keys, Keychain/Keystore keys), encrypted session at rest | ✅ Implemented · tamper/truncation/reorder tests |
| Optional zero-knowledge (end-to-end) vault mode | ✅ Implemented · key wrapping tested |
| Auth (sign-up, OTP e-mail verification, sign-in, PKCE deep links, password reset, offline grant, revalidation, sign-out policies, account deletion) | ✅ Implemented · flows tested against a mocked Supabase client |
| Biometric app lock, reminders, haptics, reduced motion, dark mode, tablet layout | ✅ Implemented |
| Kora mascot: 10 event-driven moods | ✅ Animated vector character (SVG + Reanimated). ⏳ **Rive renderer wired, awaiting a `.riv` asset** |
| Android / iOS JS bundles | ✅ `expo export` succeeds for both platforms |
| Native binaries (APK/AAB/IPA) | ⏳ Not built in this environment — use EAS (below) |
| Live Supabase integration | ⏳ Requires your project credentials — never exercised against a live backend here |

---

## Quick start

```bash
npm install
cp .env.example .env          # fill in your Supabase URL + anon key
npx expo start                # Metro
```

Taskrypt uses native modules that **Expo Go does not include** (Rive, local authentication with Face ID config, SQLite with your config plugins, notifications behaviour), so run it in a **development build**:

```bash
npx expo run:android          # local Android Studio / SDK
npx expo run:ios              # macOS + Xcode
# or in the cloud:
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile development --platform ios
```

Without credentials the app boots to a **"Connect a backend"** screen — it never falls back to fake data.

## Supabase setup

1. Create a project at <https://supabase.com> (separate projects for **development** and **production**).
2. Apply the schema:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push          # runs supabase/migrations/*.sql
   ```
   This creates all tables, RLS policies, triggers, the `sync_push` RPC and the private `vault` bucket with its storage policies.
3. **Auth → Providers → Email**: enable *Confirm email*. Set **OTP length 6**.
4. **Auth → Email templates**: use `supabase/templates/confirmation.html` and `recovery.html` (they include `{{ .Token }}` so users can type the code).
5. **Auth → URL configuration**: add `taskrypt://auth/callback` to *Redirect URLs*.
6. **Auth → Security**: enable leaked-password protection and CAPTCHA if available on your plan; keep refresh-token rotation on.
7. Deploy the account-deletion function (holds the service-role key **server-side only**):
   ```bash
   npx supabase functions deploy delete-account
   ```
8. Optional housekeeping (prunes the idempotency log and 60-day-old tombstones) with pg_cron — see `supabase/seed.sql`.
9. **Keep the project from pausing (free plan).** The workflow `.github/workflows/supabase-keepalive.yml` at the repository root calls the `keepalive` RPC every 2 days. Add repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` (public anon key only), then run it once from the Actions tab. Without GitHub, any external cron can `POST <url>/rest/v1/rpc/keepalive` with headers `apikey` and `Authorization: Bearer <anon key>`.

### Staying inside the egress quota

- Sync is delta-only (server `updated_at` cursor); background syncs are skipped if one ran in the last 2 minutes, and the periodic sync runs every 15 minutes while the app is open.
- A document is downloaded at most once per device: the first open keeps an encrypted offline copy, so later opens are local.
- Watch **Usage** in the Supabase dashboard. The only hard guarantee against pauses and quota restrictions is the Pro plan (keep the spend cap on so overage can never bill you).

### Environment variables

See [.env.example](.env.example). Only public values are allowed: everything prefixed `EXPO_PUBLIC_` is embedded in the app.

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Public project URL + anon/publishable key (safe only because of RLS) |
| `EXPO_PUBLIC_DOCUMENT_BUCKET` | Storage bucket (default `vault`) |
| `EXPO_PUBLIC_MAX_UPLOAD_MB` | Client upload limit; keep ≤ bucket `file_size_limit` (50 MiB) |
| `EXPO_PUBLIC_OFFLINE_GRACE_DAYS` | How long the app may be opened offline after the last online check |
| `EXPO_PUBLIC_APP_ENV` | `development` / `staging` / `production` (changes app name + bundle id) |

**Development vs production:** keep two `.env` files out of git (`.env.development`, `.env.production`) or, preferably, use **EAS environment variables** (`eas env:create --environment production …`). `eas.json` maps the `development`, `preview` and `production` build profiles to those environments. Development builds get the bundle id suffix `.development` so both can be installed side by side.

## Building

### Android
```bash
npx eas-cli@latest build --profile preview --platform android      # installable APK
npx eas-cli@latest build --profile production --platform android   # Play Store AAB
```
Local alternative: `npx expo prebuild -p android && cd android && ./gradlew bundleRelease` (configure your upload keystore first). `android.allowBackup` is **false** so the encrypted vault and database are excluded from device/cloud backups.

### iOS
```bash
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest submit --platform ios
```
Requires an Apple Developer account. The app sets `NSFileProtectionComplete` (files unreadable while the device is locked) and a Face ID usage string.

## Testing

```bash
npm run typecheck        # strict TypeScript (app + tests)
npm run lint             # eslint-config-expo, incl. React Compiler rules
npm test                 # Jest: 116 unit/integration/component tests
npm run test:server      # Node test runner: real migration on PGlite (Postgres WASM), 19 tests
npm run test:all         # everything above
npx expo-doctor          # dependency/config health (20/20 passing)
npx expo export -p android   # JS bundle validation
```

What the suites cover:

- **`tests/unit`** – AES-GCM vault format (round-trips, tamper, truncation, chunk reordering, wrong doc/key), e2ee key wrapping, filename sanitising & path traversal, magic-byte validation (renamed executables), RFC 4122 v5 vector, recurrence, CSV, backoff, error mapping, log redaction.
- **`tests/integration`** – task CRUD on real SQLite (`node:sqlite`), queue coalescing, in-flight immutability, per-user DB isolation, ownership checks; sync push/pull, lost responses (idempotency), network backoff, server rejection, crash recovery, **two-device conflicts**, tie-breaks, edit-vs-delete, recurring-task duplicate prevention, pagination; vault import → encrypted staging → upload, 409 duplicates, cancel, offline open without network, checksum mismatch, deletion; auth bootstrap online/offline/expired grant, revoked and deleted accounts, sign-out wipe vs keep-encrypted, encrypted session storage.
- **`tests/components`** – roles/labels/states for buttons, checkbox (44 pt target), fields, chips, progress; mascot event reactions; **WCAG AA contrast** of both themes; reduced motion.
- **`tests/server`** – RLS isolation on every table, anon denial, composite-FK cross-user references, ownership immutability, `sync_push` idempotency / LWW / tie-break / clock clamping / per-op rejection / batch limits, document validation, storage quota, folder cycles, private bucket + prefix policies, cascade on account deletion.

Not automated here: end-to-end runs on devices (consider Maestro flows against a dev build), the Deno edge function, and live Supabase.

## Project layout

```
src/
  app/                 Expo Router routes (auth group, tabs, tasks, documents, settings)
  components/          design-system components (Button, Card, Sheet, Toast, States…)
  features/
    animation/         Kora: event store, vector renderer, Rive bridge
    auth/              auth service, offline grant, cleanup, schemas
    documents/         vault service, file validation, paths, UI
    profile/           profile + zero-knowledge setup
    security/          biometric app lock
    sync/              sync engine, remote, service, badge
    tasks/             task service, recurrence, form, row
  database/            SQLite facade (serialized transactions), schema, change bus
  repositories/        SQL repositories + sync queue
  services/            supabase client, encryption, notifications, query client
  stores/              zustand stores (preferences, network, transfers)
  theme/               tokens + ThemeProvider
supabase/              migrations, edge function, templates, config
tests/                 unit · integration · components · server (PGlite)
```

## Adding the Rive character

`src/features/animation/mascotConfig.ts` documents the contract: export `assets/rive/kora.riv` with a state machine **`Kora`** exposing a number input `mood` (0–9), a trigger `react` and a boolean `reducedMotion`; set `RIVE_ENABLED = true`, uncomment the `require`, rebuild the dev client. Until then the vector Kora (blink, breathe, float, wave, hop, confetti, expressions per mood) is used everywhere.

## Known limitations & remaining work

- **No live backend verification.** Auth, Storage uploads and the edge function were exercised only with mocks / PGlite. Run the app against a dev Supabase project before release.
- **No native builds produced** in this environment; Android/iOS were validated at the JS-bundle level only.
- **Offline access cannot detect revocation** (password change, account disabled/deleted) until the device is online again; then the app signs out (and wipes, for deleted accounts).
- **Row-level last-writer-wins.** Concurrent edits to *different fields* of the same task on two offline devices keep only the newer row. Device clock skew is bounded by a server clamp (+5 min) but a slow clock can lose.
- **Pull cursor** relies on server `updated_at` with a 5 s overlap window; a transaction committing more than 5 s late could be missed until that row changes again.
- **Storage object cleanup** after deletes is client-driven (queued `delete_object` jobs). Orphans can remain if a device is wiped before the job runs — add a scheduled server job that removes objects without a live `documents` row.
- **Office/PDF preview** uses the platform viewer (`File.preview()` / share sheet); inline previews exist for images, text and CSV.
- **E2EE mode**: server-side MIME checks can only see `application/octet-stream`; a forgotten vault passphrase means permanent loss of those files.
- Privacy text in `src/app/privacy.tsx` is a plain-language draft — have it reviewed and add a contact address.
- `npm audit` reports advisories in Expo CLI build tooling (`node-forge`, a nested `zod`); they are not in the app bundle. Re-audit when upgrading.
