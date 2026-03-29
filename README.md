# AI Clipart Generator (Android / Expo)

Multi-style AI clipart from a single portrait: **cartoon**, **flat**, **anime**, **pixel**, **sketch**. The mobile app talks to a small **Node API** that enqueues **async jobs** so long-running generation does not block HTTP indefinitely.

## Status: feature-complete for submission

| Requirement | Implemented |
|-------------|-------------|
| Android app (Expo / RN) | Yes |
| Gallery + camera upload, preview, 512px client compression | Yes |
| Multi-style generation (parallel job, polled progress) | Yes |
| Parallel OpenAI calls per style (concurrent + safe store updates) | Yes |
| Styles: cartoon, flat, anime, pixel, sketch | Yes |
| Skeleton loading + progressive tiles | Yes |
| Style chips, intensity slider | Yes |
| Optional **prompt** field (`promptSuffix`, server-merged) | Yes |
| Before/after **slider** (original vs result) | Yes |
| **Cache last successful run** on device + restore | Yes |
| Save PNG to gallery + share + save all | Yes |
| API keys only on server | Yes |
| Quota / max styles / dimension caps | Yes (API) |
| README: setup, decisions, tradeoffs, links | This file |

**Stitch / external UI generators:** Screens are built and refined in code. If your brief requires Stitch, add exported frames or a short “Design inputs” subsection with links or screenshots.

## Submission links 

- **APK (Google Drive):** _paste public link_
- **Screen recording (Google Drive):** _paste public link_
- **Repository:** [github.com/Gobind557/AI-Clipart-Generator](https://github.com/Gobind557/AI-Clipart-Generator)

## Tech stack

| Layer | Choice |
|--------|--------|
| Mobile | Expo SDK 55, React Native, TypeScript |
| API | Express 5, Zod validation, `dotenv` for `server/.env` |
| Async jobs | In-process chain when `REDIS_URL` is empty; **BullMQ + Redis** when configured |
| AI | **`IMAGE_PROVIDER=openai`** (Images edit API) or **`stability`** (SDXL image-to-image) — keys only on server |
| Media | `expo-image-picker` (gallery + camera), `expo-media-library` (save), `expo-sharing` (share), PNG export via `expo-image-manipulator` |
| Local cache | `@react-native-async-storage/async-storage` + `expo-file-system/legacy` for last-run restore |

## Architecture (high level)

```mermaid
flowchart LR
  app[ExpoApp] -->|POST_jobs_poll| api[ExpressAPI]
  api --> queue[QueueOrMemory]
  queue --> worker[JobProcessor]
  worker --> ai[OpenAI_or_Stability]
  worker --> store[InMemoryJobStore]
  store --> api
  api --> app
```

- **Cost guards:** max **5** styles per job, image dimensions capped at **512px** on the wire, **daily quota** per `x-device-id` header (or IP fallback).
- **Secrets:** never ship API keys in the app; only the backend reads provider keys.

### Local test: Android emulator + Upstash Redis + Stability

1. **Upstash** → create a Redis database → copy the **`rediss://…`** URL (TLS).  
2. **`server/.env`**
   ```env
   IMAGE_PROVIDER=stability
   STABILITY_API_KEY=sk-...
   STABILITY_ENGINE_ID=stable-diffusion-xl-1024-v1-0
   REDIS_URL=rediss://default:xxxx@xxxxx.upstash.io:6379
   START_WORKER=true
   ```
   (Remove the space in engine id if paste typo — use the exact engine your Stability account supports.)
3. **`server`:** `npm run dev` → open `http://localhost:8787/v1/health`.
4. **Project root `.env`**
   ```env
   EXPO_PUBLIC_API_URL=http://10.0.2.2:8787/v1
   ```
5. **`npx expo start`** → press **`a`** (Android emulator). Run upload → generate.

**Notes:** With **Redis**, the API process must run the **worker** (`START_WORKER=true`) so BullMQ jobs execute. **`rediss://`** enables TLS (configured for Upstash in code).

## Setup

### Prerequisites

- Node 20+
- For physical device testing: phone and PC on the **same Wi‑Fi**; use your PC’s **LAN IP** in `EXPO_PUBLIC_API_URL`.

### 1. Backend

```bash
cd server
cp .env.example .env
# Edit .env: OPENAI_API_KEY (or Stability keys), optional REDIS_URL, START_WORKER
npm install
npm run dev
```

Health check: `http://localhost:8787/v1/health`

### 2. Mobile app

```bash
cd ..   # repo root
cp .env.example .env
# Set EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8787/v1  (Android emulator: http://10.0.2.2:8787/v1)
npm install
npx expo start
```

Press `a` for Android emulator or scan the QR code in **Expo Go** (dev client) / use a **development build** after `expo prebuild` if you add native modules.

### Troubleshooting

| Issue | What to try |
|-------|-------------|
| App cannot reach API | Same Wi‑Fi; Windows firewall allow Node on port **8787**; use LAN IP not `localhost` on a physical phone. |
| Android emulator | Use `EXPO_PUBLIC_API_URL=http://10.0.2.2:8787/v1` (emulator → host loopback). |
| Failed tiles / “out of credits” | Provider quota or billing (e.g. Stability `insufficient_balance`). Tiles show **failed** with a short message; fix keys or add credits on the provider dashboard. |
| Env not loading | Ensure you run the API from `server/` after `cp .env.example .env`; `dotenv` loads at startup. |

### 3. Redis (optional, production-shaped)

```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

In `server/.env`:

```env
REDIS_URL=redis://127.0.0.1:6379
START_WORKER=true
```

Run API from one terminal; if you split worker, use `npm run dev:worker` in another (same codebase, worker flag).

If `REDIS_URL` is **empty**, jobs run on a **serialized in-memory** queue (fine for local demos).

## Environment variables

### `server/.env`

| Variable | Purpose |
|----------|---------|
| `IMAGE_PROVIDER` | `openai` (default) or `stability` |
| `OPENAI_API_KEY` | When `IMAGE_PROVIDER=openai` |
| `STABILITY_API_KEY` | When `IMAGE_PROVIDER=stability` |
| `STABILITY_ENGINE_ID` | Stability engine id (default SDXL in `.env.example`) |
| `REDIS_URL` | Empty = in-memory queue. **Upstash:** `rediss://…` |
| `START_WORKER` | **`true`** when `REDIS_URL` is set so jobs are processed |

### Root `.env`

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_API_URL` | Base URL for API, must end with `/v1` |

## API contract

- `POST /v1/jobs` — body: `imageBase64`, `mimeType`, `width`, `height`, `styles[]`, optional `intensity`, optional `promptSuffix` (max 400 chars, trimmed) → `202` `{ jobId, status }`
- `GET /v1/jobs/:id` — job + per-style status (poll from app)
- `GET /v1/jobs/:id/results` — full result list
- `GET /v1/health`

## Tradeoffs 

1. **In-memory job store** — simple and fast for a 72h sprint; not multi-instance. Redis + BullMQ path is there for scale story; swap store for Postgres/S3 for production.
2. **OpenAI vs “no card” providers** — image edit quality + docs maturity won the default; **Replicate / Stability** fit the same worker slot with a new adapter module.
3. **Provider errors** — failed styles are stored as `error` with a short message (no fake “completed” images).
4. **Expo managed workflow** — fastest iteration; release **APK** via EAS Build or `expo prebuild` + Android Studio.

## Building a release APK (EAS)

1. Install EAS CLI: `npm i -g eas-cli`
2. `eas login` → `eas build:configure`
3. `eas build -p android --profile production`
4. Download the artifact, upload to Drive, test install on a real device before recording.

## Screen recording checklist

1. Upload from **gallery** and/or **camera**
2. Toggle **styles**, adjust **strength**, tap **Generate**
3. Show **skeleton** tiles → progressive completion
4. **Before/after** strip + **Save** / **Share** / **Save all**

## Repository layout

```
flick/
├── App.tsx                          # Entry → GenerationScreen
├── app.json                         # Expo config + plugins
├── src/
│   ├── components/SkeletonTile.tsx
│   ├── features/generation/GenerationScreen.tsx
│   ├── shared/api/jobsClient.ts
│   ├── shared/cache/resultCache.ts
│   └── shared/media/exportImage.ts
└── server/
    ├── src/index.ts                 # API + dotenv
    ├── src/routes/jobs.ts
    ├── src/queue/generationQueue.ts
    ├── src/services/jobs/           # job store + processor
    └── src/services/ai/openaiProvider.ts
```


