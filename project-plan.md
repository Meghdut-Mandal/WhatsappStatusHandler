Nice — I’ll write a complete **project plan & architecture document** for a Next.js app that lets users upload photos/videos to WhatsApp *without compressing them*, using the Baileys socket library, stores credentials in a local SQLite DB, and presents a clean UI for QR login + selecting media to post to WhatsApp Status.

I used the official Baileys documentation and up-to-date community resources to make sure recommendations avoid deprecated libraries and follow current best practices. Key references are cited inline for the most important facts (QR pairing & socket API, media sending behavior, streaming media support, Next.js upload best practices, and sqlite + Prisma guidance). ([baileys.wiki][1], [npm][2], [GitHub][3], [robinwieruch.de][4])

---

# Project summary

**Goal:** Build a Next.js app (user-run, local-first) that lets a user authenticate a WhatsApp session by scanning a QR code, then choose one or multiple photos/videos and post them to WhatsApp *status* (or send to contacts) with no additional compression applied by the app. The app uses `@whiskeysockets/baileys` (Baileys) for WhatsApp Web protocol, persists session/credential data in a local SQLite database (Prisma recommended), and streams media to WhatsApp to avoid loading whole files into memory.

**Non-goals:** A hosted cloud WhatsApp gateway (this design assumes the user runs the app locally or on a trusted machine). Not a full messaging client — focus is on media upload → WhatsApp status/send.

---

# High-level architecture (textual)

Clients (browser UI) ↔ Next.js server (App Router API routes / server actions) ↔ Baileys Socket (Node process inside same Next.js server) ↔ WhatsApp Web

Components:

1. **Frontend (Next.js React UI / App Router)**

    * QR login view (render QR from server).
    * Media selection UI with large-file support (drag/drop, multi-file, progress, preview).
    * Settings (choose send as Status vs send to contacts, toggles for keep-original, metadata/caption).
    * Activity / history view showing recent sends, status of the Baileys connection.

2. **Server (Next.js server-side routes / server functions)**

    * **Socket Manager**: one long-lived Node process/module that manages a Baileys socket instance (connect/disconnect, session restore), exposes an internal API for enqueueing media sends. Uses Baileys multi-device QR pairing flow. ([baileys.wiki][1])
    * **Upload Handler**: streaming multipart upload endpoint that writes minimal metadata to DB and either streams the file straight to the Baileys send call (preferred) or to a temporary file store (if streaming not possible). Use streaming to avoid memory pressure. Baileys explicitly supports `stream` or `url` for media. ([npm][2], [baileys.wiki][5])
    * **DB layer**: Prisma (or direct better-sqlite3) talking to a local SQLite file; stores sessions, device info, send history, and minimal metadata about cached media. Recommend encrypting sensitive blobs if present. ([robinwieruch.de][4])

3. **Local Storage**

    * `./data/wa_sessions.sqlite` — SQLite DB file (Prisma-managed).
    * `./tmp/uploads/` — ephemeral storage for uploads (only if needed). Prefer streaming so temp files are rare.

4. **Process / Host**

    * App runs as a local Node process (e.g., `next start`) on the user machine (or dedicated server owned by the user). Because Baileys mimics a WhatsApp Web client, it must be able to persist auth state locally and keep an active WebSocket.

---

# Important technical constraints & choices (with rationale & references)

1. **Baileys for WhatsApp Web socket** — use the actively maintained `@whiskeysockets/baileys` (Baileys) library; it supports QR pairing, connection events, and streaming media uploads (stream / url / buffer). This avoids deprecated browser-automation approaches. ([npm][6], [baileys.wiki][7])

2. **Sending media without compression** — to keep media unmodified:

    * Avoid any server-side re-encoding or resizing. Send raw file bytes as-is (Baileys allows Buffer/Stream/Url and will encrypt and upload the file to WhatsApp servers). Use the native MIME type and set the message so WhatsApp treats as media (not reprocessed by server-side resizing). Baileys docs mention passing stream/url to avoid in-memory buffering and preserve content. ([npm][2], [baileys.wiki][5])
    * Note: WhatsApp/WhatsApp Web historically applied transformations in some UI flows; use the “send as file/document” option when needed (if wanting to absolutely avoid any resizing/thumbnailing by WhatsApp clients). In many cases sending as media with original bytes and correct mimetype is enough; test empirically. (WhatsApp also has an HD media option for clients.) ([WhatsApp Help Center][8])

3. **Large uploads & memory** — stream files from client to server and from server to Baileys, *do not* load whole file into Node memory. Baileys supports streaming URLs/streams and will encrypt as a readable stream — this is essential for large videos. Next.js server-side should use streaming parsing (busboy / formidable / built-in node parser in route handlers) or implement direct-to-storage / presigned URLs if desired. See Next.js community guidance on streaming / large-file best practices. ([GitHub][3], [Reddit][9])

4. **SQLite storage** — use Prisma (ORM) or `better-sqlite3` as the DB driver. Prisma + SQLite works great for local-first apps and makes schema management straightforward. Keep only small artifacts in DB (session auth JSON, metadata, not the heavy media blobs). Protect the DB file via filesystem permissions and optional encryption at rest. ([robinwieruch.de][4], [GitHub][10])

5. **Avoid deprecated libs** — use actively maintained libraries:

    * `@whiskeysockets/baileys` (Baileys) — preferred. ([npm][6])
    * For DB: `prisma` (with `sqlite`) or `better-sqlite3`.
    * For streaming uploads: `busboy` or native streaming in Node (avoid libraries that buffer entire files by default). (See Next.js community discussions.) ([GitHub][3])

---

# UX / UI design (high-level)

Design goals: minimal, clear, and safe — user should be able to login (QR), pick files, preview, and send with confidence.

Screens / flows:

1. **Landing / Connection screen**

    * Big QR panel (server provides base64 QR drop-in). Status indicator: "Not connected / Scanning / Connected (phone) / Reconnect required". Show last connected phone number if available.

2. **Media selection modal / page**

    * Drag-and-drop area with file list, thumbnails (image/video poster), file size and MIME type shown.
    * Show "Original size preserved" note and an optional checkbox: "Send as file (no WhatsApp preview / downloadable file)" — for absolute no-transcode.
    * Per-file caption input. Bulk caption optional.

3. **Send target pick**

    * Choose: “My Status / Contact / Group (search)”. For status, show preview of how status will look. For multi-file status, show order control.

4. **Progress & history**

    * Per-file upload progress (client → app) and send progress (app → Baileys → WhatsApp).
    * Send result with message ID, timestamp, and small thumbnail. Persist in history.

5. **Settings**

    * Toggle for storing session automatically. Option to export / import session. Database encryption toggle (if implemented). Local logs & clearing cache.

UI notes: accessible, mobile-friendly, large actionable buttons. Use progressive enhancement: if an upload fails due to size/network, show clear retry/resume options.

---

# Data model (conceptual)

Tables (examples — exact schema via Prisma):

* `Session` — id, deviceName, createdAt, authBlob (encrypted JSON), lastSeenAt, isActive
* `SendHistory` — id, sessionId, targetType (status/contact), targetIdentifier, files\[] (metadata), status (queued/sent/failed), createdAt, completedAt
* `MediaMeta` — id, filename, mimetype, sizeBytes, storagePath (nullable), sha256, tmpCreatedAt

*(Don't store raw file bytes in DB.)*

---

# File / repository layout (no code, only names)

```
next-wa-uncompressed/
├─ app/                      # Next.js App Router pages & server actions
│  ├─ (ui)/                  # React UI components
│  ├─ api/                   # API routes (upload, session, send)
│  └─ globals.css
├─ src/
│  ├─ lib/
│  │  ├─ socketManager/      # Baileys wrapper (connect, qr events, session restore)
│  │  ├─ uploader/           # streaming upload helpers
│  │  └─ db/                 # Prisma client or DB access layer
│  ├─ pages/                 # optional pages if using pages router
│  └─ components/            # UI components: QRPanel, FilePicker, Progress, History
├─ prisma/
│  └─ schema.prisma          # Prisma schema (sqlite)
├─ scripts/
│  └─ migrate.sh
├─ data/
│  └─ wa_sessions.sqlite     # local sqlite DB (gitignored)
├─ tmp/
│  └─ uploads/               # ephemeral uploads (gitignored)
├─ public/
│  └─ icons/
├─ package.json
├─ README.md
└─ .env                      # store local config (gitignored)
```

---

# Key flows (detailed)

1. **App start & QR pairing**

    * Server starts socket manager. If session exists, attempt restore; if not, create a new Baileys socket and emit `connection.update` events. The server exposes an API route that returns the QR (SVG/base64) to the UI for scanning. The UI polls/streams connection state and instructs user to scan. (Baileys supports QR pairing and exposes the QR string/event.) ([baileys.wiki][1])

2. **Upload & stream-to-Baileys**

    * User picks file(s) → browser uploads to server via streaming multipart/form-data to `POST /api/upload`. The server uses a streaming parser to pipe data either directly into Baileys send call (stream) or to a temporary file if necessary. Using Baileys' stream/url input prevents buffering large files fully in memory. ([npm][2], [baileys.wiki][5])

3. **Send to Status**

    * For status: server uses the Baileys API for media messages targeted to the user's status endpoint (or uses the API to update status). If there's a need to ensure "no compression", provide an option to send as document (if that preserves original bitstreams). Test both approaches to determine which consistently leaves files unchanged across WhatsApp clients. ([WhatsApp Help Center][8])

4. **Persisting sessions & DB**

    * After successful pairing, persist auth state to SQLite (Prisma-managed). On reconnect, read session and re-initialize socket. Periodically compact or backup DB.

---

# Security & privacy

* **Local-first** — all sensitive data stays on the user's machine. Make this explicit in UI and docs.
* **DB protection** — do not store unencrypted secrets in plaintext unless user opts-in. Provide optional encryption for the `authBlob` with a user passphrase (derived key). Secure filesystem permissions (600).
* **Temporary media cleanup** — purge `tmp/uploads` after successful send and after a configurable TTL.
* **Input validation** — validate file MIME and size on the client and server. Sanitize captions and metadata to prevent injection in UI logs.
* **Rate limiting & errors** — surfacing WhatsApp errors to the user is important (e.g., session invalid, blocked, rate-limited). Provide retries with exponential backoff for transient errors.

---

# Testing plan

* **Unit tests**: DB layer, socket manager event handlers (mocked socket).
* **Integration tests**: E2E test of the QR flow (manual), upload pipeline (small file), and media send pipeline (mock a test recipient or a self-contact).
* **Manual QA**: test real-world scenarios: large 4K video, 0.5–1GB files, multiple concurrent files, intermittent network. Verify resulting media on different WhatsApp clients (Android, iOS, Desktop) to confirm no unexpected recompression/preview loss.
* **Security tests**: check DB file permissions, confirm temporary files are deleted.

---

# Deployment & run strategy

* **Local dev**: `pnpm`/`npm` for running Next.js in dev mode. DB file lives in `./data/`. Keep `.env` secret.
* **Production**: run as system service (systemd) on a trusted host or local desktop. The host must be online for the Baileys socket to remain connected. For true offline-first, wrap the app in an Electron shell (optional) to provide a more native UX and auto-start.
* **Backups**: export/import session feature to allow users to move sessions between machines.

---

# Milestones & rough timeline (example for a small team / solo dev)

1. Week 0–1: Project setup, repo, Prisma schema, basic Next.js UI skeleton, install Baileys and experiment with QR pairing (proof-of-concept).
2. Week 2: Build socket manager, persistent session store (SQLite), display QR in UI, implement connect/disconnect states.
3. Week 3: Implement streaming upload pipeline and integration with Baileys send (small files). Add send-as-status path.
4. Week 4: Large-file streaming support, progress UI, robust error handling & retries.
5. Week 5: UX polish (history, settings), DB encryption option, e2e testing across real WhatsApp clients.
6. Week 6: Documentation, packaging (optionally Electron), release & user testing.

(Adjust estimates for complexity, QA, and legal/compliance review where applicable.)

---

# Risks & mitigations

* **WhatsApp protocol changes / blocking** — Baileys mirrors WhatsApp Web; changes or blocking can temporarily break the app. Mitigation: track Baileys releases, implement graceful error handling and session recovery, and inform users. ([npm][6])
* **Media transformed by WhatsApp clients** — even if you send original bytes, some WhatsApp clients may create preview thumbnails or perform client-side re-encoding when viewing; provide "send as file/document" option as fallback. Test across clients. ([WhatsApp Help Center][8])
* **Memory/CPU for big files** — streaming is mandatory. If local disk space is small, offer chunked uploads / resumable uploads or direct-to-cloud presigned URL (if the user wants cloud intermediate). ([GitHub][3])

---

# Implementation checklist (practical)

* [ ] Create Next.js app (App Router) skeleton.
* [ ] Add Prisma with SQLite schema and initial migrations. ([robinwieruch.de][4])
* [ ] Implement SocketManager module (wrapping Baileys). Use stable APIs for connection.update/qr events. ([baileys.wiki][1])
* [ ] Build streaming upload endpoints (busboy / native streaming). Ensure server can pipe to Baileys. ([npm][2], [GitHub][3])
* [ ] UI: QR page, file picker, send confirmation, progress, history.
* [ ] Security: DB encryption of auth blob, file cleanup, permission hardening.
* [ ] Testing across Android/iOS/Desktop WhatsApp to verify "no compression".
* [ ] Packaging docs + optional Electron wrapper.

---

# Closing / recommended references (selected)

* Baileys Socket docs — connecting / QR pairing / configuration. ([baileys.wiki][1])
* Baileys Sending Messages — media message examples and stream/url support. ([baileys.wiki][5], [npm][2])
* `@whiskeysockets/baileys` package notes (active maintenance). ([npm][6])
* Next.js community discussion on large-file uploads & streaming best practices. ([GitHub][3])
* Next.js + Prisma + SQLite practical guide. ([robinwieruch.de][4])
* WhatsApp HD media (client-side setting and behavior). ([WhatsApp Help Center][8])


[1]: https://baileys.wiki/docs/socket/connecting?utm_source=chatgpt.com "Connecting | Baileys"
[2]: https://www.npmjs.com/package/baileys?utm_source=chatgpt.com "baileys - NPM"
[3]: https://github.com/vercel/next.js/discussions/70078?utm_source=chatgpt.com "Best Practices for Uploading Large Videos (Server side directly to ..."
[4]: https://www.robinwieruch.de/next-prisma-sqlite/?utm_source=chatgpt.com "Next.js with Prisma and SQLite - Robin Wieruch"
[5]: https://baileys.wiki/docs/socket/sending-messages?utm_source=chatgpt.com "Sending Messages | Baileys"
[6]: https://www.npmjs.com/package/%40whiskeysockets/baileys?utm_source=chatgpt.com "whiskeysockets/baileys - NPM"
[7]: https://baileys.wiki/docs/category/socket?utm_source=chatgpt.com "Socket - Baileys"
[8]: https://faq.whatsapp.com/759301289012856?utm_source=chatgpt.com "About HD photos and videos | WhatsApp Help Center"
[9]: https://www.reddit.com/r/nextjs/comments/1cc7w0d/handling_large_file_uploads_in_nextjs_13/?utm_source=chatgpt.com "Handling large file uploads in Next.js 13+ : r/nextjs - Reddit"
[10]: https://github.com/prisma/prisma/issues/2825?utm_source=chatgpt.com "use better-sqlite3 as sqlite database driver (or provide the option)"
