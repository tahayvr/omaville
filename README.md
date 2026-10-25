# Omaville

The [omacom](https://github.com/omacom) GitHub org drawn as a living city on the Omarchy mark: who is working on what, which projects are moving, and what just shipped.

One SvelteKit app. Inside its server, the relay scans the org every 15 minutes, takes GitHub and Basecamp webhooks into an event log, and keeps the log, the city's snapshot and layout, and sign-in's sessions in Postgres (Drizzle); the page draws the city from them and redraws in place whatever each new event changes. New repositories claim land and rise out of scaffolding. Nothing that already stands moves. Members of the org sign in (GitHub or Basecamp) to see the members' city: private repositories, teams and the Basecamp projects as wards.

The city opens in 3D (three.js) with free orbit: drag to turn, right-drag or two fingers to pan, scroll or pinch to zoom, Q / E to turn 45°. Without WebGL, or with `?view=2d`, it falls back to the flat isometric drawing. The toolbar button switches between them and remembers the choice.

```
GitHub API, webhooks ──┐                     ┌──► the page: city.js draws the city (in a worker), 3D or flat
Basecamp, webhooks  ───┼──► relay (Postgres) ┤
city.config.json ──────┘    layout engine    └──► the live stream (Server-Sent Events): effects, in-place redraws
```

## Quick start

```sh
pnpm install
pnpm db:start        # Postgres in Docker (or leave DATABASE_URL unset: an in-memory PGlite)
pnpm dev             # the city on http://localhost:8080: from dev/snapshot.json, or a scan of the org with GITHUB_TOKEN
pnpm dev:members     # the same, with an invented members' city (wards, a private repo), signed in as "you"
pnpm test            # the relay's tests, a build, and the end-to-end privacy test
```

Every environment variable is in `.env.example`: copy it to `.env` (`pnpm dev` and `pnpm start` read it) and fill in what you need; local work needs none. `just` lists the same commands. To run against the real org, set `GITHUB_TOKEN` (below) and run the built app with `CITY_SCAN_EVERY=15 node build`, or scan once with `pnpm collect` (it refreshes `dev/snapshot.json`).

Without a token, the collector can read local clones instead:

```sh
mkdir clones && for r in omarchy omarchy-pkgs …; do git clone --bare --filter=blob:none https://github.com/omacom/$r clones/$r.git; done
node scripts/collect.mjs --source git --clones clones
```

## Token

**The public city** needs only a token that reads public repositories: a fine-grained personal access token with **Repository access: Public repositories** (no permissions to pick, no org approval), or a classic token with no scopes. Anyone can make one; a bot account's is best, so the city does not depend on one person. The scan then reads the org's public repositories and its public members.

**The members' city** (private repositories, every member, the invite check at sign-in) needs a fine-grained token created by an org owner with **resource owner = omacom**:

| Permission | Access | Why |
| --- | --- | --- |
| Repository: Metadata | Read | repo list, languages, archived and fork flags |
| Repository: Contents | Read | commit history and branch comparisons |
| Repository: Pull requests | Read | open pull request counts |
| Organization: Members | Read | the members list, including private members, and who may sign in |

The city reads `GITHUB_TOKEN` as a fixed token. A GitHub App's installation tokens expire within the hour, and the city does not mint new ones yet, so use a personal access token for now.

## Deploy

The app ships as one container: the [Dockerfile](Dockerfile) (Coolify, or any Docker host). In Coolify:

1. Add a Postgres resource, and an application from this repository built with the Dockerfile, on port 3000. Health check: `/status`.
2. Set the application's environment from [.env.example](.env.example). The public city needs only `DATABASE_URL` (the Postgres resource's URL), `ORIGIN` (the city's address), `GITHUB_TOKEN` (a public-repositories token, see Token) and `CITY_SNAPSHOT_TOKEN`. Migrations apply as the app starts, the first scan runs at once and then every 15 minutes, and each changed building redraws in place on open pages.
3. Optional, live within seconds: an org webhook (an org owner adds it) at `https://<domain>/hook`, JSON, with `CITY_WEBHOOK_SECRET` set to its secret; events: push, pull requests, releases, workflow runs, issues, repositories, organization. Without the secret, hooks are refused and the scans alone keep the city current.
4. Optional, once: `POST /backfill` with `Authorization: Bearer $CITY_SNAPSHOT_TOKEN` reads the org's whole history for the replay and the year film.

**The members' city stays off until sign-in is set up.** Until `BETTER_AUTH_SECRET` and a provider are set, there is no sign-in link, the members' endpoints answer 401, and nothing private is read or kept: the scan skips private repositories and Basecamp, private webhook events are dropped, and Basecamp's webhooks answer 404. To turn it on: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, the OAuth apps below, an org-owner token (see Token), and for the wards `BASECAMP_TOKEN` with `scripts/basecamp-hooks.mjs` for Basecamp's per-project webhooks.

Sign-in needs a GitHub OAuth app (callback `https://<domain>/api/auth/callback/github`) and a Basecamp Launchpad app (callback `https://<domain>/api/auth/callback/basecamp`). GitHub Actions only checks the code (`.github/workflows/city.yml`); Coolify deploys on a push. Back up the Postgres resource (Coolify schedules that).

## Make it your org's

There is one file to write: [city.config.json](city.config.json), the org and how its city is laid out. Everything else comes from the org itself and lives in the database: repositories, people and their names (their GitHub profiles), teams (the org's GitHub teams), activity, and the layout (where every repository and person stands, decided on the first scan and never moved after).

1. Write `city.config.json`. Only `org` is required; everything else has a sensible default.
2. Run the app with `GITHUB_TOKEN` (`pnpm dev`, or deployed): the first scan lays the city out in the database.
3. Adjust the layout section until the city reads well. A repository already placed keeps its place; reset the database to lay a city out again from scratch.

`dev/snapshot.json` is the one data file in the repository: a public snapshot of the org for `pnpm dev` without a token, the drawing check and the tests. `pnpm collect` refreshes it.

The city always stands on the Omarchy mark; your repositories fill its slots, districts and lots.

| Field | What |
| --- | --- |
| `org` | the GitHub org (`github.com/<org>`) |
| `name`, `title`, `description` | the org's name (header, overview), the city's title (page, captions, clips), the page's description |
| `primary` | the main repository: the hall when no landmarks are set |
| `window`, `timezone` | days of recent activity (30), and the zone the clock and days read in |
| `bots`, `routine` | who and what doesn't count toward height and people (bots ride the belts apart) |
| `people` | `who` (`"all"`: everyone who committed; `"members"`: org members only), `invited` (emails that may sign in), `hidden` (counted, never drawn) |
| `patrons` | optional: a tiers file in the org (`repo`, `path`), its site for logos and links (`site`, `page`, `images`), and which tier goes on the crown and on the billboards (`crown`, `boards`: `{ tier, label }`) |
| `hints` | the file a repository may carry to steer itself (`project: <Basecamp id>` links it to a ward), `.city.yml` by default |
| `basecamp` | the members' Basecamp account (`account`) |
| `layout.landmarks` | repository → slot (`"hall"`), or `{ slot, what }` with the card's text; slots: `hall`, `press`, `disc`, `dispatch`, `works-1`…`works-4`, `pod-1`, `pod-2` |
| `layout.districts` | the five districts (`apps`, `catalog`, `sites`, `upstream`, `retired`): `name`, `kind`, `what`, `match` (`repos`, `pattern`, `topics`, `flags`) |
| `layout.newcomers` | the lots' newcomers: `name`, `what`, `buildDays` |
| `layout.mirrors` | repositories that are stock mirrors of upstream (they carry no height) |
| `layout.kits` | plugin kits per repository |
| `layout.kinds` | the landmark slots' kinds of station by slot (`press`: "Package press"; defaults: Assembly hall, Press, Disc press, Dispatch racks, Works, Pod) |
| `layout.signs`, `layout.boards` | the stencil signs by slot (`hall`, `billboard`, `dispatch`, `works-1`, …) and the three billboard towers' text when there are no patrons |

## How the city grows

`city.config.json` holds the rules; the database holds the result, so positions survive every scan and every deploy.

1. A repository keeps the place it already has. Only archiving moves it (to the archive), and leaving the archive places it again like a newcomer. A repository that disappears from the data keeps its lot as a vacant lot, so nothing around it shifts.
2. Landmarks (`layout.landmarks`) get their hand-built station in one of the mark's slots: the arcology (`hall`), the two presses (`press`, `disc`), `dispatch`, four works (`works-1`…`works-4`) and two pods (`pod-1`, `pod-2`). Without landmarks, the `primary` repository takes the hall.
3. Districts (`layout.districts`) take repositories by explicit list, then by flag (`fork`, `mirror`, `archived`), then by name pattern, up to their capacity.
4. Everything else claims the next free lot, best lots first (the skyline at the back, then the side channels, then the front, then the courtyard's prop rows). For `newcomers.buildDays` days after it was created it stands in scaffolding under a crane, rising day by day. When the mark's lots are full, lots open in the rings around it; the layout never fails or skips a repository.
5. Slots in the review yard (`yard`, open pull requests, 28 slots) and on the branch racks (`racks`, unmerged work, 11 slots) are owned the same way: a repository keeps its slot while it needs one, a freed slot waits for the next newcomer, and a repository that finds no free rack waits for one.
6. Every contributor gets a tower (`houses`, login → `"i,j:slot"`), 7 to 9 to a cell, placed once and never moved, in rings around the mark: the ring next to the mark first, its cells nearest the arcology first, then the next ring out. The floor grows with the rings. Whoever arrives in the same run is placed in a seeded shuffle of their logins, never by size, so tall and short towers stand together. Towers stand on the same height scale as repositories; hover or search a login to find one.

**Patrons.** One tier of corporate patrons (`patrons.crown`) stands on the four faces of the arcology's crown and another (`patrons.boards`) on the three billboard towers, names in stencil, in the order the patrons file lists them.

To steer a repository, add it to a district's `match.repos`, or to `landmarks` with a free slot.

**One height scale.** Every building is `16 + 14 · log2(1 + lifetime commits / 8)` tall (1 commit ≈ 18, 100 ≈ 68, 1,000 ≈ 114, 7,000 ≈ 153); scenery never exceeds 60. Recent activity never changes height: it lights lamps and windows, moves belts and drones, and puts workers on the ground. The legend (`src/lib/ui/Legend.svelte`) states the signal, formula and window of every element, and `scripts/check.mjs` fails when a station kind has no legend row, when the drawing is not byte-for-byte the same twice from the same data, or when a value is NaN.

## Layout of this repository

| Path | What |
| --- | --- |
| `src/lib/city/` | the city builder: data + layout in, SVG out; with `three: true` it records 3D primitives instead (runs in a worker or in Node); the Omarchy mark, the drawing kits, plugins |
| `src/lib/view/` | the two maps: `map3d.js` (three.js, from two recordings seen from the south-east and the north-west) and `flat.js` (the SVG plate), with one API |
| `src/lib/client/` | the page's runtime: drawing, live updates, the scrubber, the year film, clips, the cinema modes |
| `src/lib/ui/` | the chrome as Svelte components, on shadcn-svelte (Lyra style) in `src/lib/components/ui/` |
| `src/lib/server/` | the relay, the collector, the layout engine, sign-in (Better Auth) and the database (Drizzle schema; migrations in `drizzle/`) |
| `src/routes/` | the page and the relay's endpoints |
| `scripts/` | `check.mjs` draws every angle and fails on NaN, the tests, `collect.mjs`, `shots.mjs`, `fire.mjs`, `load.mjs` |
| `city.config.json` | the one config file: the org and its layout |
| `dev/snapshot.json` | a public snapshot of the org for offline dev, the drawing check and the tests |

## Data shape

`data.json` (schema 3): `repos{name: {desc, lang, flag, created, total, c30, c7, unmerged, people, people7, top, pr, last, latest, days[30]}}`, `people[]` (`n, gh, member, c30, c7, teams, focus, repos, days, latest`), `contributors[]` (`login, total, repos[[repo, n]]`: lifetime commits per person over the public repositories, from the contributors endpoint, forks and mirrors skipped), `patrons[]` (the tiers of the org's patrons file, names and links only, from `patrons.repo` and `patrons.path`), `days[30]`, `window`, `generatedAt`, `digest`, `projection`.

**Two projections.** The collector writes the public city by default (`--projection public`): no private repositories, people named by GitHub login, no teams, membership marked only when public on GitHub. `--projection members` keeps everything for the members' city behind sign-in. `scripts/assert-public.mjs` fails on anything private in a public `data.json`, and the relay refuses to serve one (`collector/public.mjs`).

- `total` is the repository's lifetime commits on its default branch (for a fork, only what is ahead of upstream; a mirror has 0). **Height follows `total`**; `c30`, `c7` and `people7` (distinct committers in the last 7 days) drive lamps, belts, workers and drones. Nothing shrinks when work pauses.
- The window is whole UTC calendar days ending today, so `days[]` are real days.
- Commits are de-duplicated by SHA, then by author, author date and subject for rebased copies; merges, mirrors and routine bot work (config `routine`, which includes Omabot and Claude) are left out.
- `generatedAt` only changes when the data changed: the collector digests the aggregate and keeps the previous stamp (from `--prev`, a path or the deployed `data.json`) when the digest matches, so open pages never reload for an empty run.

## Credits

Drawing kit: anatomy by Ryan, MIT, see `src/lib/city/kit/LICENSE-anatomy`. 3D: three.js r169, MIT. UI: shadcn-svelte, MIT.
