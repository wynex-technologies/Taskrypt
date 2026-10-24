# Taskrypt architecture

## Layers

```
Screens (src/app)  ──►  hooks/queries (TanStack Query over SQLite)
        │                         ▲ invalidated by the change bus
        ▼                         │
Feature services (taskService, vaultService, authService, syncService)
        │
Repositories (SQL) ──► database facade (serialized async mutex, real transactions)
        │                         │
        │                  expo-sqlite (device) · node:sqlite (tests)
        ▼
Sync engine ──► SyncRemote (supabase RPC + PostgREST) ──► Postgres + RLS
Vault jobs  ──► Supabase Storage (private bucket)
```

- **SQLite is the source of truth on the device.** Every screen renders from local queries, so the app behaves identically online and offline.
- **One database file per account** (`taskora_<uid>.db`). Switching accounts can never show another user's rows, and wiping is a file delete.
- **TanStack Query** caches local queries (`networkMode: 'always'`) and is invalidated by repository change events; it is *not* relied on for offline sync.
- **Zustand** holds ephemeral app state: auth status, network, preferences, sync status, transfers, mascot mood.

## Write path

`saveRecord(entity, id, patch)` runs in one SQLite transaction:

1. load the existing row, refuse if it belongs to another user;
2. stamp `user_id`, `client_updated_at` (strictly increasing per record), `last_modified_by` (device id), `sync_state = 'pending'`;
3. upsert the row;
4. enqueue a **row operation** with a **snapshot** of the server columns.

Queue rules (`syncQueueRepository`):

- a still-`pending` op for the same record is **coalesced** in place (same `op_id`);
- an `inflight` op is **never mutated** (the server may already have applied it) — a new op is appended;
- failures back off exponentially (2 s … 10 min, jittered); non-retryable errors become `failed` and surface on the Sync screen (retry / discard);
- `inflight` ops left by a crash are reset to `pending` on start (safe: ops are idempotent).

Deletes are **tombstones** (`deleted_at`) so they replicate; housekeeping hard-deletes them after 60 days.

## Sync pass (`runSync`)

1. **Binary jobs** — uploads, server-side copies, object deletions.
2. **Push** row ops in batches of 100 to `sync_push(device_id, ops)`.
3. **Pull** each table where `updated_at > cursor − 5 s`, ordered, 500 per page.
4. Push again (rows created by finished uploads).

Triggers: app start, foreground, reconnect, every 5 min while active, and 1.5 s after local writes (debounced). Optional "don't sync on mobile data" and a "work offline" switch.

### Server contract: `sync_push`

For each op (in a sub-transaction, so one bad op never aborts the batch):

| Result | Meaning | Client action |
| --- | --- | --- |
| `applied` | written; returns authoritative row | adopt row, drop op |
| `stale` | server already has a newer version | adopt server row, drop op |
| `duplicate` | `op_id` seen before (lost response, retry) | adopt current row, drop op |
| `rejected` | constraint / RLS / validation failure | mark op + row `failed` |

`user_id` is forced to `auth.uid()`; `updated_at`/`version`/`created_at` are trigger-managed; `client_updated_at` is clamped to `now() + 5 min`. Rate limit: 200 ops per call, 3000 per user per minute.

### Conflict resolution (deterministic)

> Incoming wins **iff** `(client_updated_at, last_modified_by)` is strictly greater than the stored pair.

Every device and the server compare the same pair, so all replicas converge without coordination. Deletes follow the same rule (a later edit resurrects; a later delete wins). Pulled rows are **not** applied over a record that still has a local pending op — that op will be pushed and the server decides.

### Duplicate prevention

- Every op has a UUID `op_id`, recorded in `sync_operations` → retries are idempotent.
- The next occurrence of a recurring task gets a **UUID v5** of `(series root, due date)`: two devices completing the same task offline create the *same* row.
- Task↔tag assignments use UUID v5 of `(task, tag)` plus a partial unique index.
- Uploads use immutable object keys and treat HTTP 409 "already exists" as success.

## Document vault

```
pick ─► validate (allow-list + magic bytes + size) ─► SHA-256 ─► encrypt to staging/<id>.tkv
     ─► queue 'upload' ─► (online) decrypt to temp ─► [e2ee: encrypt with DEK] ─► POST to
        storage/<uid>/<docId>/<uuid> with progress/cancel ─► staging becomes offline/<id>.tkv
     ─► metadata row pushed only after the object exists
```

- Object keys never contain user filenames; the display name is sanitised separately.
- Downloads use **60-second signed URLs**, verify the SHA-256, and are re-encrypted before touching persistent storage.
- Viewing/sharing decrypts into a random directory under the cache and is released after use; the temp root is purged at launch and sign-out.

### TKV1 encrypted file format

```
header (24 B) = "TKV1" | ver=1 | log2(chunk) | 0x0000 | salt[16]   (authenticated as AAD)
fileKey       = HKDF-SHA256(masterKey, salt, "taskora/tkv1/" + documentId)
chunk i       = AES-256-GCM(fileKey, nonce = 0^7 ‖ u32be(i) ‖ last?1:0, plaintext_i) ‖ tag
```

Fresh salt per file ⇒ unique key per file ⇒ nonces cannot repeat under a key. The STREAM-style final-chunk flag detects truncation; the counter detects reordering; the header AAD detects header edits; the document id in HKDF binds ciphertext to its record. AES-GCM runs natively through `expo-crypto` after a known-answer interoperability check against `@noble/ciphers` (used in tests and as fallback).

## Auth and offline policy

```
launch ─► getSession ─┬─ online: getUser() validates with server ─► signedIn (+ refresh grant)
                      ├─ server unreachable + grant valid ───────────► offline mode
                      └─ rejected / no session ─────────────────────► signed out
reconnect in offline mode ─► refreshSession + getUser ─► signedIn, or forced sign-out
```

The **offline grant** (`{userId, email, verifiedAt}` in SecureStore) allows opening local data for `EXPO_PUBLIC_OFFLINE_GRACE_DAYS` after the last online check. First sign-up, e-mail verification, password recovery and any server authorization always require a connection.
