# advertising-meme-maker

Local web app for turning memes into branded social media ads for Luma Tech Solutions: discover trending clips, brand them, add a call-to-action, and export ready-to-post videos.

## Features

- **Discover** — pulls trending meme candidates from curated subreddits, scores each 1–10 for brand fit with AI, and downloads your pick (also accepts pasted YouTube/TikTok/Instagram/Reddit/X links via yt-dlp).
- **AI copywriting** (needs `ANTHROPIC_API_KEY`) — generates the outro tagline, 3 scroll-stopping hook overlay options, a post caption, and an engagement-bait first comment for each meme.
- **Branding** — colors/gradient, logo library, watermark with social handle, all persisted in `brand/`.
- **Outro slides** — templated or custom headline/subhead slides rendered at export resolution.
- **Call to action** — slides can carry a button-style CTA, an offer code, and a QR code; the QR URL gets UTM tags (`utm_campaign` = job, `utm_content` = format) so you can attribute leads to a specific meme and placement.
- **Hook & effects** — opening hook text overlay, fake "buffering" freeze effect.
- **Audio** — background music library with volume, per-slide TTS voiceover (7 voices).
- **Export** — trim, aspect ratio presets (9:16 / 1:1 / 4:5 / 16:9 / source), or **Export all formats** to render 9:16 + 1:1 + 4:5 in one run. Progress streams live; outputs land in `output/`.

## Setup

```
npm run install:all
```

This installs dependencies in the root, server, and client. The server pulls down a bundled ffmpeg binary via `ffmpeg-static` (~80 MB).

To enable the AI features, copy `server/.env.example` to `server/.env` and set `ANTHROPIC_API_KEY`. Everything else works without it.

## Run (dev)

```
npm start
```

This launches the Vite client on **port 8080** and the Express server on **port 8081**. Both bind to `0.0.0.0` so you can open the app from your phone on the same Wi-Fi.

- On the dev machine: `http://localhost:8080`
- On your phone: `http://<dev-machine-LAN-ip>:8080` (Vite prints the LAN URL on startup)

If your phone can't reach the URL, allow Node through the **Windows Defender Firewall** for ports 8080 and 8081 (Private network is enough).

> Why these ports? Windows' IP Helper service (`iphlpsvc`) randomly squats unprivileged TCP ports on boot. The Vite default 5173 was a casualty on this machine. 8080/8081 are well-known and rarely affected.

## Build & serve (single port)

```
npm run build
npm run serve
```

The built client is served by Express on port 8081 — phone uses `http://<LAN-ip>:8081`.

## How it works

1. Discover a meme (or drop a video/image directly).
2. Set your brand: colors, logo, watermark, and the CTA (button text, link, offer code).
3. Pick a hook variant and tune the outro slides — the last suggested slide carries the CTA + QR.
4. Click **Export**. The server runs one ffmpeg invocation per format that scales the source + every slide PNG to identical params and concatenates them via the concat filter. Output lands in `output/`.
5. Copy the suggested caption and first comment, post, and track QR scans via the UTM tags.

## Security model

This is a **LAN-only tool with no authentication** — anyone on your network can reach it. Do not expose ports 8080/8081 to the internet.

What the server does enforce:

- API rate limits (tighter on upload/export).
- Uploaded logos/music are validated by magic bytes, not file extension.
- Pasted URLs must match an allowlist of known social video domains before yt-dlp runs.
- The auto-downloaded yt-dlp binary is verified against the release's SHA-256 manifest.
- Path-traversal guards on every user-supplied filename/job id.

Notes:

- `server/.env` holds your Anthropic API key in plaintext — keep it out of git (already ignored) and rotate it if the machine is shared.
- If you drop a `brand/cookies.txt` for Instagram/TikTok auth, treat it like a password file.
- Discover scrapes Reddit's public JSON endpoints; heavy use can get your IP temporarily blocked.

## Troubleshooting

- **Taglines/hooks/scores missing** — `ANTHROPIC_API_KEY` not set in `server/.env` (the Discover panel shows a warning).
- **Instagram/TikTok downloads fail with login errors** — close Chrome so yt-dlp can read its cookies, or export a `brand/cookies.txt` (see the error message for steps).
- **yt-dlp checksum mismatch** — a release was likely published mid-download; retry in a minute.
- **Verbose logs** — set `DEBUG=1` in `server/.env` to see ffmpeg filter graphs and yt-dlp commands.

## Tests

```
npm test
```

Runs vitest in both client (text wrapping, aspect math, UTM tagging, templates) and server (probe rotation, upload sniffing, URL allowlist).
