# Production readiness review

Reviewed on 2026-11-17. Verdict: the core CMS flows work, but the current version is not ready for an unconditional production sign-off. Resolve the confirmed failure cases below and verify the live environment first.

Scope: current local checkout, Vercel routing/build configuration, authentication, content publishing, media storage/deletion, and browser error recovery. No production content was changed. The connected Vercel account and its accessible team returned no projects matching `agai`, so live environment values, response headers, logs, backups, and real Turnstile verification remain unverified.

## Confirmed findings

### P1 — Session expiry discards unsaved content

References: `client/src/api.js:11`, `client/src/App.jsx:59`.

Any protected request returning 401 emits `session-expired`. The application immediately replaces the entire workspace with the login form, unmounting the editors and losing their in-memory drafts. The route navigation guard cannot prevent this state-driven unmount.

Reproduced against the production frontend build: edit a service title, return 401 from its save request, sign in again. The title returns to its last saved value; the unsaved text is gone.

Fix before launch: preserve drafts while showing a reauthentication overlay, and restore the editor after the same administrator signs in. Add coverage for session expiry in both service and blog editors. Explicit logout should still clear private editor state.

### P2 — Interrupted media operations can leave permanent storage inconsistencies

References: `server/src/delete-media.js:16`, `server/src/delete-media.js:19`, `server/src/delete-media.js:24`; upload reservation and writes in `server/src/app.js`.

Deletion removes the library record, then image bytes, then quota usage in separate operations. The catch block helps with ordinary rejected operations, but it cannot run when a function/process is terminated. Uploads similarly reserve quota before creating image and metadata documents, with no durable recovery mechanism.

Reproduced in a disposable review database: terminate a child process immediately after deletion removes metadata. The library record is absent, the binary file remains, and storage is still charged. Retrying via the library is impossible because its record is gone. The disposable database was removed after the check.

Fix before relying on permanent deletion in production: use a transaction for MongoDB metadata, bytes, and quota on a compatible deployment, or persist an idempotent operation record with reconciliation. Handle legacy filesystem cleanup separately. Include process-interruption and ambiguous-write-result recovery tests, not only rejected-operation tests.

MongoDB documents single-document atomicity and transactions for multi-document changes: https://www.mongodb.com/docs/manual/core/write-operations-atomicity/

### Resolved locally — Static Vercel admin page security headers

Update: `vercel.json` now supplies CSP, frame protection, referrer policy, and browser feature restrictions to all paths, including static HTML. Built-frontend browser checks apply the exact configured headers and verify Turnstile script/frame loading, rich-text formatting, uploads, rejected inline/unapproved scripts, and blocked iframe embedding. A Vercel redeployment and live response-header check remain required. The original finding follows for context.

References: `vercel.json:6`, `vercel.json:14`, `vercel.json:17`; Helmet configuration in `server/src/app.js`.

The production HTML is served from `client/dist` via Vercel, outside Express. Helmet's Content-Security-Policy and framing protections therefore do not automatically apply to that HTML. The checked-in Vercel header configuration sets only `X-Robots-Tag` and `X-Content-Type-Options`. Actual live headers could not be checked.

Fix: configure and verify CSP on static HTML, including `frame-ancestors 'none'`, appropriate script/frame allowances for Turnstile, and other required resource origins. Verify both login and the rich-text editor under that policy. Add framing protection and a referrer policy at the delivery layer as appropriate. Do not assume API response headers protect an HTML document served separately.

Vercel's guidance: https://vercel.com/docs/cdn-security/security-headers

### Resolved locally — Invalid blog saves from Preview

Update: blog saves now validate draft data independently of hidden DOM controls, including sidebar fields and rich-text content. Invalid Save/Publish actions leave Preview, show a visible field error, and focus the relevant control while preserving the draft. A built-frontend regression test exercises title, introduction, category, slug, image URL, body, and successful publication after corrections. The original finding follows for context.

Reference: `client/src/pages/ArticleEditor.jsx:36` and the `preview-hidden` form rendering.

Preview hides the main form, but Save/Publish still call `reportValidity()` on it. Required fields cannot be focused while hidden.

Reproduced against the production frontend build: open New blog, switch to Preview, click Save draft. The title field stays hidden, no visible error is shown, and the browser logs that an invalid form control is not focusable.

Fix: validate the complete draft independently of DOM visibility, switch to the editor when invalid, and focus the affected field. Include category and slug fields, which currently sit outside the main form.

## Follow-up improvements

- Give initial authentication and mutations a bounded timeout with actionable retry. `useResource` has a timeout, but the shared API helper and initial `/auth/me` request do not.
- Add a recoverable React error boundary for unexpected render failures.
- Gate production deployments on tests; the checked-in Vercel build command builds the application but does not run its test suites.
- Replace the hardcoded “Local workspace / local MongoDB” message on Settings before presenting that page as production guidance.

## Verification completed

| Check | Result |
| --- | --- |
| `npm run build:vercel` | Passed locally |
| `npm test` | 36 passed |
| `npm run test:e2e` with an alternate public-site test port | 17 passed |
| `npm audit --omit=dev --json` | Zero reported production dependency vulnerabilities |
| Extra browser review reproductions using built frontend | Session-expiry data loss and hidden-preview validation confirmed |
| Child-process interruption reproduction | Orphan image bytes and unreleased quota confirmed |

Normal-flow tests cover password hashing/session handling, CSRF and origin checks, draft/public separation, revision conflicts, deletion password checks, shared rate limits, image validation/optimization, quota limits, and Turnstile failures using mocks. These results do not establish that real production secrets, domains, infrastructure, or backups are correctly configured.

## Live release checks still required

1. Identify the exact Vercel admin deployment and verify runtime health, database connectivity, HTTPS session cookies, and static document security headers.
2. Verify real Turnstile hostname/action checks and the existing production environment variables without exposing their values.
3. Confirm preview deployments use isolated data and cannot modify the production database unintentionally.
4. Confirm an independent database backup and perform a restore rehearsal, including image bytes. Permanent deletion has no application undo.
5. Verify a complete publish-to-public-website flow on the deployed versions, including refreshed public build snapshots/sitemaps where necessary.

No paid service is required merely to fix the application issues listed here. Hosting/database plan suitability and actual capacity must be checked against the deployment in use.
