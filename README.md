# advertising-meme-maker

Local web app for stitching meme videos/images with branded outro slides for Luma Tech Solutions social media ads.

## Setup

```
npm run install:all
```

This installs dependencies in the root, server, and client. The server pulls down a bundled ffmpeg binary via `ffmpeg-static` (~80 MB).

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

1. Drop a video or image (the meme).
2. Set your brand colors and logo (persists across sessions in `brand/`).
3. Add 1+ outro slides — headline, subhead, duration.
4. Click **Export**. The server runs one ffmpeg invocation that scales the source + every slide PNG to identical params and concatenates them via the concat filter. Output lands in `output/`.
