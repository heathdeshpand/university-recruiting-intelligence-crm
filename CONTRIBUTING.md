# Contributing

## Setup

See [docs/local-development.md](docs/local-development.md). In short:

```bash
npm install
cp .env.example .env    # set DATABASE_URL and SESSION_SECRET
npm run db:migrate
npm run db:seed
npm run dev
```

## Before you open a pull request

```bash
npm run check   # typecheck + lint + tests
npm run build
```

All four must pass. If your change touches the pipeline, also run it and
report the numbers:

```bash
npm run demo:reset
npm run pipeline -- example-state-university
```

A pipeline change that moves the candidate count, the qualifying rate or the
tier spread should say so in the pull request, with the before and after.
Those numbers are how anyone reviewing knows whether the change did what you
think it did.

## Branches and commits

Branch as `type/short-description`: `feat/pdf-extractor`,
`fix/nickname-blocking`, `docs/scoring-calibration`, `refactor/job-runner`,
`test/enrichment-ambiguity`.

Write commit messages that explain **why**. The diff already shows what
changed. If you fixed a bug, say what the bug actually did — "surname rarity
was counted over rows, so one person listed by six sources suppressed their
own match" is useful; "fix scoring bug" is not.

## Tests

Every meaningful change needs tests. Pipeline logic is deliberately pure and
lives in `tests/unit/`, needing no database.

Write the test that would have caught the bug. Several existing tests exist
because they caught real defects, and the comments say which.

For pipeline work, cover the awkward cases, not just the happy path:

- **Entity resolution** — a real variant, a same-name-different-person pair, a
  conflicting field, a record missing the fields you would most like
- **Scoring** — a rule firing, a rule not firing because the signal is unknown,
  a category cap, the 0–100 bounds
- **Extraction** — a page it should read, a page it should decline, and a page
  that looks right but contains no people
- **Enrichment** — a confident match, an ambiguous pair, and no match at all

## How to add a source adapter

1. Create `src/lib/pipeline/extract/extractors/<name>.ts` implementing
   `Extractor`.
2. `detect` returns 0 when inapplicable, otherwise a fit score. Respect the
   bands: structured formats 1.0, specialised HTML 0.5–0.98, generic fallback
   at most 0.45. An extractor that overstates its fit will hijack pages it
   should not.
3. `extract` returns records plus a `structureHash` and warnings. Put fields
   that do not map to the canonical shape into `raw` — never discard them.
4. Add the value to the `ParserType` enum and create a migration.
5. Register it in `EXTRACTORS` in `registry.ts`. Order does not matter.
6. Test it against all three page types above.

Nothing else changes. Discovery, validation and collection pick it up
automatically.

→ [docs/source-adapters.md](docs/source-adapters.md)

## How to add a signal

1. Add it to `SIGNAL_DEFINITIONS` in `src/lib/config/signals.ts` with a stable
   key, a category and a description a recruiter would understand.
2. Emit it from `buildEvidence` in `src/lib/pipeline/signals/evidence.ts`,
   attached to evidence that genuinely supports it.
3. Optionally add a scoring rule referencing its key.
4. `npm run db:seed` to install it.

**Before adding one, check it against
[docs/privacy-and-ethics.md](docs/privacy-and-ethics.md).** A signal must
describe something a source publicly and explicitly stated. It must not
describe, infer or proxy for a protected or sensitive attribute, and it must
not be derived from any indication of hardship or difficulty.

If a signal can only be produced by inferring something about a person that
they did not state, it does not belong in this system.

## How to add or change a scoring rule

Rules live in `src/lib/config/scoring.ts` and seed into the database. Two
constraints are not negotiable:

- **Points are never negative.** The engine has no subtraction, and a test
  asserts it. Missing data must never cost anyone points.
- **Category caps must be reachable.** If a cap cannot be hit by a realistic
  candidate, the score's range is misleading — this was a real defect once
  already.

An ordinary `npm run db:seed` will not overwrite tuned values; `npm run
demo:reset` restores defaults deliberately.

→ [docs/scoring.md](docs/scoring.md)

## How to change the schema

1. Edit `prisma/schema.prisma`. Comment anything non-obvious — the schema is
   documentation.
2. `npm run db:migrate -- --name short_description`.
3. Commit the generated migration. Never edit an applied one.
4. Update [docs/data-model.md](docs/data-model.md) if the shape changed.
5. Add indexes for any new query pattern, and constraints for any invariant.
   Idempotency and no-double-counting are enforced by the database here, not
   by careful application code, and new invariants should be too.

## Documentation

Documentation is part of the change, not a follow-up.

- New capability → update the README's status table
- Pipeline behaviour changed → update the relevant `docs/` page
- New environment variable → document it inline in `.env.example`
- Notable change → add it to `CHANGELOG.md`

**Do not document something as working before it does.** The status table
distinguishes implemented from planned from deliberately unsupported, and that
distinction is the point.

## Style

- Comment *why*, not *what*. Explain the non-obvious decision, the constraint
  you were working around, the failure mode you were avoiding.
- Prefer pure functions in the pipeline. Split I/O from logic — enrichment is
  split this way precisely so the step deciding whose contact details attach
  to whom is testable without a database.
- Model failure as a value where failure is expected. Sources break constantly;
  one broken source must never end a run.
- Errors are read by recruiters. "Club Sports could not be parsed because the
  page structure changed" beats "Error 500".
- No `any` without a comment explaining why nothing better works.

## Things that will be declined

- **Outreach features** — email, messaging, calling, automated contact of any
  kind. Out of scope by design; see
  [docs/roadmap.md](docs/roadmap.md).
- **Anything that weakens the fetch layer** — bypassing robots.txt,
  authentication, CAPTCHAs or rate limits.
- **Signals inferring sensitive attributes**, or derived from hardship or
  academic difficulty.
- **Making missing data count against a candidate.**
- **Auto-merging on name similarity alone.** This is the single most important
  guarantee in the system, and it has a test.
