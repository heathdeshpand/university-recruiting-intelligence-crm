# Roadmap

## Implemented

Everything below works and is exercised by the demo dataset.

- Source discovery — crawler, optional search API, demo fixtures
- Source registry with per-source status, provenance and manual override
- Source validation by trial extraction
- Data collection with per-source failure isolation and idempotency
- Extractor registry: JSON, CSV, HTML tables, athletics rosters, organization
  directories, a generic fallback, and honest refusals for PDF and
  browser-rendered pages
- Normalization of names, organizations, roles, sports, majors and years
- Entity resolution: blocking, pairwise scoring, constrained clustering,
  durable human decisions
- Evidence and signals with fact/inference/unknown distinction
- Signal intersection patterns
- Two-stage scoring with per-factor explanations
- Selective enrichment gated on the discovery score
- CRM with server-side filtering, sorting and pagination
- Candidate detail with full score and evidence breakdown
- Entity-resolution review queue
- Excel workbook export
- Job system with progress, logs and cancellation
- Audit log
- Demo Mode

## Not supported, deliberately

Not "not yet" — these are out of scope by design, for the reasons in
[privacy-and-ethics.md](privacy-and-ethics.md).

- Outreach of any kind: email, SMS, social messaging, calling
- Social media scraping
- Access to anything behind a login
- Bypassing authentication, CAPTCHAs or rate limits
- Inferring protected or sensitive attributes
- Scoring anyone on hardship or academic difficulty

## Planned

### Near term

**PDF extraction.** PDFs are recognised and reported but not read. Club sport
rosters are published this way often enough to matter.

**Browser-rendered pages.** Detected and reported. Reading them needs a
headless browser, which is a real operational cost and a place where
politeness controls are easy to lose — so it needs designing, not bolting on.

**Source monitoring over time.** `SourceCheck` already records every
collection. What is missing is alerting on a drift: a source that quietly
halves its record count should raise something.

**Bulk review actions.** Confirming or rejecting matches one at a time is
correct for ambiguous pairs but tedious for a large backlog of near-identical
ones. Grouping by pattern would help without weakening the guarantee.

### Medium term

**Recruiter collaboration.** Multiple users, assignment, notes, shared saved
views. The audit log and user model already support this; the interface does
not.

**Outcome tracking.** `CandidateOutcome` exists and is unused. Recording real
outcomes is the prerequisite for ever knowing whether the scores are any good.

**Optional AI-assisted classification.** The architecture is
provider-agnostic and the interfaces exist. Any AI output would be
schema-validated with Zod, required to cite an evidence record, and never
allowed to invent a fact. Deterministic rules would still run first and win
where they match, so behaviour stays reproducible.

**Saved searches and change alerts.** "Tell me when a new candidate matches
this filter."

### Longer term

**Learned ranking.** Only meaningful with real outcome data, and only worth
doing if it can stay explainable — a black-box score would remove the property
that makes this product defensible. A calibrated model whose contributions can
still be attributed is the bar.

**Cross-university benchmarking.** Comparing candidates across universities
means the score has to mean the same thing everywhere, which it currently does
not: a university publishing less will produce lower scores for identical
students. Normalising for source availability is the hard part.

**Import connectors.** Authorized CSV and API imports from university systems
a recruiter has a genuine relationship with — a better path to good data than
crawling.

## Explicitly reconsidered

**Outreach.** The obvious next feature, and deliberately absent. Adding it
changes what the product is: a tool that helps a person decide who to contact
becomes a tool that contacts people. That deserves its own legal and ethical
review, consent handling, rate limiting and opt-out mechanics — not a
checkbox on an existing screen.

## Known weaknesses

Honestly, the things most likely to disappoint:

- **Scoring weights are unvalidated.** They are a defensible starting position
  with no outcome data behind them.
- **Discovery on a real university will be messier than the demo.** Real sites
  are inconsistent, and the crawler's page budget is a real constraint.
- **Entity resolution leaves a review backlog.** On the demo dataset, 364
  pairs. That is the honest cost of not guessing, but at scale it needs the
  bulk tooling above.
- **The job runner is single-node.** Fine for local use and a small
  deployment; a multi-replica deployment needs a real queue.
- **Extractors will meet pages they cannot read.** The registry reports that
  rather than failing silently, but the answer is still "someone must write an
  adapter".
