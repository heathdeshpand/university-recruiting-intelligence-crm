# Source discovery and adapters

How the system finds what a university publishes, decides whether it is
usable, and reads it.

## Discovery is a search, not an assumption

The categories below are **search targets**. A university that publishes only
athletics and student organizations is entirely normal. Discovery records what
it looked for and did not find, and the pipeline continues.

Greek life · Student organizations · Club sports · Intramurals · Athletics ·
Student government · Entrepreneurship · Business organizations · Sales
organizations · Competitive organizations · Public student directory

Each category (`src/lib/config/discovery.ts`) carries path hints, title
keywords, roster vocabulary, subdomain hints, and a preferred extractor.

## Providers

A provider's only job is to propose URLs. It does not classify beyond a first
guess and never decides usability.

| Provider | Needs | What it does |
| --- | --- | --- |
| **Demo fixtures** | nothing | Serves the synthetic set. No network access, ever. |
| **Domain crawler** | `ENABLE_LIVE_NETWORK=true` | The default. Seed paths, then sitemaps, then a bounded priority crawl. |
| **Search API** | `SEARCH_PROVIDER` + `SEARCH_API_KEY` | Optional. One site-scoped search per category. |

Providers that can run all run, and their proposals are merged; where two
propose the same URL the more confident classification wins. A category counts
as "not found" only when every provider that ran agreed.

### The crawler

Three passes, cheapest first:

1. **Seed paths** — a short list of well-formed guesses (`/greek-life`,
   `/clubsports`, `/organizations`). A 404 costs almost nothing; a hit saves a
   whole crawl.
2. **Sitemaps** — by far the highest-quality URL source when one exists.
3. **Priority crawl** — bounded breadth-first, with the frontier ordered by how
   much each link looks like it leads to records.

Hard limits: never leaves the university's configured domains or their
subdomains, never exceeds `DISCOVERY_MAX_PAGES`, never goes deeper than
`DISCOVERY_MAX_DEPTH`.

## Classification

`classifyUrl` scores a URL against every category from its path, subdomain,
page title, link text and roster vocabulary. It is a transparent scoring
function, not a model — every point is attributable to a rule, which is what
lets the Sources panel explain a classification and lets a recruiter correct
it sensibly.

The most **specific** matching path hint wins, not the first. Without that,
`/recreation/club-sports/rosters` matches athletics on `sports` before it
matches club sports on `club-sports`, and a club sport roster gets filed as
varsity athletics.

## Validation: the important step

Classification says what a page probably is. Validation decides whether it is
**usable**, and this is what stops the registry filling with plausible rubbish.

**Validation is a dry run of extraction.** Rather than guessing from keywords,
it asks the extractor registry to actually parse the page and counts what
comes out.

| Outcome | Meaning |
| --- | --- |
| ≥ 3 records | `VALIDATED` — usable |
| 1–2 records | `REQUIRES_REVIEW` — possibly a partial listing or false positive |
| 0 records | `REQUIRES_REVIEW`, with a reason |
| PDF or JS-rendered | `REQUIRES_REVIEW`, needs an adapter this version lacks |

A page titled "Club Sports" that only describes the programme genuinely yields
zero records, so it is correctly rejected. A page listing members yields
records, so it is accepted. The page's title never decides.

Confidence blends extractor fit with volume, so a page yielding three records
does not look as certain as one yielding two hundred.

## Extractors

An extractor implements two methods:

```ts
export interface Extractor {
  type: ParserType;
  label: string;
  description: string;
  /** How well this fits the page, 0-1. The registry picks the highest. */
  detect(input: ExtractorInput): number;
  extract(input: ExtractorInput): ExtractionOutcome;
}
```

**Selection is by capability, not configuration.** Every extractor scores its
own fit and the highest wins. This means a source whose parser was guessed
wrong still works, and adding an extractor cannot break the existing ones.

| Extractor | Score | Handles |
| --- | --- | --- |
| `JSON_ENDPOINT` | 1.0 | Structured JSON; finds the record array inside any envelope |
| `CSV` | 1.0 | Manual imports and CSV endpoints |
| `ATHLETICS_ROSTER` | ≤ 0.98 | Athletics dialect: `No.`, `Pos.`, `Cl.`, `Hometown` |
| `HTML_TABLE` | ≤ 0.87 | Tables, header-mapped or by finding the name column |
| `ORG_DIRECTORY` | ≤ 0.95 | Repeated cards under organization headings |
| `RENDERED_UNSUPPORTED` | 0.5 | Pages built in the browser |
| `PDF_UNSUPPORTED` | ≤ 1.0 | PDFs |
| `GENERIC_HTML` | ≤ 0.45 | Last resort; capped so it never beats a real match |

The bands are deliberate. Structured formats win outright. The generic
fallback is capped below every structured strategy. `HTML_TABLE` is capped
below `ATHLETICS_ROSTER` so a roster page goes to the specialist that keeps
the sport, rather than to a plain table read that loses it.

### Honest failures

`PDF_UNSUPPORTED` and `RENDERED_UNSUPPORTED` **claim** the pages they cannot
read and explain why. Returning zero records silently would look like a parser
bug; claiming the page lets the UI say "this needs a different adapter" and
suggest the CSV import path.

### Structural drift

Extraction produces a `structureHash` of the page's shape. When it changes
between collections, or when the configured extractor stops fitting, a warning
is attached to the source. Extraction still runs — the point is to flag it,
not to fail.

## Adding an extractor

1. Create `src/lib/pipeline/extract/extractors/<name>.ts` implementing
   `Extractor`.
2. `detect` returns 0 when inapplicable, otherwise a fit score in the band
   above.
3. `extract` returns `ExtractedRecord[]` plus a `structureHash` and any
   warnings. Put unmapped fields in `raw` — never discard them.
4. Add the value to the `ParserType` enum and migrate.
5. Register it in `EXTRACTORS` in `registry.ts`. Order does not matter.
6. Test it: a page it should read, a page it should decline, and a page that
   looks right but contains no people.

Nothing else changes. Discovery, validation, collection and everything
downstream pick it up automatically.

## Access priority

1. Official API
2. Public structured data
3. Public JSON endpoints
4. Public HTML
5. JavaScript-rendered pages *(not supported; reported as such)*
6. PDFs *(not supported; reported as such)*
7. Manual CSV import — the documented fallback

## What the fetch layer will not do

Every outbound request goes through one client (`src/lib/pipeline/http.ts`),
so these cannot be bypassed by a new adapter:

- **Live network access is off by default.** A fresh checkout cannot contact a
  real university until someone sets `ENABLE_LIVE_NETWORK=true`.
- **robots.txt is fetched, cached and honoured** per host. If it cannot be
  read, the host is treated as disallowed — it fails closed.
- **A minimum delay between requests to one host**, serialized per host so
  concurrency cannot defeat it. `Crawl-delay` is honoured when longer.
- **An honest, contactable User-Agent.**
- **A response size cap and a request timeout.**

There is deliberately no support for solving CAPTCHAs, authenticating, or
retrying past a 403. If a source cannot be fetched legitimately, it is marked
unavailable and the run continues.
