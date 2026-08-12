# YouTube Download Manager — R&D Report & Locked Tech Stack

**Date:** 2026-08-11 · **Target:** Windows-first desktop app, IDM-style, YouTube-specialized (browser extension, playlist support, queue, pause/resume, acceleration, scheduler, speed limiter, clipboard monitoring).
**Developer profile:** strong TypeScript/JavaScript + Python, zero Rust.
**Method:** comparative research across six areas (framework, extraction, download engine, browser extension, packaging, feature map) with primary sources reviewed for each; sources listed at the bottom of each section.

---

## 1. The Locked Stack

| Layer | Decision | Why |
|---|---|---|
| App framework | **Electron v42.x** (pin latest stable at kickoff), scaffolded with **electron-vite**; all engine logic in the main process as a UI-agnostic module | Every hard part of this app is child-process supervision + high-frequency stdout streaming — pure TypeScript in Electron, repeated Rust-seam crossings in Tauri. Direct precedents to copy: Motrix (Electron+aria2), Stacher (Electron+yt-dlp). |
| UI | **React 19 + TypeScript + Tailwind CSS + shadcn/ui**, **Zustand** for queue state; tray-resident, single-instance | Dense IDM-style table UI is shadcn's sweet spot; Zustand handles high-churn progress state without ceremony. |
| Extraction | **yt-dlp.exe (nightly channel) as a subprocess — never as a Python library.** `deno.exe` beside it (mandatory JS runtime since yt-dlp 2025.11.12), **bgutil-ytdlp-pot-provider** plugin zip in `yt-dlp-plugins/` for PO tokens. All three live in `%APPDATA%` (writable), **downloaded on first run** and updated by an app-owned updater | yt-dlp is the only stack with the fix-latency to survive YouTube. Download-on-first-run sidesteps GPLv3 redistribution of the PyInstaller exe AND the AV false-positive surface. |
| YouTube transfer engine | **yt-dlp is the SOLE transfer engine for YouTube**: `-N 4-8` concurrent fragments (+ `--extractor-args youtube:formats=dashy` while it works), `--limit-rate` per job, `-c` for resume, `--progress-template` NDJSON + `--newline` parsed in main. Pause = kill child; resume = respawn. Behind a `JobRunner` interface (`YtDlpRunner \| Aria2Runner`) | Feeding extracted googlevideo URLs to aria2 fights PO-token/session/IP binding, ~6h URL expiry, and the SABR endgame — for a speed win yt-dlp's fragment concurrency mostly matches. |
| Generic HTTP engine (the true IDM-parity leg) | One long-lived bundled **aria2c 1.37.0 daemon** (`--enable-rpc --rpc-secret --save-session`) over **JSON-RPC WebSocket**, used ONLY for non-YouTube direct URLs: 8 conn/server, pause/unpause/tellStatus, `changeOption` per-job caps, `changeGlobalOption` global limiter | Segmented multi-connection download + control-file resume + live-tunable global cap in a battle-tested binary. Isolated to non-YouTube traffic so its dormancy (last release Nov 2023) can never kill the core product; droppable behind JobRunner. |
| Mux / post-processing | **BtbN LGPL ffmpeg build** via extraResources; lossless `ffmpeg -c copy` merge (MKV for VP9/Opus, MP4 for h264/av1+m4a); yt-dlp drives `--embed-thumbnail/--embed-metadata/--embed-chapters/--embed-subs`/SponsorBlock | LGPL build avoids GPL contamination and H.264/H.265 patent-pool exposure (remuxing does no encoding). |
| IPC | Main process parses sidecar NDJSON, coalesces per-job state, pushes **batched snapshots via `webContents.send` at ~10Hz**; `contextIsolation` on, typed preload bridge, no `nodeIntegration` | Keeps 20 concurrent downloads smooth without IPC flooding; standard Electron security posture. |
| Persistence | **SQLite via `node:sqlite`** (built into Electron's Node ≥22 — zero native-rebuild treadmill), WAL mode, single `downloads.db` in userData (jobs w/ UNIQUE videoId, playlists, history) behind a thin DAO; **electron-store** JSON for preferences only; crash recovery re-queues `active` rows on boot | Atomic multi-row transitions + dedup queries JSON can't do. DAO makes a swap to better-sqlite3 trivial if node:sqlite's RC-grade API shifts. |
| Browser extension | **MV3 + Chrome Native Messaging** (the IDM/FDM/VDH pattern). One codebase, three builds. Tiny **forwarder exe compiled from Node** (`pkg`/`bun build --compile`) speaks the 4-byte-length stdio protocol, relays to app over named pipe, launches app if absent. NSIS writes registry keys for Chrome/Edge/Firefox + "repair integration" function. **Extension sends watch URLs / video IDs only — never captured googlevideo URLs** | Native messaging beats a localhost server: Chrome 142 Local Network Access, unauthenticated-port attack surface, and inability to launch a dead app. connectNative also keeps the MV3 service worker alive. |
| Extension distribution | **Two tiers.** Tier 1: policy-clean generic "send downloads to app" bridge on **Chrome Web Store** — zero YouTube wording/UI (CWS explicitly bans YouTube downloaders; VDH confirms). Tier 2: full YouTube-button build on **Firefox AMO + Edge Add-ons** + self-hosted AMO-signed unlisted XPI; unpacked dev-mode instructions for Chrome power users. **Clipboard polling (~750ms, opt-out) is the universal fallback** | This is exactly the posture that keeps IDM's and FDM's extensions listed while VDH ships YouTube support on Firefox only. |
| Packaging / signing / updates | **electron-builder v26.15.x pinned** (NSIS, `oneClick:false`) + **electron-updater** with NSIS differential updates against a **public releases-only GitHub repo** (code stays private). Sign exe+installer+uninstaller via **Azure Artifact Signing Basic ($9.99/mo)** if an eligible US/CA/EU/UK entity exists, else **OV cloud cert (~$250/yr)**. **Skip EV** — no SmartScreen benefit since 2024. `Licenses/` folder: LGPL-2.1 notice + source link (ffmpeg), GPLv2 COPYING + source offer (aria2) | Only mature Windows delta-update story; signing choice is purely an eligibility question. Arms-length `exec()` of GPL binaries keeps the closed-source app clean (mere aggregation). |

### Rejected (and why)

- **Tauri v2** — all six researchers converged: sidecar supervision, high-frequency progress (Tauri's event system is documented as not for high throughput), clipboard watching (official plugin has no change listener), and delta updates (none) all cross the Rust seam. Its size win is erased by the ~100MB ffmpeg payload anyway. Revisit only if a <10MB installer becomes a hard requirement.
- **aria2 as the YouTube fast path** — internally contradicted by extraction research; yt-dlp itself removed aria2c for dash/m3u8 (May 2026); SABR makes it a dead end.
- **`yt-dlp --downloader aria2c` mode** — no pause API, RPC progress disabled since Jan 2023.
- **Capturing googlevideo URLs in the extension** (classic IDM sniffing) — session/IP/PO-token-bound, ~6h expiry → intermittent 403s. Hand off video IDs, re-extract locally.
- **Bundling yt-dlp.exe in the installer** — GPLv3+ redistribution obligations (PyInstaller combined work) + AV false-positive magnet.
- **Chrome cookie extraction on Windows** — app-bound encryption (Chrome 127+) defeated every approach (DPAPI, CDP, rookiepy). Firefox `--cookies-from-browser` or user-exported cookies.txt only, opt-in with account-flag warning.
- **youtube.js as primary engine** — you inherit every YouTube breakage with no update channel. Keep as researched contingency (its `googlevideo` package already implements SABR/UMP).
- **EV cert, JSON-file queue, better-sqlite3 first (rebuild treadmill), Microsoft Store, electron-builder v27 pre-release, localhost WebSocket as extension channel, custom Node multi-connection downloader.**

---

## 2. Architecture

```
┌────────────────────────── Electron app (TypeScript) ──────────────────────────┐
│  Renderer (React+shadcn)  ◄── batched snapshots, 10Hz ──  Main process        │
│  queue UI / quality picker                                 ├─ Engine module   │
│                                                            │   JobRunner:     │
│                                                            │   YtDlpRunner ───┼── spawn ──► yt-dlp.exe (+deno.exe, POT plugin)
│                                                            │   Aria2Runner ───┼── JSON-RPC WS ──► aria2c daemon (non-YouTube)
│                                                            ├─ ffmpeg mux step │
│                                                            ├─ SQLite (node:sqlite, WAL)
│                                                            ├─ Clipboard poller (750ms)
│                                                            ├─ Named-pipe server ◄── forwarder.exe ◄── stdio ◄── browser (native messaging)
│                                                            └─ Binary updater (yt-dlp nightly + Deno + POT, SHA-256, atomic swap, rollback)
└───────────────────────────────────────────────────────────────────────────────┘
MV3 extension (Chrome/Edge/Firefox builds): content script on youtube.com
(yt-navigate-finish events, /watch /shorts /playlist detection) → service worker
→ connectNative → forwarder.exe → app. Sends WATCH URLs only.
```

**Job flow (YouTube):** intake (extension / clipboard / paste) → `yt-dlp -J` probe (`--flat-playlist` for playlists) → quality picker (`bv*+ba/b` presets) → queue (SQLite) → YtDlpRunner spawn with NDJSON progress → ffmpeg `-c copy` merge → post-processing (thumbnail/metadata/subs/SponsorBlock) → done. Errors classified: nsig/SABR/signature failure → trigger binary updater + retry; private/geo/age → surface to user.

**yt-dlp updater is survival-critical, not polish:** check nightly channel (yt-dlp/yt-dlp-nightly-builds) on launch + every 12–24h, verify `SHA2-256SUMS`, download to temp, atomic swap when no download active, keep rollback copy, post-update health-check extraction with auto-rollback. Treat yt-dlp + yt-dlp-ejs (version-pinned inside exe) + Deno + POT provider as **one versioned set** — piecemeal updates self-break.

---

## 3. Key 2026 Realities (constraints that shaped the lock)

1. **SABR is the existential risk.** YouTube is migrating clients to SABR (server-controlled POST/UMP streaming). External downloaders can never speak it; yt-dlp's SABR downloader (PR #13515) supports neither `-N` concurrency, `--rate-limit`, nor (per some reports) resume. Current dodge: non-SABR clients (tv, android_vr, web_embedded). When those close, multi-connection acceleration for YouTube dies **on YouTube's timetable**. Hence the JobRunner abstraction — flip default runner without touching queue/UI. Note: researchers disagreed whether #13515 is merged (one said July 2026) or still open — **verify at dev kickoff**.
2. **yt-dlp now needs a JS runtime.** Since 2025.11.12, Deno 2+ (recommended) is required for nsig challenge solving; without it YouTube support is crippled. Bundle `deno.exe` next to `yt-dlp.exe` (auto-discovered on Windows).
3. **PO tokens are table stakes.** BotGuard attestation tokens required for streaming on web clients, content-bound per video. Fix: bgutil-ytdlp-pot-provider (HTTP-server mode; TS original vs recommended Rust build `bgutil-ytdlp-pot-provider-rs` — benchmark both).
4. **Multi-connection still works today**: googlevideo HTTPS formats accept Range requests; YouTube paces per-connection, so parallelism helps (reports: 0.5 → 9 MB/s with 16 conns). yt-dlp's own downloader chunks at 10 MiB for this reason. Keep 4–8 connections; 16 raises 403/flag risk.
5. **Store policy, not tech, constrains the extension.** CWS prohibits facilitating YouTube downloads (enforced; account bans possible). Firefox AMO allows it (VDH v8 ships it, ~1.8M users). Edge is permissive in practice, not by policy — bonus, not a pillar.
6. **Cookies:** Firefox works (`--cookies-from-browser firefox`); Chrome is cryptographically closed on Windows. Logged-in cookie downloading risks account flags — default anonymous, cookies opt-in per job.
7. **IP safety:** ~20–50 rapid extractions can trigger "confirm you're not a bot" even residentially. Default 2–3 concurrent videos, `--sleep-requests` pacing in playlist/subscription features from day one.
8. **Licensing (closed-source-safe by construction):** everything invoked via `exec()` as separate processes = GPL "mere aggregation". ffmpeg LGPL build (BtbN), aria2 GPLv2 (ship COPYING + source offer if bundled), yt-dlp source Unlicense but official exe is GPLv3+ (avoided by download-on-first-run). Never link libaria2 / avlib / import yt-dlp as library — one convenience import creates a derivative work.
9. **Signing:** EV buys nothing since 2024. Azure Artifact Signing $9.99/mo (US/CA individuals or US/CA/EU/UK orgs). Cert lifetimes cap at 459 days from Feb 2026. SmartScreen cold start is unavoidable — soft launch + Microsoft file submissions.
10. **ToS/monetization:** downloading violates YouTube ToS; payment processors, ad networks, MS Store routinely refuse such products. Validate monetization **before** building it in.

---

## 4. Roadmap

### MVP (ship first)
1. URL intake: paste box + clipboard watcher (regex: watch/shorts/playlist/channel/youtu.be, dedupe).
2. `-J` probe → quality picker presets (Best MP4 `bv*[vcodec^=avc1]+ba` / Best any / 1080p / 720p / audio-only m4a/mp3); raw format table behind "advanced".
3. Queue engine: SQLite-persisted, 2–3 concurrent children, pause (kill; `.part` resumes) / resume / retry-with-backoff, crash recovery on boot.
4. Playlist ingestion (`--flat-playlist -J`, range/select-all UI) + `--download-archive` skip-already-downloaded.
5. Per-download `--limit-rate` + global cap (budget divided across active jobs).
6. Embed toggles (thumbnail/metadata/subs/chapters) + output filename template.
7. `-N 4` default (the acceleration story).
8. Cookies opt-in via Firefox.
9. **yt-dlp self-update on launch (nightly) + clear error surfacing.**
10. NSIS installer, single-instance lock, tray.

### V2
Browser extension (two-tier distribution as locked) + native-messaging host in installer · scheduler (active-hours, post-queue shutdown) · channel/playlist subscriptions (`--dateafter`, `--match-filter`) · SponsorBlock UI · POT provider sidecar (promote to fast-follower if bot-checks hit at launch) · aria2 generic-HTTP leg → true IDM parity · categories + per-category folders · history browser · global bandwidth manager · macOS/Linux.

### Deprioritized
Multi-connection as a *headline* YouTube feature (SABR is killing it), virus-scan hook, whole-site grabber.

---

## 5. Open Questions / Week-1 Spikes

1. **SABR downloader status** — check yt-dlp PR #13515 merged-vs-open at kickoff; decides how much `-N`/rate-limit UI is YouTube-facing.
2. **Signing eligibility** — individual vs entity, which country? Picks Azure ($9.99/mo) vs OV (~$250/yr).
3. **Mozilla unlisted-signing probe** — submit a throwaway XPI with a YouTube button week 1–2; cheap test of the Tier-2 plan.
4. **POT provider flavor** — TS-under-Electron-Node vs Rust binary; benchmark token throughput at 3 concurrent downloads.
5. **node:sqlite stability** — verify un-flagged in pinned Electron's Node + WAL crash-recovery test; else flip DAO to better-sqlite3.
6. **aria2 worth it?** — does `-x8` beat `yt-dlp -N 8 --extractor-args youtube:formats=dashy` on non-YouTube hosts users actually hit? If not, cut aria2 + its GPLv2 payload entirely.
7. **24h engine spike before UI build-out** — 10 concurrent mixed downloads through the main-process skeleton; measure 403 rates, expiry-resume, NDJSON overhead, memory.

---

## 6. Source Highlights

- Framework: pkgpulse Electron-vs-Tauri 2026, DoltHub migration write-up (Nov 2025), Tauri sidecar/event docs, Motrix, Stacher, endoflife.date/electron
- Extraction: yt-dlp issues #15012 (JS runtime), #14390/#13968/#15689 (SABR), PR #13515 (SABR downloader), PO-Token-Guide wiki, bgutil-ytdlp-pot-provider (+ `-rs`), yt-dlp-nightly-builds
- Engine: yt-dlp #14765 (10MiB chunking rationale), #14229 (throttling/aria2 speedups), PR #11698 (aria2 resume fix, merged 2026-06-29), aria2 manual (JSON-RPC), aria2 releases (1.37.0 = Nov 2023)
- Extension: Chrome/MDN/Edge native-messaging docs, CWS troubleshooting policy, VDH Q&A ("Google does not allow…"), vdhcoapp, Chrome 142 Local Network Access, extensionworkshop self-distribution
- Packaging: Azure Artifact Signing GA pricing, ToDesktop EV-reputation PSA, electron.build code-signing/auto-update docs, ffmpeg legal, GNU GPL FAQ (mere aggregation), BtbN FFmpeg-Builds
