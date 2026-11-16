# AGAI Studio

A separate React + Node.js/Express + MongoDB application for managing AGAI Physiotherapy Centre's blogs and main website content.

## Run locally

Requires Node.js 22.18+ and MongoDB running on `127.0.0.1:27017`.

```powershell
cd C:\VolumeD\personal\agai-admin
npm ci
Copy-Item server/.env.example server/.env
npm run setup
npm run dev
```

Open **http://localhost:5177**. The API is at **http://127.0.0.1:5001**, using database **agai_cms**. Both bind to loopback by default. This checkout has already been installed and initialized.

Administrator accounts live in the MongoDB `users` collection, with salted scrypt password hashes. For an empty database, supply `ADMIN_EMAIL` and `ADMIN_PASSWORD` as temporary process environment variables before running setup, then remove them. Setup never generates, prints, or saves a plaintext password file. Sign in with the password you supplied. Re-running setup preserves the existing administrator and content. Production requires `SESSION_SECRET` in Vercel; local development uses an in-memory secret if none is supplied, so sessions expire on restart.

## Features

- Overview with real content counts, recent activity and shortcuts.
- Journal search and filters; article creation, editing, previews, drafting and publishing; editable headings/text sections with reordering; categories and unique URL slugs.
- Separate draft and published copies. Saving a draft never changes public content. Archive/unpublish removes public content; restoring returns an article to drafts.
- Editors for clinic/contact details, homepage headline and hero, founder introduction, seven services, FAQs and first-visit steps. Service IDs/categories remain fixed to preserve existing links and filters.
- Media library and image picker. JPEG/PNG/WebP originals up to 20 MB and 40 megapixels are resized in the browser before upload. The backend validates and stores only WebP images, at most 1920 pixels on the longest edge and 512 KB, using quality 80 and further resizing when needed. Transparency and orientation are preserved; metadata is stripped. Images are public assets; avoid uploading confidential material.
- Password changes, session invalidation, unsaved-change warnings and revision checks to prevent stale editors overwriting another editor's changes.

The initial import includes the six articles and all current clinic/services content from the public website. Text is rendered safely through React, without arbitrary HTML. A missing blog cover uses the existing default image. Empty homepage/service image URLs are rejected.

## Public website connection

The sibling `../agai` website is connected but remains a separate project. `GET /api/public/content` exposes only published content; no credentials, drafts or administrator records. Public reads support CORS without cookies. Admin endpoints are authenticated and served on the same origin as the editor.

The website loads published content before importing page components. If the CMS is unavailable after four seconds, it uses `src/cms-snapshot.json`, the backup included in its build. When fresh content differs from prerendered markup, it renders fresh content instead of hydrating mismatched HTML.

`../agai/.env.development.local` is configured with `VITE_CMS_API_URL=http://127.0.0.1:5001`. Start the website separately with `npm run dev` from its directory. Publish in Studio and reload the website to see changes. This development-only setting is ignored by Git and is not used in production builds.

The website's build runs `content:sync` before sitemap generation. When `CMS_API_URL` or `VITE_CMS_API_URL` is configured, sync downloads the published snapshot. A configured API outage fails the build clearly and preserves the previous snapshot. Without either setting, the checked-in snapshot is used.

To build locally from the CMS without embedding a localhost API in production:

```powershell
cd C:\VolumeD\personal\agai
$env:CMS_API_URL = 'http://127.0.0.1:5001'
npm run build
Remove-Item Env:\CMS_API_URL
```

Rebuild/deploy the public website after publishing, especially after adding, renaming, unpublishing or archiving articles. This refreshes static HTML, metadata, fallback content and sitemaps. Article sitemap dates use publication timestamps. Runtime changes appear on the next page load; existing open pages keep their loaded content. During a CMS outage, a previous built backup can still contain removed articles until it is redeployed.

## Deploy frontend and backend to Vercel

This repository is one Vercel project: Vite serves the React frontend and `api/index.js` runs Express as a Node.js function. API requests and session cookies stay on the same HTTPS origin. `vercel.json` selects Mumbai (`bom1`); choose an Atlas region nearby. No GCP resources or Secret Manager are required.

MongoDB must be hosted separately (for example MongoDB Atlas). It stores content, users, sessions, login throttling, and uploaded WebP images. There is no runtime filesystem storage or separate Blob/Redis service. Media shares the database storage allowance: this suits a small clinic library, not a large media archive. Browser optimization keeps image payloads under 2 MB; the API retains a 3 MB transport limit below Vercel's 4.5 MB request/response limit. Browsers without WebP encoding send resized PNGs for backend conversion. Seed images are copied to the static CDN during build.

### Deploy through Vercel's GitHub integration

1. Create a hosted MongoDB database (for example Atlas), with a database user that can read/write `agai_cms`. Configure network access for Vercel builds and functions. Their outbound addresses can vary; allowing `0.0.0.0/0` permits connections from anywhere and requires strong unique credentials and TLS. Keep independent database backups.
2. Import this GitHub repository into one Vercel project. Root Directory: repository root (`.`), framework: Vite, Node.js: 22.x. `vercel.json` supplies the build command (`npm run build:vercel`) and output (`client/dist`). Keep Vercel's GitHub integration connected, with `main` as the production branch.
3. In **Vercel > Project > Settings > Environment Variables**, add these for **Production**:

   | Name | Value |
   |---|---|
   | `MONGODB_URI` | Atlas connection string; treat as a secret |
   | `MONGODB_DB` | `agai_cms` |
   | `SESSION_SECRET` | At least 32 random characters; treat as a secret and keep stable across deploys |
   | `API_URL` | Canonical project HTTPS URL, without `/api` or a trailing slash |
   | `ADMIN_ORIGIN` | Same value as `API_URL` |
   | `NODE_ENV` | `production` |

4. For a **new database only**, also add `INITIALIZE_DATABASE=true`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` (at least 12 characters, treated as a secret), scoped to **Production only**. The Vercel build first builds the frontend, then explicitly initializes the database. Existing administrator credentials and content are preserved. Restore existing data before deploying if you want to keep your local edits.
5. Deploy. Verify `/api/health` and `/api/public/content`, then sign in with the initial administrator credentials. Remove `INITIALIZE_DATABASE`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` from Vercel after successful initialization and redeploy to remove the bootstrap password from the current deployment environment. Change your administrator password in Settings. Subsequent builds do not connect to or initialize the database.
6. Pushes to `main` now deploy automatically through Vercel. Environment-variable changes require a new deployment. No GitHub Actions secrets, Vercel deployment token, or GitHub production environment are required. The retained GitHub CI workflow runs isolated tests and builds only; it does not gate Vercel releases by itself. Use branch protection to require passing CI before merging into `main`.
7. Ensure production `/api/public/content`, `/uploads/*`, and `/website-assets/*` are publicly accessible; deployment protection must not block the public website from reading them.
8. Set the separate public website's `VITE_CMS_API_URL` to this project's canonical URL and rebuild that website. This admin frontend needs no environment variables: it calls `/api` on its own origin.

Never prefix database credentials, passwords, or session secrets with `VITE_`. Use a separate database and session secret for Preview deployments, and configure their URLs accordingly. Do not enable `INITIALIZE_DATABASE` for previews: the build rejects initialization outside Production. Production secrets must not be available to unreviewed preview code.

The previous GitHub deployment workflow has been removed. If you already added deployment secrets to GitHub for this project, they are no longer used and can be removed. Do not remove secrets used by unrelated workflows.

### Troubleshooting a MongoDB TLS error during deployment

If `build:vercel` fails in `server/scripts/setup.js` with `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR`, the database initialization connection failed. The frontend build and the database connection are separate steps. Do not disable TLS or certificate verification to work around it.

1. In Atlas, confirm the cluster is available and **Network Access / IP Access List** permits Vercel's outbound connections. Allowing only your laptop's IP does not allow Vercel. If using Vercel Static IPs, allowlist those addresses and enable **Settings > Networking > Static IPs > Use for builds**; builds otherwise use dynamic addresses. See [Vercel networking](https://vercel.com/docs/networking/static-ips) and [Atlas connection troubleshooting](https://www.mongodb.com/docs/atlas/troubleshoot-connection/).
2. Check the **Production** value of `MONGODB_URI` against Atlas **Connect > Drivers**. Use a database user's credentials, URL-encode reserved password characters, and ensure the cluster host is correct. Changes take effect on a new deployment.
3. Run `npm run check:db` locally using `server/.env` to test connectivity without changing content. Success verifies only the environment where the command runs. To diagnose Vercel itself, temporarily set its Build Command to `npm run check:db && npm run build:vercel`, then restore `npm run build:vercel` after diagnosis.
4. If the database is already initialized, remove `INITIALIZE_DATABASE`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` from Vercel and redeploy. If it is empty, keep first-time initialization enabled until it succeeds. Removing the flag does not fix runtime database connectivity.
5. If connectivity settings are correct but failures persist, check Atlas cluster metrics/status and retry once the service is healthy. The driver's `SystemOverloadedError` label can also accompany TLS/network failures and does not alone establish overload.

### Existing local data

A new Atlas database does not include your local edits. Back up and restore the existing MongoDB database into Atlas first if retaining that content. Copy the existing `server/uploads/` directory to the machine performing migration and run `npm run migrate:media --workspace server` with the destination `MONGODB_URI` configured in `server/.env`. This idempotently copies image bytes into `mediaFiles` without deleting local files. Resize any legacy images over 3 MB before migration. Replace old absolute origins in media URLs and draft/published content with the new canonical URL before going live; the migration does not silently rewrite content. Keep the old database and files until verification is complete.

### Cost and limits

Vercel Hobby is for personal, non-commercial use; this clinic application needs a plan allowing commercial use. MongoDB Atlas has a free cluster option with limited capacity. This conversion avoids paid GCP infrastructure and extra storage services, but does not promise zero hosting cost. See [Vercel plans](https://vercel.com/docs/plans/hobby), [function limits](https://vercel.com/docs/functions/limitations), and [Atlas free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run setup` | Initialize administrator and content, preserving existing work |
| `npm run dev` | Start React and Node development servers |
| `npm run build` | Build the React admin into `client/dist/` |
| `npm start` | Serve the built admin and API |
| `npm test` | API integration tests against an isolated real MongoDB database |
| `npm run test:e2e` | Browser checks for publishing to the website and mobile use |

## Project structure

This is an npm workspace with separate client and server packages. Run `npm ci` once from the project root; the root lockfile covers both packages. Shared dependencies may be hoisted into the root `node_modules/` by npm.

```text
agai-admin/
  api/index.js           Vercel API entry point
  vercel.json            Unified frontend/API routing and Mumbai region
  .github/workflows/     Isolated test/build CI (Vercel handles deployment)
  client/
    src/                 React editor and styles
    public/              Brand assets and fonts
    index.html
    vite.config.js
    package.json         Frontend dependencies and commands
    dist/                Generated frontend build
  server/
    src/                 Express API, configuration, MongoDB and authentication
    scripts/setup.js     Administrator/content initialization
    tests/api.test.js    API integration tests
    seed/                Initial content and original image previews
    uploads/             Legacy local images for migration (ignored by Git)
    .local/              Temporary browser-test state only (ignored by Git)
    .env.example
    package.json         Backend dependencies and commands
  scripts/               Cross-application browser test helpers
  tests/browser/         End-to-end publishing tests
  playwright.config.js
  package.json           Workspace orchestration
  package-lock.json      One lockfile for both workspaces
```

Root commands remain unchanged. Run `npm run dev:client` or `npm run dev:server` to start only one side. Alternatively, from `client/` run `npm run dev` or `npm run build`; from `server/` run `npm run dev`, `npm start`, `npm run setup` or `npm test`. Server environment values live in `server/.env` and are read relative to that package. On Vercel, the frontend is served statically and `/api` runs as a function. Locally, `npm start` serves `../client/dist/` alongside the API.

Admin login reads MongoDB only. No local credential file is used. Seed content remains in `server/seed/`; legacy local images can be migrated into MongoDB.

Browser tests use Edge on Windows; elsewhere run `npx playwright install chromium`. They require the sibling `../agai` checkout and free ports 5002, 5178 and 5190. Development uses 5001/5177. Test content is isolated from `agai_cms`.

Current scope is one administrator role, plain-text article sections, and manual website deployment. There is no email password recovery, publishing scheduler or automatic deploy trigger. Media is retained to avoid breaking existing references.
