# Local development

## Requirements

- Node.js 20 or later (developed on 22)
- PostgreSQL 14 or later (developed on 16)
- npm 10 or later

## Setup

### 1. PostgreSQL

**macOS (Homebrew)**

```bash
brew install postgresql@16
brew services start postgresql@16
createdb recruiting_crm
createdb recruiting_crm_test
```

**Linux**

```bash
sudo apt install postgresql
sudo systemctl start postgresql
sudo -u postgres createuser -s "$USER"
createdb recruiting_crm
createdb recruiting_crm_test
```

**Docker**

```bash
docker run --name recruiting-crm-db -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=recruiting_crm -p 5432:5432 -d postgres:16
```

Then use `postgresql://postgres:postgres@localhost:5432/recruiting_crm` as
your `DATABASE_URL`.

### 2. Install and configure

```bash
npm install
cp .env.example .env
```

Edit `.env`. Two values are required:

```bash
DATABASE_URL="postgresql://YOUR_USER@localhost:5432/recruiting_crm?schema=public"
SESSION_SECRET="..."
```

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Every other variable has a working default. `.env.example` documents all of
them inline.

### 3. Migrate and seed

```bash
npm run db:migrate
npm run db:seed
```

The seed installs the signal taxonomy and both scoring configurations, creates
the application user, and registers the demo universities and their sources.

It deliberately does **not** insert candidates or scores — those come from
running the pipeline, so the demo exercises real code.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000 and sign in with `DEMO_USER_EMAIL` and
`DEMO_USER_PASSWORD` from your `.env`.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve a production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest, watching |
| `npm run check` | Typecheck, lint and tests together |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:migrate:deploy` | Apply migrations without generating |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | Drop, recreate, re-migrate, re-seed |
| `npm run db:seed` | Install config, user and demo sources |
| `npm run demo:reset` | Delete demo data, restore default weights, reseed |
| `npm run pipeline -- <slug> [STAGE]` | Run the pipeline from the terminal |
| `npm run worker` | Standalone job worker |

## Running the pipeline from the terminal

Faster than clicking through the UI when you are changing pipeline code.

```bash
# Everything, in order
npm run pipeline -- example-state-university

# One stage
npm run pipeline -- example-state-university ENTITY_RESOLUTION

# List universities and stages
npm run pipeline
```

Stages: `SOURCE_DISCOVERY`, `SOURCE_VALIDATION`, `DATA_COLLECTION`,
`NORMALIZATION`, `ENTITY_RESOLUTION`, `SIGNAL_EXTRACTION`, `DISCOVERY_SCORING`,
`ENRICHMENT`, `FINAL_SCORING`, `EXPORT`, `FULL_PIPELINE`.

## Pointing it at a real university

Out of the box the app never contacts a real website. To change that:

1. Set `ENABLE_LIVE_NETWORK=true` in `.env`.
2. Set `HTTP_USER_AGENT` to something that identifies you with a real contact
   address.
3. Leave `RESPECT_ROBOTS_TXT=true`.
4. Leave `HTTP_PER_HOST_DELAY_MS` at 1500 or higher.
5. Add the university at `/universities/new` with its real domains.
6. Run source discovery and look at what it found **before** collecting.

**Confirm you are entitled to fetch the sources you point it at.** Publicly
reachable is not the same as permitted; see
[privacy-and-ethics.md](privacy-and-ethics.md).

Expect discovery on a real university to be slower and messier than the demo.
The page budget defaults to 60; raise `DISCOVERY_MAX_PAGES` for a wider
search, remembering that each page is a request to someone's server.

## Project layout

```
prisma/          schema, migrations, seed
scripts/         worker and the CLI pipeline runner
src/app/         routes: (app) is authenticated, /login is not
src/components/  ui/ primitives, app/ domain components
src/lib/         config, pipeline, jobs, api, auth, demo
tests/unit/      pure-logic tests
docs/            this documentation
```

## Working on the pipeline

Every stage is a job handler in `src/lib/jobs/handlers/`. To change one:

1. Edit the handler or the pipeline module it calls.
2. `npm run pipeline -- example-state-university <STAGE>` to run it.
3. Check the numbers against the previous run.
4. Add or update tests in `tests/unit/`.

Stages are independent, so you can iterate on entity resolution without
re-collecting, or on scoring without re-resolving.

## Troubleshooting

**`Invalid environment configuration`** — a required variable is missing. The
message names it. Copy `.env.example` and fill in `DATABASE_URL` and
`SESSION_SECRET`.

**`Can't reach database server`** — Postgres is not running, or the URL is
wrong. Check with `pg_isready`.

**`No default DISCOVERY scoring configuration found`** — run `npm run db:seed`.

**Discovery says live network access is disabled** — expected. Either use a
demo university or set `ENABLE_LIVE_NETWORK=true`.

**A job is stuck on "Running"** — the server probably restarted mid-job. Jobs
running for more than fifteen minutes are marked failed on the next run, and
re-running the stage is always safe.

**Nothing qualifies for enrichment** — the discovery threshold is 60 by
default. Check the score distribution on the Scoring tab; if everything sits
in the 0–39 band, either the sources yielded little or the weights need
retuning in Settings.
