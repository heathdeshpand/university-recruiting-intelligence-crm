# Privacy and ethics

This document is not a disclaimer. Most of what follows is enforced in code,
and the enforcement points are named so they can be checked.

## What the system is for

Finding students who have publicly demonstrated involvement, leadership or
competitive activity, and presenting that evidence to a recruiter with its
provenance intact.

## Principles, and where they are enforced

### Public or authorized sources only

Every outbound request goes through one client, which refuses to bypass
authentication, does not solve CAPTCHAs, does not retry past a 403, and
honours `robots.txt` per host — failing closed when robots cannot be read.

Live network access is **off by default**. A fresh checkout cannot contact a
real website until someone deliberately enables it.

*Enforced in `src/lib/pipeline/http.ts`.*

### Data minimization

The pipeline does not start from the student body. It finds people through
public involvement, scores them, and only then looks up the qualifying
minority.

Student directories are excluded from collection by a
`sourceType: { notIn: ENRICHMENT_ONLY_SOURCE_TYPES }` clause — a structural
guarantee, not a convention. On the demo dataset, 12% of candidates are ever
looked up.

Enrichment stores only email, major and graduation year, and only when the
directory published them.

*Enforced in `src/lib/jobs/handlers/data-collection.ts` and
`src/lib/pipeline/enrich/`.*

### Missing data is never negative

A scoring rule fires only on an explicit `YES`. There is **no subtraction
anywhere in the engine** — not by convention, but structurally, with a test
asserting a score cannot go below zero even given a negative weight.

This matters because source availability varies enormously. A university with
no public Greek directory would otherwise penalise every one of its students
for something they may well be part of.

*Enforced in `src/lib/pipeline/scoring/engine.ts`.*

### Fact, inference and unknown are distinguished

Every evidence row carries an `assertionKind`:

- **Fact** — "Listed as treasurer of the Entrepreneurship Club"
- **Inference** — "Near graduation", derived from a graduation year
- **Unknown** — no source covered it

Inference is never promoted to fact, and the interface labels it.

### Provenance is never lost

Raw records are never rewritten. Every claim traces to a source, a URL and a
timestamp. Score factors keep a copy of their evidence so a historical score
stays explainable.

### Human review is designed in

Ambiguous matches are surfaced, not guessed. Two records agreeing on nothing
but a name cannot be merged automatically. Ambiguous directory matches are
refused rather than attached to the wrong person. Human decisions are durable
and constrain later automatic runs.

## Attributes that are never collected, inferred or scored

Not by omission — by design:

- religion or religious affiliation
- race, ethnicity or national origin
- political affiliation
- health, disability or mental health
- sexual orientation or gender identity
- financial circumstances, hardship or aid status
- academic difficulty, probation, or any inference about dropping out
- immigration status
- criminal history

Nor are they inferred from names, organization membership, or anything else.
The signal taxonomy is auditable in full in Settings and in
`src/lib/config/signals.ts`.

### On "considering dropping out"

Explicitly out of scope. There is no signal for it, and none may be added.
Targeting someone because they may be struggling is exploiting a vulnerability
to make a sale.

`CAREER_TRANSITION` exists only for a public, explicit statement by the person
themselves — "I'm changing careers", "taking a gap year". It requires a source
to say it, is never inferred, and is never derived from any indication of
difficulty.

### On organization membership as a proxy

Some organizations correlate with protected attributes — a religious
fellowship, a cultural association, an identity-based professional society.
The system treats membership as social involvement and nothing more. It does
not infer anything about a person from *which* organization they joined beyond
its documented category, and the category lexicons contain no
religious, ethnic or political classifications.

## What the system does not do

- Contact anyone. There is no email, no messaging, no outreach of any kind.
- Scrape social media or private accounts.
- Access anything behind a login.
- Bypass authentication, paywalls, CAPTCHAs or rate limits.
- Build psychological or personality profiles.
- Make hiring decisions. It produces decision support, reviewed by a person.

## Your responsibilities

The software cannot make these judgments for you.

- **Confirm you are entitled to access a source.** Publicly reachable is not
  the same as permitted. Website terms, university policy, and your own
  organization's policy all apply, and a robots.txt that permits crawling does
  not by itself grant you a licence to the data.
- **Know your legal obligations.** GDPR, FERPA, CCPA and equivalents may apply
  depending on where you and the students are. Legitimate interest, notice,
  retention and subject-access obligations are yours to satisfy.
- **Minimise and delete.** Do not collect more than you need. Delete what you
  no longer need. Deleting a university cascades to everything beneath it.
- **Keep exports controlled.** A generated workbook contains personal data.
  Downloads require a session and are audited, but once a file leaves the
  system its handling is on you.
- **Review before acting.** Scores are a way of ordering a list, not a
  judgment about a person.

## Demo data

Everything in Demo Mode is fictional — generated deterministically from name
pools, with no relationship to any real person. The demo banner is always
visible, universities are flagged, and candidate pages carry a synthetic-record
notice. Demo sources never make a network request.

## Reporting a concern

Ethical concerns and privacy issues can be raised the same way as security
issues; see [SECURITY.md](../SECURITY.md). Please do not include real personal
data in a report.
