# AGAI Studio

A separate React + Node.js/Express + local MongoDB application for managing AGAI Physiotherapy Centre's blogs and main website content.

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

Read `server/.local/admin-credentials.txt` for the generated administrator email and password. Change the password in Settings after signing in. Credentials and the session secret are ignored by Git. Re-running setup preserves the existing administrator and content; it does not reset passwords or recreate renamed/archived articles.

## Features

- Overview with real content counts, recent activity and shortcuts.
- Journal search and filters; article creation, editing, previews, drafting and publishing; editable headings/text sections with reordering; categories and unique URL slugs.
- Separate draft and published copies. Saving a draft never changes public content. Archive/unpublish removes public content; restoring returns an article to drafts.
- Editors for clinic/contact details, homepage headline and hero, founder introduction, seven services, FAQs and first-visit steps. Service IDs/categories remain fixed to preserve existing links and filters.
- Media library and image picker. JPEG/PNG/WebP uploads up to 8 MB are decoded, limited to 40 megapixels, resized to at most 2200 pixels, and stored as WebP. Images are public assets; avoid uploading confidential material.
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

## Production

Localhost is only available on this computer. For live visitors, host this Node application on a server that can reach MongoDB, for example a VPS with a local MongoDB instance. Keep this admin/API on its own HTTPS origin. No DNS or deployment has been performed.

1. Configure `server/.env`: `MONGODB_URI`, `MONGODB_DB`, `NODE_ENV=production`, a random `SESSION_SECRET` of at least 32 characters, and `PUBLIC_API_URL`/`ADMIN_ORIGIN` set to the actual HTTPS admin origin. `WEBSITE_URL` is `https://agaiphysiotherapy.com`.
2. Run `npm ci`, `npm run setup`, `npm run build`, then `npm start` under a process manager. Express serves both the built frontend and the API.
3. Put an HTTPS reverse proxy in front of Node. Enable `TRUST_PROXY=1` only with exactly one trusted proxy. Production session cookies require HTTPS. Allow request bodies of at least 8 MB plus multipart overhead.
4. Set `VITE_CMS_API_URL` in the public website build environment to that public HTTPS origin. Optionally use `CMS_API_URL` for a different build-time origin. Rebuild/deploy. Never place database credentials, passwords or session secrets in `VITE_` variables.
5. Keep MongoDB and `server/uploads/` persistent and back up both. Existing image URLs contain the configured API origin; retain redirects or migrate URLs when moving domains.

Security includes HttpOnly SameSite cookies, MongoDB-backed sessions, CSRF tokens, write-origin checks, scrypt password hashing, login throttling, Helmet headers, validation, and noindex headers. The approach follows the [Express security guidance](https://expressjs.com/en/advanced/best-practice-security/).

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
    uploads/             Persistent uploaded images (ignored by Git)
    .local/              Existing credentials/session secret (ignored by Git)
    .env.example
    package.json         Backend dependencies and commands
  scripts/               Cross-application browser test helpers
  tests/browser/         End-to-end publishing tests
  playwright.config.js
  package.json           Workspace orchestration
  package-lock.json      One lockfile for both workspaces
```

Root commands remain unchanged. Run `npm run dev:client` or `npm run dev:server` to start only one side. Alternatively, from `client/` run `npm run dev` or `npm run build`; from `server/` run `npm run dev`, `npm start`, `npm run setup` or `npm test`. Server environment values live in `server/.env` and are read relative to that package. In production, the server serves `../client/dist/` alongside its API. Preserve both folders when deploying this combined-origin setup.

Credentials, the session secret, seed content and uploaded images were moved into `server/`; the existing MongoDB database was not changed.

Browser tests use Edge on Windows; elsewhere run `npx playwright install chromium`. They require the sibling `../agai` checkout and free ports 5002, 5178 and 5190. Development uses 5001/5177. Test content is isolated from `agai_cms`.

Current scope is one administrator role, plain-text article sections, and manual website deployment. There is no email password recovery, publishing scheduler or automatic deploy trigger. Media is retained to avoid breaking existing references.
