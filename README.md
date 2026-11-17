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
- Journal search and filters; article creation, editing, previews, drafting and publishing; visual rich-text blog editing with headings, bold/italic/underline, lists, quotes, links, alignment, and undo/redo; categories and unique URL slugs.
- Separate draft and published copies. Saving a draft never changes public content. Unpublish removes public content while retaining the draft. Delete article permanently removes the entire MongoDB post record (draft and published copies), with no archive or restore. Deletion requires confirmation and the current revision; shared media remains in the media library. Legacy archived articles remain accessible for permanent deletion.
- Service editor with Add service, category/icon selection, two image pickers and text limits. Existing IDs remain unchanged, and each added service receives a stable unique ID. Up to 50 services are supported; categories follow the website filters. The Home hero editor has been removed.
- Media library and image picker. JPEG/PNG/WebP originals up to 20 MB and 40 megapixels are resized in the browser before upload. The backend validates and stores only WebP images, at most 1920 pixels on the longest edge and 512 KB, using quality 80 and further resizing when needed. Transparency and orientation are preserved; metadata is stripped. Images are public assets; avoid uploading confidential material.
- Password changes, session invalidation, unsaved-change warnings and revision checks to prevent stale editors overwriting another editor's changes.

The initial import includes the six articles and all current clinic/services content from the public website. Blog bodies are validated structured rich text and rendered safely through React, without arbitrary HTML. Existing section-based blogs open in the visual editor without a database migration. A missing blog cover uses the existing default image. Empty homepage/service image URLs are rejected.

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
   | `TURNSTILE_SITE_KEY` | Public site key for your existing Cloudflare Turnstile widget |
   | `TURNSTILE_SECRET_KEY` | Matching widget secret; server-only |
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

Set `E2E_WEBSITE_PORT` to use another public-site test port when 5190 is occupied. To check the actual bundled admin CSS and JavaScript, run `npm run build` first, then run browser tests with `E2E_BUILT_CLIENT=1`; the built admin is served on the isolated API server at port 5002. `tests/browser/services-layout.spec.js` checks desktop grid placement, mobile overflow and focus, field validation, and recovery from failed saves/publishing.

Current scope is one administrator role, rich-text blog bodies, and manual website deployment. There is no email password recovery, publishing scheduler or automatic deploy trigger. Media is retained until an administrator deletes it through the password-verified library deletion flow.

The matching public-site rich-text renderer is in `../agai/src/components/RichText.tsx`. Deploy both repositories to display new formatting publicly. The API retains plain-text `sections` for older consumers. Rich-text bodies allow up to 100,000 characters and 12 levels of nesting. Formatting CSS is kept in sync between the admin preview and public renderer.

## Adding a service

The service list stays beside the editor on desktop and opens with **Choose a service** on smaller screens. Use **Overview**, **Details**, **Images**, and **Preview**, or the Previous/Next buttons, to move through the form. Switching services keeps unsaved edits. Validation opens the affected service and section and marks the field to correct. Save and publish apply to all service drafts; if publishing fails after saving, the saved draft remains available and publishing can be retried without another draft write.

Open **Website content ? Add service**. Fill in the title, short title, introduction, description, audience and care focus (1?8 lines), choose a category/icon, and select both the service image and homepage preview image. Text fields show their character limits. **Cancel new service** discards the unsaved entry; save a complete draft before starting another.

**Save draft** stores the service privately in MongoDB. **Publish changes** publishes only the services draft with revision checks to prevent overwriting another editor's changes. Other website content drafts remain private. Published services appear on the connected website's homepage, Services page, category filters and appointment selector on the next page load. Existing service links remain valid. Deploy both repositories to ship the new dashboard/API validation and updated frontend service-count wording.

## Login verification

Vercel serves the admin's static HTML with security headers configured in `vercel.json`: CSP, `X-Frame-Options: DENY`, a referrer policy, and disabled camera/microphone/geolocation permissions. The CSP permits same-origin scripts/API calls and Cloudflare Turnstile's script/frame origin. Inline scripts, event-handler attributes, unapproved script origins, plugins, base-URL changes, and framing the admin are blocked. Inline styles remain allowed for the rich-text editor's injected styles and text alignment; inline JavaScript is not allowed. CMS images may load from HTTPS URLs, same-origin paths, and local data/blob previews.

After changing these headers, redeploy the Vercel project. `tests/browser/security-headers.spec.js` applies the exact configured policy to built HTML in a browser and checks login/widget compatibility, formatted editing, uploads, blocked scripts, and blocked framing. Run it after `npm run build` with `E2E_BUILT_CLIENT=1`. It does not verify the actual deployed CDN response or real Cloudflare credentials. See [Cloudflare CSP requirements](https://developers.cloudflare.com/turnstile/reference/content-security-policy/) and [Vercel security header guidance](https://vercel.com/docs/cdn-security/security-headers).

Admin login uses Cloudflare Turnstile. Keep the existing names `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in Vercel; no `VITE_` prefix is needed. The frontend fetches only the public site key from `/api/auth/config`. The secret is read exclusively by the Express backend, which verifies each login token with Cloudflare Siteverify and checks its `admin-login` action and hostname before authenticating the password.

In the existing Cloudflare widget settings, allow your admin site's hostname (and any preview hostname where you want login enabled). `API_URL` and `ADMIN_ORIGIN` must match the intended admin origin; the current `VERCEL_URL` hostname is also accepted by server verification. Both keys are required on production/Vercel deployments; missing configuration or verification failures block login. Failed logins, expiration and challenge errors require a fresh challenge. Redeploy after changing Vercel variables.

Local development without either key remains usable without Turnstile. Setting either key locally requires both and enables verification. Tests stub the widget and Siteverify responses; they do not validate real production keys or Cloudflare hostname settings. The integration uses the existing backend and does not deploy an additional Worker.

## Image storage allowance

The Media library shows used image storage, available space, and a fixed **300 MB** total (300 × 1,024 × 1,024 bytes). Usage counts saved optimized uploads, not original file sizes, seed website assets, external image URLs or MongoDB indexes/other data. Reusing an uploaded image does not add storage. The meter refreshes after upload and can be refreshed manually.

`GET /api/media/storage` requires an admin session and returns `{ usedBytes, remainingBytes, limitBytes, imageCount }`. A MongoDB `storageQuotas` record initializes from existing media sizes automatically. Uploads reserve bytes atomically to prevent concurrent uploads exceeding the allowance and release reservations if image or metadata writes fail. The same quota applies to library uploads and image pickers. No new environment variables or storage services are required. This is an application allowance, not additional capacity purchased from the database provider.

In **Media library**, each image has a **Delete** action. The dialog identifies the image and requires the signed-in administrator's password. `DELETE /api/media/:id` accepts `{ password }` with the existing session and CSRF token, verifies the current MongoDB password hash, and rate limits confirmation attempts independently of sign-in. Successful deletion removes the library record, MongoDB image bytes, and any legacy local upload copy, then releases the image's storage allowance. The library and meter refresh immediately. Passwords are cleared on failure or cancellation and are never stored by this feature.

Deletion is permanent and does not rewrite blog or service content. Replace referenced images before deleting them to avoid missing images on the website. Existing browser/CDN caches may retain previously fetched image copies until expiration. Simultaneous deletion requests release the allowance once; cleanup failures retain a retryable library record and its quota.

## Services API and state

MongoDB is the source of truth: `content` / `_id: main` contains `draft.services` and `published.services`. The existing setup script imports all starting services only when initializing the record; existing installations need no migration or reseeding. Snapshots in the website are generated fallbacks for prerendering and outages, not a second editable database.

- `GET /api/public/services`: published services, schema version and publication time; public CORS and no-store caching.
- `GET /api/services`: authenticated service drafts, published services and revision.
- `PUT /api/services`: authenticated, CSRF-protected save with `{ revision, data: [...] }`. Supports new and edited services together, validates data, and returns 409 on stale revisions.
- `POST /api/services/publish`: authenticated, CSRF-protected publish with `{ revision }`; updates only published services.
- `DELETE /api/services/:id`: authenticated, CSRF-protected permanent deletion with `{ revision, password }`. Verifies the signed-in administrator's MongoDB password hash, rate limits confirmation attempts, and removes the service from both draft and published copies. Bulk save/publish endpoints cannot remove services without this flow. Keeps at least one draft and published service; add and publish a replacement before deleting the last one.

To delete a saved service, select it under **Website content**, click **Delete service**, and enter your admin password in the confirmation dialog. Incorrect passwords leave it unchanged. Other unsaved service edits are retained. Successful deletion updates both public APIs immediately; existing website visitors may see cached content until its one-minute cache expires. Shared images remain in the media library.

The dashboard uses `ServicesContext` for API state, loading/retry and saves. The website uses its own typed `ServicesContext`: one shared request feeds homepage cards, service listings, filters, appointment choices, footer and chat service data. It keeps the previous data while loading, validates API responses, cancels superseded requests and offers retry on failure. New appointment links remain selected when services arrive after initial rendering.

Deploy the admin/backend first, then the website: the website build now requires `/api/public/services` as well as `/api/public/content` when `CMS_API_URL` is configured. No new environment variables or paid services are required.

## Contact form inbox

The public website Contact us form submits to `POST /api/public/contact`. Valid enquiries are stored in MongoDB `contactSubmissions`; signed-in administrators can read them at **Contact forms** (`/contact-forms`). The private list API is `GET /api/contact-submissions?page=1` (20 per page, newest first).

Deploy both repositories: deploy agai-admin first, then agai. On the website Vercel project, keep `CMS_API_URL` set to the admin/backend origin (or its `/api/public/content` URL). On the admin Vercel project, set `WEBSITE_URL` to the actual public website URL; the contact API permits that origin and its www alias. Localhost origins are permitted only outside production. No additional paid service or secret is needed.

Submission includes name, phone, optional email, message and selected service. Server validation, a honeypot and shared MongoDB rate limiting protect the endpoint. A submission UUID makes retries idempotent. Enquiries are private, excluded from public content, and the website retains input on request failure. Success is shown only after the database write completes. This flow stores enquiries for staff review; it does not send email notifications or confirm appointments. Historical local drafts were never submitted and cannot be imported.
