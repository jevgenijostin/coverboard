# CoverBoard

**Post it. Claim it. Covered.** A shift-coverage board for hourly and shift-based teams — retail, restaurants, cafes, call centers. Post the shift you can't work, your teammates claim it, and everyone can see at a glance what's still open, pending, or covered. No group chat, no account, no backend.

## The MVP

- **Team dashboard:** an empty-state onboarding flow, team creation, team cards showing live coverage counts, and confirmed deletion.
- **Shift board:** a Monday–Sunday week grid with real dates, open-shift tickets, a coverage bar and legend, an "acting as" picker to demo both sides of a claim in one browser, and a compact post-shift form.
- **Shift lifecycle:** post → claim → confirm, plus release (give a claim back) and cancel (withdraw a request). A confirmed shift is locked; release it first if plans change.
- **Settings:** team rename, bulk roster add/remove, and team deletion.
- **Offline:** a build-generated service worker precaches the actual hashed application assets. Open online once and allow registration to finish before taking it offline. Production builds only; development mode does not register a worker.

The visual style is a break-room notice board: charcoal background, amber accent for open requests, blue for pending confirmation, green for covered. Status color and label always travel together, never color alone. Layout, component styles, and theme custom properties live in `src/style.css`.

## Run and test

Use Node.js 22.12+ and npm (CI uses Node 22).

```sh
npm ci
npm run dev
npm test
npm test -- --coverage
npx playwright install --with-deps chromium
npm run test:e2e
```

CourtKit conventions: Vite + strict TypeScript, vanilla DOM, Vitest, Playwright, and `dev`, `build`, `test`, `test:e2e` scripts. `build` runs TypeScript, Vite, and the service-worker generator. `test:e2e` builds and starts its own preview server on port 4173.

Set `GITHUB_PAGES=true` when building/testing the `/coverboard/` subpath. PowerShell: `$env:GITHUB_PAGES='true'; npm run test:e2e`. CI runs unit and Chromium browser tests on **ubuntu-latest and windows-latest**, with both root and Pages base paths. GitHub Actions deploys `dist` to GitHub Pages.

## Shift rules

Each shift has a day (Monday–Sunday), a start/end time, an optional note, the member who posted it, and a status:

| Status | Meaning | Who can act |
| --- | --- | --- |
| `open` | Needs cover | Anyone but the poster can claim it; the poster can cancel it |
| `claimed` | Pending confirm | The claimer can release it back to open; the poster or claimer can confirm it; the poster can still cancel it |
| `confirmed` | Covered | Locked — release a confirmed shift isn't possible; cancel is blocked until it's un-confirmed by design, since there is no un-confirm action in this MVP |

A member can't claim their own shift. Removing a member cancels the shifts they posted and reverts any shift they'd claimed back to `open` — it does not silently leave a dangling reference. `src/model.ts` contains these rules as pure, unit-tested functions (`postShift`, `claimShift`, `releaseShift`, `confirmShift`, `cancelShift`, `removeMember`), tested before the UI was built against them.

The "Acting as" selector in the board toolbar is a stand-in for authentication: it lets one browser tab play every role in the demo (post as Ada, switch to Bo, claim, switch back, confirm) without a login system. It is session-only and not persisted.

## Persistence and implementation

The team-data localStorage key, `coverboard.v1`, contains `{ schemaVersion: 1, teams: [...] }`. The loader validates the entire document, including member and shift structure, day/time format, status/claim consistency, and duplicate IDs. Missing data, malformed JSON, invalid shapes, unknown versions, or denied storage return an empty state without crashing. Saving reports storage failures in the UI; in-memory edits remain usable.

Unit tests cover the full shift lifecycle, every validation branch in `postShift`, cascading member removal, coverage tallying, week-date math across week boundaries, and malformed/denied storage. Browser scenarios cover posting, claiming, confirming, and reload persistence; self-claim prevention and release; and free-tier caps on teams, roster size, and open shifts, lifted by a license key.

## Monetization follow-up

This MIT night-project implements a lightweight local license stub. No checkout or real payment integration is included.

| Tier | Entitlements |
| ---- | ------------ |
| Free | 1 team, 4 crew members per team, 3 open shift requests (open + pending, not yet covered) per team at a time |
| Paid | Unlimited teams, roster size, and open shifts, plus all free features |

Generate a demo key locally after `npm ci`:

```sh
npm run --silent generate-demo-license
```

The command writes one valid key to stdout using the same TypeScript license implementation as the app. Select **Enter license key** in the navigation, paste it in the license panel, and select **Apply license**. The panel shows the current tier and offers **Remove license key**. Free limits apply to creating teams, adding members, and posting new open shifts. Removal or expiration restores creation limits without deleting or locking existing teams, rosters, or shifts.

`src/license.ts` signs a version-1 payload (`tier`, `issuedAt` in Unix milliseconds, `licenseId`, optional `expiresAt`) with HMAC-SHA256. Keys consist of a base64 JSON payload and a hexadecimal signature separated by a dot. The CLI issues non-expiring paid demo keys. Validation rejects malformed, tampered, future-issued, and expired keys. A separate localStorage key, `coverboard.license.v1`, stores the license and cached entitlements; startup revalidates the signature instead of trusting the cache. Invalid input leaves the current license unchanged. Storage failures are reported, with changes usable for the current tab only.

**This is a lightweight stub, not real payment security:** the embedded demo secret is client-inspectable, keys can be self-issued or copied, and local code, storage, and the clock can be modified. There is no server verification, revocation, device binding, or payment processing. Real payment integration remains out of scope.

**Still deferred:** multi-device sync, push/email notifications when a shift is posted or claimed, recurring/templated shifts, manager-only approval roles (anyone acting as the poster or claimer can confirm), shift swapping (trading one shift for another rather than just claiming an open one), and an un-confirm action. The week always shows the current Monday–Sunday; there is no navigating to other weeks yet.

## License

MIT © 2026 Jevgeni Jostin.
