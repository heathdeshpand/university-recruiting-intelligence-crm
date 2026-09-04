# Scoring

Two scores, computed by one engine from two rule sets. The separation is the
point: the discovery score decides *who gets looked up*, and the final score
decides *how to rank*.

## Why two scores

If there were one score, it would have to include enriched fields — and to get
those you must first look someone up. That inverts the funnel: you would
enrich everybody in order to rank them.

So the discovery score uses only what is knowable *before* any contact lookup.
It gates the enrichment queue. The final score runs afterwards and may use
everything.

## Four properties

The engine (`src/lib/pipeline/scoring/engine.ts`) is a pure function, and all
four of these are covered by tests.

### 1. Missing data is never negative

A rule fires only when its signal is explicitly `YES`. A signal that is
`UNKNOWN` — because the university publishes nothing in that category —
contributes zero and costs nothing.

**There is no code path that subtracts points.** Not "no negative rules by
convention" — the engine has no subtraction in it, and a test asserts a score
can never go below zero even when handed a negative weight.

This matters because source availability varies enormously. A university with
no public Greek directory would otherwise score every one of its students down
for something they may well be part of.

Unmet rules are returned with a reason, and the UI shows it: *"No source
covered this, so it is unknown rather than absent."*

### 2. No double counting

Each rule reads one signal and fires at most once. Breadth is rewarded through
`occurrences`, which counts **distinct subjects** — so a candidate listed in
the same club by three different pages has one organization, not three.

### 3. Bounded contributions

Rules may carry their own ceiling, and every category has a cap, so no single
kind of evidence can dominate. Totals clamp to 0–100.

When category totals exceed 100 the UI says so explicitly rather than leaving
the arithmetic looking broken.

### 4. Explainability

Every point produces a `ScoreFactor` naming the rule, the evidence statement,
the source and its URL, and a confidence. Factors keep a copy of the evidence
text, so a historical score stays explainable even if evidence is later
rebuilt.

## Discovery scoring

Gates enrichment. Default threshold **60**.

| Category | Cap | Principal rules |
| --- | --- | --- |
| Social | 34 | Organization membership 8 · Multiple organizations 14 (+5 each, max 24) · Greek 12 · Student government 10 |
| Competitive | 26 | Club sport 12 (+4 each, max 18) · Varsity 14 · Competitive org 10 |
| Leadership | 26 | Leadership position 16 (+6 each, max 26) · Founder 14 |
| Career | 12/10/16 | Entrepreneurship 12 · Business 8 · Sales organization 14 |
| Work experience | 24 | Prior sales experience 18 · Recruiting 8 · Fundraising 8 |
| Timing | 12/14 | Near graduation 10 · Explicit job-seeking 14 |

At or above the threshold a candidate is set to `QUALIFIED` and
`enrichmentStatus: QUEUED`. Below it they are explicitly `NOT_ELIGIBLE` — not
left in limbo, so the enrichment queue cannot silently pick them up.

## Final scoring

Runs after enrichment. Caps are set so the five headline groups read as a
clean breakdown, and so the tier boundaries are actually reachable.

| Group | Cap |
| --- | --- |
| Social | 30 |
| Competitive | 26 |
| Career / Sales | 30 across sales, business, entrepreneurship, work experience, customer-facing and career |
| Leadership | 14 |
| Timing | 16 across timing and job-search |

## Tiers

| Tier | Final score |
| --- | --- |
| A | 85+ |
| B | 70–84 |
| C | 50–69 |
| D | below 50 |
| Unranked | not yet scored |

## Calibration, and why the defaults changed

The weights in the original brief could not reach the default threshold of 60.
A candidate in a Greek organization, two student organizations, a club sport
*and* holding a leadership title scored 49 — so nobody qualified, and the
funnel produced nothing.

Rather than lower the threshold and leave the weights misleading, the weights
and caps were recalibrated so that:

- a candidate known only from a single roster line scores well below 60;
- a candidate with genuine breadth across categories clears it;
- the final-score range spans enough of 0–100 for the tiers to mean something.

On the demo dataset this produces 115 qualifying candidates out of 994 (12%),
and a tier spread of A:3, B:21, C:125, D:845.

**These are a defensible starting position, not a validated model.** There is
no outcome data to fit against. They are database rows precisely so that a
recruiter with real outcomes can retune them.

## Configuration

Weights, per-rule ceilings, which rules are active, and the discovery
threshold are all editable in Settings. Changing them does not rewrite
existing scores: a score records what the rules said when it ran, and silently
rewriting history would make it unexplainable. The UI says to re-run scoring.

Code defaults live in `src/lib/config/scoring.ts` and seed into the database.
An ordinary `npm run db:seed` will not overwrite tuned values; `npm run
demo:reset` restores defaults deliberately.

## Signal patterns

Named co-occurrences of signals — "Greek life + club sport + leadership",
"four or more independent involvement signals". They carry **no points**;
their value is letting a recruiter see the shape of a profile at a glance.

The language is deliberately factual. *"Four independent campus involvement
signals"* is a count anyone can verify. *"Extremely ambitious"* would be a
claim about a person's character from a roster listing, and this system does
not make those.

## What is never scored

Not by omission — by design, documented in
[privacy-and-ethics.md](privacy-and-ethics.md):

- religion, race, ethnicity, national origin
- political affiliation
- health, disability, or mental health
- sexual orientation or gender identity
- financial hardship or aid status
- academic difficulty, probation, or any inference about dropping out

`CAREER_TRANSITION` exists only for a public, explicit statement by the person
themselves. It is never inferred, and never derived from any indication of
difficulty.
