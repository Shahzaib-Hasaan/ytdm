# YTDM — YouTube Download Manager

IDM-style desktop download manager specialized for YouTube. Windows-first, built on Electron + TypeScript. See [TECH_STACK.md](TECH_STACK.md) for the full R&D report and locked architecture.

## Install (users)

Grab the latest `YTDM Setup x.y.z.exe` from Releases and run it. That's the whole setup —
on first launch the app downloads its own engine (yt-dlp, Deno, ffmpeg) automatically and
keeps it updated from then on.

**"Windows protected your PC"?** The installer isn't code-signed (certificates cost money),
so SmartScreen shows a warning the first time: click **More info → Run anyway**. The warning
fades as more people install the same release. The source is public — audit it, or build the
installer yourself with `npm run dist`.

## Support / Contact

Built by **Shahzaib Hassan** · <shahxeebhassan@gmail.com> · [shahzaibbuilds.me](https://shahzaibbuilds.me) · [LinkedIn](https://www.linkedin.com/in/shahzaib-hassan-ai-developer/)

Found a bug or want a feature? Open an issue on this repo or email me. Please include the
error text from the row's status chip (hover it) when reporting download failures.

## Dev

```bash
npm install
npm run dev        # hot-reload dev app
npm run typecheck  # tsc --noEmit
npm run build      # bundle main/preload/renderer to out/
npm run dist       # build + NSIS installer (electron-builder)
```

## How it works

- On first launch the app downloads its worker binaries into `%APPDATA%/yt-downloader/bin`:
  - `yt-dlp.exe` (nightly channel — auto-updates on every launch; YouTube breaks extraction constantly)
  - `deno.exe` (mandatory JS runtime for yt-dlp's nsig challenge solving)
  - `ffmpeg.exe` (LGPL build, used for lossless DASH video+audio merge; system PATH ffmpeg is used if present)
- Downloads run as supervised `yt-dlp` child processes with NDJSON progress (`--progress-template`), 4 concurrent fragments by default, `.part`-file resume on pause.
- Queue persists in SQLite (`node:sqlite`, WAL) at `%APPDATA%/yt-downloader/downloads.db`; interrupted jobs re-queue on next start.
- Clipboard watcher (750ms poll) catches copied YouTube URLs and opens the add dialog.

## Current feature status (MVP)

- [x] Paste/clipboard URL intake, probe, quality presets (MP4/best/1080p/720p/M4A/MP3)
- [x] Playlist probe + per-video selection
- [x] Queue: 1–4 parallel, pause/resume/cancel/retry with backoff, crash recovery
- [x] Global speed limit (split across slots), per-download fragment concurrency
- [x] Embed thumbnail/metadata/subs toggles
- [x] Binary bootstrap + yt-dlp nightly self-update
- [ ] Browser extension (native messaging) — v2
- [ ] Scheduler, categories, subscriptions, SponsorBlock — v2
- [ ] aria2 generic-HTTP leg, PO-token provider sidecar — v2

## Troubleshooting

- If `npx electron .` prints `TypeError: Cannot read properties of undefined (reading 'requestSingleInstanceLock')`, the `ELECTRON_RUN_AS_NODE` env var is set (some editor-spawned terminals do this) — clear it first: `Remove-Item Env:\ELECTRON_RUN_AS_NODE`.
- The app is single-instance: close the running window before starting `npm run dev`, or the new instance exits immediately.

## Note

Downloading YouTube content may violate YouTube's Terms of Service. Use for your own
content, Creative Commons material, or where you otherwise have the right to download.
