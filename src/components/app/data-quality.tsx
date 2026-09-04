import Link from "next/link";
import type { DataQuality } from "@/lib/api/stats";
import { StatCard } from "@/components/app/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { humanizeEnum } from "@/lib/util/format";

/**
 * The data-quality panel.
 *
 * Shows the unflattering numbers on purpose. How much of the raw data never
 * became a person, how many matches nobody has decided, how many candidates
 * have no major recorded. These tell a recruiter how much to trust what they
 * are looking at, and omitting them would make the product feel more
 * confident than it has earned.
 */
export function DataQualityPanel({
  quality,
  universitySlug,
}: {
  quality: DataQuality;
  universitySlug?: string;
}) {
  const base = universitySlug ? `/universities/${universitySlug}` : "";
  const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

  const enrichmentSuccess =
    quality.enrichmentAttempted > 0
      ? pct(quality.enrichmentMatched, quality.enrichmentAttempted)
      : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Consolidation"
          value={
            quality.consolidationRate === null
              ? "—"
              : `${Math.round(quality.consolidationRate * 100)}%`
          }
          hint={`${quality.normalizedRecords.toLocaleString()} records became ${quality.candidates.toLocaleString()} people`}
        />
        <StatCard
          label="Match confidence"
          value={
            quality.averageMatchConfidence === null
              ? "—"
              : `${Math.round(quality.averageMatchConfidence * 100)}%`
          }
          hint="Average across merged clusters"
        />
        <StatCard
          label="Awaiting a decision"
          value={quality.unresolvedMatches.toLocaleString()}
          tone={quality.unresolvedMatches > 0 ? "warning" : "success"}
          hint="Never merged automatically"
        />
        <StatCard
          label="Enrichment success"
          value={enrichmentSuccess === null ? "—" : `${enrichmentSuccess}%`}
          tone={enrichmentSuccess !== null && enrichmentSuccess < 50 ? "warning" : "default"}
          hint={
            quality.enrichmentAttempted === 0
              ? "No enrichment attempted"
              : `${quality.enrichmentMatched} of ${quality.enrichmentAttempted} attempts matched`
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Where records were lost</CardTitle>
            <CardDescription>
              Every drop between stages, so a parser problem shows up as a number rather than as
              quietly missing people.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2.5">
              <Row label="Raw source records" value={quality.rawRecords} />
              <Row
                label="Normalized"
                value={quality.normalizedRecords}
                hint={`${pct(quality.normalizedRecords, quality.rawRecords)}% of raw`}
              />
              <Row
                label="Not normalized"
                value={quality.unnormalizedRecords}
                tone={quality.unnormalizedRecords > 0 ? "warning" : undefined}
                hint="No person name could be parsed from these"
              />
              <Row label="Unique candidates" value={quality.candidates} />
              <Row
                label="Flagged for review"
                value={quality.candidatesNeedingReview}
                tone={quality.candidatesNeedingReview > 0 ? "warning" : undefined}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Unknown fields</CardTitle>
            <CardDescription>
              Unknown is not the same as absent. These candidates simply have no source covering
              the field, and nothing is scored down for it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2.5">
              <Row
                label="No major recorded"
                value={quality.missingMajor}
                hint={`${pct(quality.missingMajor, quality.candidates)}% of candidates`}
              />
              <Row
                label="No graduation year"
                value={quality.missingGraduationYear}
                hint={`${pct(quality.missingGraduationYear, quality.candidates)}% of candidates`}
              />
              <Row
                label="No email"
                value={quality.missingEmail}
                hint="Expected — only enriched candidates have one"
              />
              <Row
                label="Not yet scored"
                value={quality.unscored}
                tone={quality.unscored > 0 ? "warning" : undefined}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Source health</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2.5">
              <Row label="Active" value={quality.sourcesActive} tone="success" />
              <Row
                label="Needs review"
                value={quality.sourcesNeedingReview}
                tone={quality.sourcesNeedingReview > 0 ? "warning" : undefined}
                hint="Reachable, but yielded nothing usable"
              />
              <Row
                label="Failed"
                value={quality.sourcesFailed}
                tone={quality.sourcesFailed > 0 ? "destructive" : undefined}
              />
              <Row
                label="Not found"
                value={quality.sourcesNotFound}
                hint="Searched for and not published — not a failure"
              />
            </dl>
            {base ? (
              <Link
                href={`${base}/sources`}
                className="mt-3 inline-block text-sm text-primary hover:underline"
              >
                Inspect sources
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Signals by category</CardTitle>
            <CardDescription>
              A category with no signals usually means the university publishes nothing that
              produces them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {quality.candidatesBySignalCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No signals have been extracted yet.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {quality.candidatesBySignalCategory.map((row) => {
                  const max = Math.max(
                    ...quality.candidatesBySignalCategory.map((r) => r.count),
                    1,
                  );
                  return (
                    <li key={row.category} className="flex items-center gap-3">
                      <span className="w-36 shrink-0 truncate text-sm">
                        {humanizeEnum(row.category)}
                      </span>
                      <span className="h-3 flex-1 overflow-hidden rounded bg-muted">
                        <span
                          className="block h-full rounded bg-primary/70"
                          style={{ width: `${(row.count / max) * 100}%` }}
                        />
                      </span>
                      <span className="tabular w-14 shrink-0 text-right text-sm">
                        {row.count.toLocaleString()}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {quality.candidatesBySource.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Records by source</CardTitle>
            <CardDescription>
              Which sources are actually carrying the dataset. A source that used to contribute a
              lot and now contributes little is worth investigating.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {quality.candidatesBySource.map((row) => {
                const max = Math.max(...quality.candidatesBySource.map((r) => r.count), 1);
                return (
                  <li key={row.name} className="flex items-center gap-3">
                    <span className="w-64 shrink-0 truncate text-sm" title={row.name}>
                      {row.name}
                    </span>
                    <span className="h-3 flex-1 overflow-hidden rounded bg-muted">
                      <span
                        className="block h-full rounded bg-info/70"
                        style={{ width: `${(row.count / max) * 100}%` }}
                      />
                    </span>
                    <span className="tabular w-16 shrink-0 text-right text-sm">
                      {row.count.toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "success" | "warning" | "destructive";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "destructive"
          ? "text-destructive"
          : "";

  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0">
        <span className="text-sm">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </dt>
      <dd className={`tabular shrink-0 text-sm font-semibold ${toneClass}`}>
        {value.toLocaleString()}
      </dd>
    </div>
  );
}
