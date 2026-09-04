# Changelog

Notable changes to this project. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

**Foundation**
- Next.js 15 (App Router) + TypeScript + Tailwind on PostgreSQL 16 via Prisma 6
- Full pipeline schema up front: layered raw/normalized/candidate records,
  source registry, pairwise entity matches, database-backed signal taxonomy
  and scoring rules, jobs, exports, audit log, and an outcome table for future
  evaluation
- Authentication: scrypt password hashing, database-backed opaque-token
  sessions, origin-checked CSRF, per-IP login rate limiting, role guards

**Pipeline**
- Source discovery behind a provider interface: robots-aware domain crawler,
  optional search API, demo fixtures. Categories searched for and not found are
  recorded as `UNAVAILABLE` with an explanation
- Source validation by trial extraction, so a page describing a programme is
  distinguished from one listing its members
- Extractor registry selecting by capability score: JSON, CSV, HTML tables,
  athletics rosters, organization directories, generic fallback, and explicit
  refusals for PDF and browser-rendered pages
- Data collection with per-source failure isolation and fingerprint-based
  idempotency
- Normalization preserving original values alongside canonical ones
- Entity resolution: multi-key blocking, pairwise scoring with surname
  distinctiveness, constrained clustering that respects human decisions
- Evidence and signals with fact/inference/unknown distinction, and signal
  intersection patterns
- Two-stage scoring with per-factor explanations and category caps
- Selective enrichment gated on the discovery score; directories excluded from
  collection structurally
- Job system with progress, logs, cancellation and stale-job recovery

**Interface**
- Dashboard, university workspace with a tab per stage, source registry with
  manual override, raw-data view, filterable CRM, candidate detail with full
  score and evidence breakdown, entity-resolution review queue, enrichment
  queue, scoring analytics, exports, job history, settings

**Export**
- Thirteen-sheet Excel workbook with source URLs, evidence and match
  confidences as literal values

**Demo Mode**
- Three synthetic universities with deliberately different source availability,
  rendered as real HTML and JSON so the demo exercises the actual extractors
- Seeds sources only; candidates and scores come from running the real pipeline

**Documentation**
- README plus architecture, data model, entity resolution, scoring, source
  adapters, privacy and ethics, local development and roadmap

### Fixed

Found by running the pipeline and by tests, not by inspection:

- Substring keyword matching classified the outdoor club as an entrepreneurship
  organization ("Adventure" contains "venture") and silently rejected everyone
  surnamed Moore, Allen or Calloway. Lexicons now match whole phrases
- "Vice President" collapsed into "President": roles were ranked by the longest
  keyword in a group rather than the longest keyword that matched
- "Men's Soccer" normalized to "Men S Soccer", so club and varsity records for
  one sport never compared equal
- Script contents counted as page text, so a JavaScript-rendered page with a
  30 KB bundle and no content looked full of text and was never flagged
- The generic extractor deduplicated by name, erasing one of two different
  people sharing a name — the exact case the product exists to handle
- Whole chapters were dropped because group acceptance judged blocks by
  flattened text; a card reading "Class of 2027" failed the person-name test
  and its whole group lost the vote. Greek extraction went from 68 of 106
  records to 106 of 106
- Surname distinctiveness was counted over rows, so one person listed by six
  sources made their own surname look six times more common. Counting distinct
  people took auto-matches from 75 to 501
- Classification preferred the first matching path hint over the most specific,
  filing `/recreation/club-sports/rosters` as varsity athletics
- Re-running discovery accumulated duplicate "not found" placeholders
- A full-height sidebar plus the demo banner pushed the sidebar footer below
  the fold
- Match review flagged "Greg" against "Gregory" as a conflict when it is
  precisely the nickname match the model recognises

### Security

- Dependency overrides bring `npm audit` to 0 vulnerabilities
- Export downloads require a session, are path-contained and audited
- Logs redact email, phone, credential and token fields

### Changed

- Scoring weights recalibrated. The brief's starting values could not reach the
  default threshold of 60 — a candidate in a Greek organization, two student
  organizations, a club sport and holding a leadership title scored 49, so
  nobody qualified. Weights and caps now place a single roster line well below
  the threshold and genuine breadth above it
