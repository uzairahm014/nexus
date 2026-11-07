# NEXUS — PLAY. CREATE. CONNECT. EXPLORE.

A full-stack gaming, social and creator ecosystem: five original playable browser games, a
3D game studio with a sandboxed scripting lab, real-time multiplayer, social feeds, communities,
clips, music, battles, events, marketplace and an admin/moderation console.

Live frontend + API are served by one Node process (HTTP + WebSocket) from the same origin;
the client is also deployable separately to Vercel.

---

## 1. Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS 3, React Router 6 |
| 3D | three.js (WebGL2) — engine for Neon Racer, Studio viewport, Studio player |
| 2D | Phaser 3 — Arena, Parkour, Tower Defence, Party |
| API | Node.js 20+, Express 4, TypeScript |
| Database | SQLite (better-sqlite3, WAL) with a normalised schema and indexes |
| Auth | JWT (httpOnly cookie + Bearer token), bcrypt password hashing |
| Realtime | `ws` WebSocket server on `/ws` (rooms, ready states, 20 Hz state sync, chat) |
| Uploads | multer, 12 MB cap, MIME allow-list, server-side validation |
| Hardening | helmet CSP, CORS allow-list, express-rate-limit, zod input validation |

No paid services, API keys or cloud GPUs are required. Everything runs on the free tier.

---

## 2. Quick start (local)

```bash
npm install            # installs client + server workspaces
cp .env.example .env   # set JWT_SECRET (32+ chars) for a stable session key
npm run dev            # API on :4000, Vite on :5173 (proxied)
```

Open <http://localhost:5173>. On first boot the server seeds a clearly-labelled demo dataset
(demo accounts are flagged `is_demo`), the five games, communities, clips, tracks and events.

Production build + run:

```bash
npm run build
JWT_SECRET=... npm start   # serves client/dist + /api + /ws on :4000
```

Demo sign-in (seeded): `novastrike` / `NexusDemo123!` — flagged as demo content everywhere it appears.

---

## 3. Project layout

```
client/                 React app
  src/pages/            Home, Discover, Games, GameDetail, GamePlay, Studio, StudioPlayer,
                        Create, Social, Live, Music, Clips, Battles, Events, Marketplace,
                        Profile, Admin, Messages, Multiplayer, Auth
  src/games/            NeonRacer (three.js), Arena, Parkour, TowerDefence, Party (Phaser)
  src/studio/           Studio runtime, scene types, sandboxed script host
  src/components/       Design-system shell, cards, UI primitives
server/                 Express API
  src/routes/           auth, social, games, studio, content, admin, uploads, ...
  src/db.ts             Schema, migrations, indexes
  src/auth.ts           JWT issue/verify, role guards, public user shaping
  src/realtime.ts       WebSocket rooms, match loop, chat, score submission
  src/seed.ts           Idempotent demo seed
  tests/api.test.mjs    11 integration tests (node --test)
Dockerfile              Multi-stage production image (non-root)
vercel.json             Static frontend deploy config
scripts/build-art.sh    Regenerates artwork from the supplied reference images
```

---

## 4. Features implemented

**Accounts** — register, login, logout, persistent sessions (7-day JWT), profile editing,
avatar/banner upload, privacy setting, roles (`user`, `moderator`, `admin`, `suspended`).

**Social** — posts (text/image/video), comments, likes, bookmarks, follow/unfollow, friend
requests, direct + group conversations with real member validation, notifications, reporting,
blocking, search across users/games/communities.

**Games** — five original playable games with instructions, keyboard + touch controls, pause,
restart, saved progress, achievements (XP awards), per-game leaderboards and play counts.
Scores are validated server-side (auth required, bounded values, duration sanity checks).

**Studio** — scene viewport (three.js), object hierarchy, add/duplicate/delete primitives,
transform inspector (position/rotation/scale), material colour + emissive/metalness/roughness,
environment (background, fog, ambient, sun, grid), physics flags, camera FOV/position, visual
behaviours, save/load projects, publish to a public `/s/:slug` player page, remix, and a
Level-3 script lab executed in a **sandboxed iframe** (no DOM/cookie/network access to the app).

**Multiplayer** — create/join rooms by code, player list, ready states, host start, server-driven
20 Hz state sync, live chat, orb collection scoring, leaderboard on finish.

**Entertainment** — clips feed with uploads and reactions, music discovery with official embeds
(no unlicensed hosting), battles, events with registration, marketplace listings, experiences
(quizzes/polls/challenges) with a creator and response analytics.

**Admin** — user management (role/suspend), report queue with resolution, content approval,
platform statistics from real rows.

---

## 5. Testing

```bash
npm test          # builds the server, runs 11 integration tests against a temp database
npm run typecheck # server + client TypeScript
npm run build     # production build of both workspaces
```

Covered by `server/tests/api.test.mjs`: health, registration, duplicate registration, bad
password, session resolution, auth guard on studio routes, project save → publish → public scene
round-trip, group conversation member validation, score auth/bounds/leaderboard, non-media upload
rejection, anonymous WebSocket rejection.

---

## 6. Deployment

### A. Single container (recommended — frontend + API + WebSocket)

```bash
docker build -t nexus .
docker run -p 4000:4000 -e JWT_SECRET="$(openssl rand -hex 32)" \
  -v nexus-data:/app/data -v nexus-uploads:/app/uploads nexus
```

The image builds both workspaces, prunes dev dependencies, runs as a non-root user and exposes
`/api/health`. Any Node host works (Render, Railway, Fly, a VPS). Mount `/app/data` and
`/app/uploads` to persist the SQLite database and media.

### B. Vercel frontend (static) + hosted API

1. Deploy the API somewhere that supports long-lived WebSockets (Render/Railway/Fly/VPS) using the
   Dockerfile above.
2. In Vercel: import the repo, framework preset **Other**; `vercel.json` already sets
   `buildCommand: npm run build:client` and `outputDirectory: client/dist`.
3. Set `VITE_API_URL=https://your-api-host/api` as a Vercel environment variable and add the Vercel
   domain to `EXTRA_ORIGINS` on the API host.

Note: Vercel serverless functions cannot hold WebSocket connections, so realtime multiplayer needs
the API host (option A). Everything else works from the static frontend.

### Free-tier notes

- SQLite + local media means the API host needs a persistent disk for durability.
- Uploads are capped at 12 MB per file; there is no CDN, so heavy clip traffic is bounded by host
  bandwidth. Object storage can be swapped in later without changing API contracts.
- No billing is enabled anywhere; no paid API keys are referenced by the code.

---

## 7. Backup and export

- Database: copy `server/data/nexus.db` (or `/app/data/nexus.db` in Docker) — it is a single file.
- Media: copy the uploads directory (`./uploads` or `/app/uploads`).
- Full source: `git clone` the repository, or download the ZIP from GitHub → Code → Download ZIP.
- Restore: put the files back and restart; the schema migrations are idempotent.

---

## 8. Environment variables

See `.env.example`. Required in production: `JWT_SECRET`. Optional: `PORT`, `DATA_DIR`,
`DB_PATH`, `UPLOAD_DIR`, `SEED_ON_START`, `EXTRA_ORIGINS`, `PUBLIC_ORIGIN`, `VITE_API_URL`.

---

## 9. Known limitations (honest scope)

- Realtime multiplayer is server-authoritative for orb positions and scoring, but there is no
  client-side prediction/interpolation netcode beyond smoothing — it targets casual 1v1–8 player rooms.
- The Studio is a scene editor with primitive geometry, materials, lights and behaviours; it does
  not import external 3D models or run a full physics engine.
- User scripts run in a sandboxed iframe with a narrow bridge API; they cannot access the app or
  user data, and script features are limited to what the bridge exposes.
- No AI inference is bundled: AI-assist entry points degrade to deterministic non-AI tools, so the
  platform works with no API keys.
- Clip/music media is user-uploaded or official embeds only; no third-party streaming is scraped.
