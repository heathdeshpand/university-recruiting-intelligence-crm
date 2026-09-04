# Entity resolution

The flagship feature, and the one most likely to be wrong in a way that
matters. This document explains the model, the calibration, and the failure
it is most carefully designed to avoid.

## The problem

One person, four sources:

| Source | Name as published | Organization | Year | Major |
| --- | --- | --- | --- | --- |
| Greek life directory | Michael Johnson | Sigma Chi Delta | 2027 | — |
| Club sports roster | Mike Johnson | Club Soccer | 2027 | — |
| Organization directory | Michael A. Johnson | Entrepreneurship Club | 2027 | Economics |
| Athletics roster | Johnson, Michael | Track and Field | 2027 | Economics |

Four records, one person. Deduplicating on exact name gets none of them.

And the mirror image — two people, one name:

| Source | Name | Year | Major |
| --- | --- | --- | --- |
| Organization directory | Elizabeth Hill | 2025 | Biology |
| Club sports roster | Elizabeth Hill | 2028 | Marketing |

Two records, almost certainly two people. Merging them would fuse two
students' evidence into one corrupted profile that no later stage could
untangle.

**Both cases must be handled by the same model.** That constraint drives
every decision below.

## The pipeline

```
Normalized records
    ↓  blocking          group records worth comparing
    ↓  pairwise scoring  score every pair within a block
    ↓  persistence       store every pair scoring 50+
    ↓  clustering        merge confident edges, respecting human decisions
    ↓  candidates        one canonical identity per cluster
```

## Blocking

Comparing every record with every other is quadratic. Blocking groups records
that could plausibly match so a university with 100,000 records does tens of
thousands of comparisons rather than five billion.

Records are placed in several blocks, because one key would miss real matches:

| Key | Catches |
| --- | --- |
| phonetic surname + first initial | Smith/Smyth, Mike/Michael |
| exact canonical name key | records with no other overlap |
| email | anything, decisively |

The phonetic key is a simplified Metaphone. It is used **only** for blocking —
deciding which pairs are worth a full comparison — never to decide a match.

Blocks above 250 records are sub-blocked by graduation year to keep the work
bounded. The cost is missing a pair that disagrees on year, which the scoring
model would have penalised heavily anyway.

## Pairwise scoring

Two hard gates run first. A pair that fails either scores zero:

- **Surnames must match.** Identical, or Jaro-Winkler ≥ 0.9, or a shared
  phonetic key.
- **Given names must be compatible.** Identical, nickname-equivalent
  (`Mike`/`Michael`), a spelling variant (`Kathryn`/`Catherine`), or an
  initial that could abbreviate the other.

Past the gates, points accumulate:

| Contribution | Points |
| --- | --- |
| Surname agreement | 26 × distinctiveness |
| Given-name agreement | up to 32 |
| Same email address | +45 |
| Same graduation year | +18 |
| Same middle initial | +12 |
| Same major | +12 |
| Same organization | +10 |
| Same sport | +8 |
| Agrees on everything both records state | +10 |
| Different email addresses | −45 |
| Different generational suffix (Jr/Sr) | −25 |
| Different middle initials | −22 |
| Graduation years ≥ 2 apart | −20 |
| Graduation years 1 apart | −6 |
| Different majors | −6 |

### Why name agreement is capped at 58

**This is the most important property in the model.** Surname (26) plus given
name (32) is 58. The auto-merge line is 85. So two records that agree on
nothing but a name cannot reach it — they land in review, where a person
decides.

Everything above 58 comes from corroboration: a graduation year, a major, an
email, a shared organization. Evidence, not coincidence.

There is a test asserting exactly this, and it is the one to keep if you keep
only one.

### Surname distinctiveness

Matching on a surname that appears once in the dataset is far stronger
evidence than matching on the most common one in it. The surname contribution
is scaled by a factor from 1.25 (rare) to 0.75 (very common).

Frequency is counted over **distinct people**, approximated by distinct name
keys — not over rows. Counting rows is subtly wrong in a way that degrades
every match: one person listed by six sources makes their own surname look six
times more common, dampening precisely the evidence that should have merged
those six rows. Fixing this took auto-matches from 75 to 501 on the demo
dataset.

### The no-conflict bonus

Awarded only when a pair shares at least one corroborating field *and*
contradicts on nothing. Agreement is worth more when it survives every
opportunity to disagree: two records that both state a graduation year, state
the same one, and conflict on nothing else are stronger evidence than the sum
of their field matches suggests.

Because it requires corroboration, a name-only pair earns no bonus. That is
what keeps the 58 cap intact.

## Bands

| Score | Status | What happens |
| --- | --- | --- |
| 85–100 | `AUTO_MATCHED` | Merged without asking |
| 70–84 | `PROBABLE_MATCH` | Surfaced for review, not merged |
| 50–69 | `MANUAL_REVIEW` | Surfaced for review |
| 0–49 | `NOT_MATCHED` | Discarded, not stored |

Pairs below 50 are not persisted. Storing every rejected pair would dwarf the
useful data and tell a reviewer nothing.

## Worked examples

**Merged automatically — 96.** Michael Johnson / Michael A. Johnson, both 2027,
both Economics, both in Sigma Chi Delta.
`26 + 32 + 18 (year) + 12 (major) + 10 (org) − 0 + 10 (no conflicts) = 108 → 100`

**Merged automatically — 86.** Greg Oyelaran / Gregory Oyelaran, both 2029,
nothing else in common but nothing conflicting.
`29 (uncommon surname) + 30 (nickname) + 18 (year) + 10 (no conflicts) = 87`

**Sent to review — 65.** Two records reading "Michael Johnson" and nothing
else. `26 × 1.25 + 32 = 65`. No corroboration, so no bonus, so no merge.

**Refused — 45.** Elizabeth Hill 2025 / Elizabeth Hill 2028.
`33 + 32 − 20 (years far apart) = 45`

**Refused — 50.** Same name, same year, same major, different email addresses.
`33 + 32 + 18 + 12 − 45 = 50`. Two addresses almost always mean two people.

## Clustering

Confident pairs merge transitively: if A matches B and B matches C, all three
are one person. But transitivity is dangerous next to a human decision.

Edges are applied strongest-first, and a merge is **refused** if it would
place a rejected pair in the same cluster. If a reviewer said A and B are
different people, a chain through C must not quietly reunite them. Refusals
are counted and reported rather than hidden.

Human confirmations are applied first and unconditionally: a person who said
"these are the same" outranks every automatic score.

## Re-running safely

- Every `EntityMatch` carrying a `manualDecision` is left untouched.
- Rejections are loaded before clustering and constrain it.
- Confirmations are seeded into the union-find before any automatic edge.
- Records a person assigned are `pinned` and never moved.
- Clusters reuse the candidate id that already owns most of their records, so
  CRM links and manual edits survive.
- A candidate left with no records is deleted; its records moved, so no
  evidence is lost.

## Review interface

The queue shows both records field by field with agreements and disagreements
highlighted, the full matching and conflicting factor lists, and three
choices: **same person**, **different people**, **not sure**.

Fields expected to differ between two records of one person — the name form,
the organization, the role, the source — are never highlighted as conflicts.
"Greg" against "Gregory" is the nickname match the model recognises, not a
disagreement.

Confirming merges immediately and pins both records. Rejecting is permanent.

## Results on the demo dataset

1,558 normalized records across three universities resolve to 994 candidates —
a 36% consolidation — with 364 pairs left for a human to decide.

That residue is the honest outcome, not a shortfall. Those pairs genuinely
lack the corroboration to decide automatically, and the deliberate
same-name-different-person records planted in the demo data are among them.

## Known limitations

- Thresholds are a defensible starting point, not a validated model. There is
  no labelled ground truth to tune against.
- Blocking can miss a pair whose surnames differ beyond phonetic similarity —
  a legal name change, or a badly mangled transliteration.
- Sub-blocking large blocks by graduation year trades recall for bounded work.
- The nickname dictionary is US-centric and deliberately conservative:
  ambiguous short forms like "Al" are excluded, because collapsing them would
  create false matches.
- Two genuinely identical people — same name, same year, same major, same
  organizations — are indistinguishable from these sources, and the system
  will merge them. No amount of scoring fixes that; only a distinguishing
  field would.
