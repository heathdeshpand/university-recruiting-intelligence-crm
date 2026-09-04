# Data model

PostgreSQL via Prisma. The full schema is
[`prisma/schema.prisma`](../prisma/schema.prisma), which carries inline
commentary; this page explains the shape and the decisions behind it.

## Layers

```
University ──< UniversitySource ──< RawRecord ──1 NormalizedRecord
                                                      │
                                            CandidateSourceRecord
                                                      │
                                                  Candidate ──< Evidence
                                                      │      ──< Signal
                                                      │      ──< SignalPattern
                                                      │      ──< Score ──< ScoreFactor
                                                      │      ──< EnrichmentJob ──< EnrichmentResult
                                                      └──< CandidateOutcome
```

Three data layers, each linking down to the one below:

| Model | Holds | Mutated by |
| --- | --- | --- |
| `RawRecord` | Exactly what a source returned | Nothing, ever |
| `NormalizedRecord` | Cleaned projection of one raw record | Normalization only |
| `Candidate` | Canonical identity from entity resolution | Resolution, enrichment, humans |

`NormalizedRecord` keeps both forms of every field — `organization` and
`organizationCanonical`, `role` and `roleCanonical`. Comparison uses the
canonical form; display uses the original. A reviewer judging a match needs to
see what the page actually said.

`sourceSpecific` holds fields that do not fit the canonical schema, so a
university's unusual data is preserved rather than discarded.

## Source registry

`UniversitySource` is the answer to "what does this university publish?".

Status distinguishes cases that would otherwise blur together:

| Status | Meaning |
| --- | --- |
| `DISCOVERED` | Found, not yet checked |
| `VALIDATED` | Contains extractable records |
| `ACTIVE` | Collected successfully |
| `REQUIRES_REVIEW` | Reachable but yielded nothing usable |
| `FAILED` | Could not be fetched or parsed |
| `UNAVAILABLE` | **Searched for and not published** |
| `DISABLED` | Switched off by a person |

`UNAVAILABLE` is the one that matters most. A category recorded this way was
looked for and does not exist, which is completely different from a failure —
and different again from never having looked.

`SourceCheck` records one health observation per collection, which is what
makes drift detectable: a source that used to return 200 records and now
returns 4 is reported rather than silently accepted.

## Evidence and signals

`Evidence` connects a candidate attribute to the record that supports it:
statement, original value, source, URL, confidence, and `assertionKind`.

`assertionKind` is load-bearing:

| Kind | Example |
| --- | --- |
| `FACT` | "Listed as treasurer of the Entrepreneurship Club" |
| `INFERENCE` | "Near graduation", derived from a graduation year |
| `UNKNOWN` | No source covered it |

Inference is never promoted to fact, and the UI labels it.

`SignalDefinition` makes the taxonomy data. `Signal` links a candidate to a
definition with a `TriState` value, an occurrence count over distinct
subjects, and a confidence. `SignalEvidence` joins signals to every piece of
evidence supporting them.

## Entity matches

`EntityMatch` is one pairwise comparison between two `NormalizedRecord`s,
unique on `(recordAId, recordBId)` with a canonical ordering. It caches the
candidate ids so the review UI can show candidate A against candidate B
without recomputing clusters.

`matchingFactors` and `conflictingFactors` are stored as JSON so the review
UI can render exactly what the scorer saw.

`manualDecision` plus `decidedById` and `decidedAt` make human decisions
durable. Resolution reads these before it does anything else.

## Scoring

`ScoringConfig` is a named, versioned rule set; `ScoringRule` is one weight.
`Score` is one candidate's score of one kind, with a per-category breakdown;
`ScoreFactor` is one point contribution with its evidence.

Factors keep `evidenceSummary`, `sourceName` and `sourceUrl` as copies rather
than only a foreign key, so a historical score stays explainable after
evidence is rebuilt.

## Jobs, exports, audit

`Job` and `JobLog` carry pipeline runs, progress and output. `Export` records
generated workbooks; the files themselves live outside the repository.
`AuditLog` is append-only and records source activation, match decisions,
manual merges, score recalculation and export downloads.

## Future outcome tracking

`CandidateOutcome` is unused by V1 scoring, which is deliberately
deterministic. It exists so real outcomes — contacted, interviewed, hired,
retained — can be recorded now and compared against the scores the system
produced later. Without a table, that data would simply not be captured, and
no future model could be trained or evaluated.

## Indexes

Composite indexes cover the CRM's actual access patterns —
`(universityId, finalScore)`, `(universityId, discoveryScore)`,
`(universityId, status)`, `(universityId, enrichmentStatus)`,
`(universityId, tier)` — plus `nameKey` and `lastNamePhonetic` for
entity-resolution blocking, and `(jobId, at)` for log tailing.

## Constraints that enforce behaviour

| Constraint | Guarantees |
| --- | --- |
| `RawRecord (sourceId, fingerprint)` unique | Re-collection creates no duplicates |
| `NormalizedRecord.rawRecordId` unique | One normalized record per raw record |
| `CandidateSourceRecord.normalizedRecordId` unique | A record belongs to exactly one candidate |
| `EntityMatch (recordAId, recordBId)` unique | One comparison per pair |
| `Signal (candidateId, definitionKey)` unique | A signal cannot be counted twice |
| `Score (candidateId, kind)` unique | One current score per kind |
| `Evidence (candidateId, fingerprint)` unique | Identical evidence is not duplicated |

These are integrity rules, not optimisations: idempotency and no-double-counting
are enforced by the database, not by careful application code.
