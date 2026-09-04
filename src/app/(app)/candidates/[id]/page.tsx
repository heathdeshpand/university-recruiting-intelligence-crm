import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, GitMerge, Mail } from "lucide-react";
import type { SignalCategory } from "@prisma/client";
import { getCandidateDetail } from "@/lib/api/candidates";
import { PageHeader } from "@/components/app/page-header";
import { ScoreBreakdown, type ScoreFactorView } from "@/components/app/score-breakdown";
import {
  CandidateStatusBadge,
  ConfidenceBadge,
  ConfidencePercent,
  EnrichmentStatusBadge,
  MatchStatusBadge,
  TierBadge,
} from "@/components/app/badges";
import { CandidateActions } from "@/app/(app)/candidates/[id]/actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatDateTime, humanizeEnum } from "@/lib/util/format";
import type { CategoryBreakdown } from "@/lib/pipeline/scoring/engine";

export const dynamic = "force-dynamic";

const SIGNAL_GROUPS: Array<{ label: string; categories: SignalCategory[] }> = [
  { label: "Social involvement", categories: ["SOCIAL"] },
  { label: "Competitive", categories: ["COMPETITIVE"] },
  {
    label: "Career and sales",
    categories: ["SALES", "BUSINESS", "ENTREPRENEURSHIP", "WORK_EXPERIENCE", "CUSTOMER_FACING", "CAREER"],
  },
  { label: "Leadership", categories: ["LEADERSHIP"] },
  { label: "Timing", categories: ["TIMING", "JOB_SEARCH"] },
  { label: "Other", categories: ["OTHER"] },
];

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidate = await getCandidateDetail(id);
  if (!candidate) notFound();

  const discovery = candidate.scores.find((s) => s.kind === "DISCOVERY");
  const final = candidate.scores.find((s) => s.kind === "FINAL");

  const toFactorView = (score: typeof discovery): ScoreFactorView[] =>
    (score?.factors ?? []).map((f) => ({
      id: f.id,
      ruleKey: f.ruleKey,
      label: f.label,
      category: f.category,
      points: f.points,
      evidenceSummary: f.evidenceSummary,
      sourceName: f.sourceName,
      sourceUrl: f.sourceUrl,
      confidence: f.confidence,
    }));

  const matches = [...candidate.matchesAsA, ...candidate.matchesAsB].sort(
    (a, b) => b.matchScore - a.matchScore,
  );

  const latestEnrichment = candidate.enrichmentJobs[0];
  const enrichmentResult = latestEnrichment?.results[0];

  return (
    <>
      <PageHeader
        breadcrumb={
          <span className="flex items-center gap-1.5">
            <Link href="/candidates" className="hover:underline">
              Candidates
            </Link>
            <span>/</span>
            <Link href={`/universities/${candidate.university.slug}`} className="hover:underline">
              {candidate.university.name}
            </Link>
          </span>
        }
        title={
          <span className="flex items-center gap-2.5">
            <TierBadge tier={candidate.tier} />
            {candidate.canonicalName}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <CandidateStatusBadge status={candidate.status} />
            <EnrichmentStatusBadge status={candidate.enrichmentStatus} />
            {candidate.manuallyEdited ? <Badge variant="info">Manually edited</Badge> : null}
            {candidate.needsReview ? <Badge variant="warning">Needs review</Badge> : null}
          </span>
        }
        actions={<CandidateActions candidateId={candidate.id} status={candidate.status} />}
      />

      <div className="space-y-6 p-6">
        {candidate.university.isDemo ? (
          <Alert variant="warning">
            <AlertTitle>Synthetic record</AlertTitle>
            <AlertDescription>
              This candidate is fictional, generated for the demo dataset. No real person is
              represented.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                <Field label="University" value={candidate.university.name} />
                <Field label="Major" value={candidate.major} />
                <Field
                  label="Graduation year"
                  value={candidate.graduationYear ? String(candidate.graduationYear) : null}
                />
                <Field
                  label="Career stage"
                  value={candidate.careerStage === "UNKNOWN" ? null : humanizeEnum(candidate.careerStage)}
                />
                <Field
                  label="Email"
                  value={candidate.email}
                  icon={candidate.email ? <Mail className="size-3.5" /> : undefined}
                />
                <Field
                  label="Source records"
                  value={`${candidate.recordCount} across ${candidate.sourceCount} source${candidate.sourceCount === 1 ? "" : "s"}`}
                />
              </dl>

              <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                A field shown as unknown means no source covered it. It does not mean the answer is
                no.
              </p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Signal patterns</CardTitle>
              <CardDescription>
                Named combinations of signals that co-occur. These describe what the evidence shows;
                they are not conclusions about the person.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {candidate.patterns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No signal combinations were detected for this candidate.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {candidate.patterns.map((pattern) => (
                    <li key={pattern.id}>
                      <Badge variant="default" className="px-2.5 py-1">
                        {pattern.label}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ScoreBreakdown
            title="Discovery score"
            description="Decides whether this candidate is worth enriching. Uses only signals available before any contact lookup."
            value={candidate.discoveryScore}
            breakdown={(discovery?.breakdown ?? null) as Record<string, CategoryBreakdown> | null}
            factors={toFactorView(discovery)}
            configName={discovery?.config.name}
          />
          <ScoreBreakdown
            title="Final score"
            description="The ranking score, computed after enrichment from all available signals."
            value={candidate.finalScore}
            breakdown={(final?.breakdown ?? null) as Record<string, CategoryBreakdown> | null}
            factors={toFactorView(final)}
            configName={final?.config.name}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Signals and evidence</CardTitle>
            <CardDescription>
              Every signal, and the source records that support it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {candidate.signals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No signals have been extracted. Run signal extraction for this university.
              </p>
            ) : (
              SIGNAL_GROUPS.map((group) => {
                const signals = candidate.signals.filter((s) => group.categories.includes(s.category));
                if (signals.length === 0) return null;

                return (
                  <div key={group.label}>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </h4>
                    <ul className="space-y-2">
                      {signals.map((signal) => (
                        <li key={signal.id} className="rounded-md border p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{signal.definition.label}</span>
                            <Badge variant="success">Yes</Badge>
                            {signal.occurrences > 1 ? (
                              <Badge variant="secondary">{signal.occurrences}×</Badge>
                            ) : null}
                            <ConfidenceBadge confidence={signal.confidence} />
                          </div>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {signal.definition.description}
                          </p>

                          {signal.evidenceLinks.length > 0 ? (
                            <ul className="mt-2 space-y-1 border-l-2 border-muted pl-3">
                              {signal.evidenceLinks.map((link) => (
                                <li key={link.evidenceId} className="text-sm">
                                  <span>{link.evidence.statement}</span>
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {link.evidence.assertionKind === "INFERENCE" ? "(inferred) " : ""}
                                    {link.evidence.source?.name ?? "unknown source"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-xs italic text-muted-foreground">
                              Derived from the candidate&rsquo;s graduation year rather than a
                              specific source record.
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Source records</CardTitle>
            <CardDescription>
              Every record entity resolution assigned to this candidate, exactly as each source
              published it.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name as published</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Major</TableHead>
                  <TableHead className="text-right">Year</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Assigned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidate.sourceRecords.map((link) => {
                  const record = link.normalizedRecord;
                  const source = record.rawRecord.source;
                  return (
                    <TableRow key={link.id}>
                      <TableCell className="font-medium">
                        {record.rawRecord.rawName ?? record.normalizedName}
                      </TableCell>
                      <TableCell>{record.organization ?? "—"}</TableCell>
                      <TableCell>{record.role ?? "—"}</TableCell>
                      <TableCell>{record.major ?? "—"}</TableCell>
                      <TableCell className="tabular text-right">
                        {record.graduationYear ?? "—"}
                      </TableCell>
                      <TableCell>
                        {source.url.startsWith("about:") ? (
                          source.name
                        ) : (
                          <a
                            href={record.rawRecord.rawUrl ?? source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            {source.name}
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </TableCell>
                      <TableCell>
                        {link.pinned ? (
                          <Badge variant="info">Pinned by a reviewer</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Automatic</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Entity resolution</CardTitle>
            <CardDescription>
              How confident the system is that these records describe one person, and what it
              compared to decide.
              {candidate.matchConfidence !== null ? (
                <>
                  {" "}
                  Cluster confidence: <ConfidencePercent value={candidate.matchConfidence} />.
                </>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {matches.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                This candidate has a single source record, so there was nothing to compare.
              </p>
            ) : (
              <ul className="divide-y">
                {matches.slice(0, 12).map((match) => {
                  const matching = (match.matchingFactors ?? []) as Array<{ label: string; detail?: string }>;
                  const conflicting = (match.conflictingFactors ?? []) as Array<{ label: string; detail?: string }>;

                  return (
                    <li key={match.id} className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <GitMerge className="size-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {match.recordA.normalizedName} ↔ {match.recordB.normalizedName}
                        </span>
                        <MatchStatusBadge status={match.status} />
                        <span className="tabular text-sm font-semibold">{match.matchScore}</span>
                        {match.manualDecision ? (
                          <Badge variant="info">
                            {match.manualDecision === "CONFIRMED" ? "Confirmed by a reviewer" : "Rejected by a reviewer"}
                          </Badge>
                        ) : null}
                      </div>

                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-medium text-success">Matching</p>
                          <ul className="mt-0.5 space-y-0.5">
                            {matching.map((f, i) => (
                              <li key={i} className="text-sm text-muted-foreground">
                                {f.label}
                                {f.detail ? <span className="text-xs"> — {f.detail}</span> : null}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <p className="text-xs font-medium text-warning">Conflicting</p>
                          {conflicting.length === 0 ? (
                            <p className="mt-0.5 text-sm text-muted-foreground">Nothing conflicts.</p>
                          ) : (
                            <ul className="mt-0.5 space-y-0.5">
                              {conflicting.map((f, i) => (
                                <li key={i} className="text-sm text-muted-foreground">
                                  {f.label}
                                  {f.detail ? <span className="text-xs"> — {f.detail}</span> : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Enrichment</CardTitle>
            <CardDescription>
              Directory lookups are only attempted for candidates that passed the discovery
              threshold.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!latestEnrichment ? (
              <p className="text-sm text-muted-foreground">
                {candidate.enrichmentStatus === "NOT_ELIGIBLE"
                  ? "This candidate's discovery score is below the threshold, so no contact lookup was attempted. That is by design, not a failure."
                  : "No enrichment has been attempted yet."}
              </p>
            ) : (
              <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Outcome" value={humanizeEnum(enrichmentResult?.outcome ?? latestEnrichment.status)} />
                <Field
                  label="Match confidence"
                  value={
                    enrichmentResult?.matchConfidence
                      ? `${Math.round(enrichmentResult.matchConfidence * 100)}%`
                      : null
                  }
                />
                <Field label="Matched entry" value={enrichmentResult?.matchedName ?? null} />
                <Field label="Directory" value={latestEnrichment.source?.name ?? null} />
                <Field
                  label="Qualified at"
                  value={
                    latestEnrichment.qualifiedScore !== null
                      ? `Discovery score ${latestEnrichment.qualifiedScore}`
                      : null
                  }
                />
                <Field label="Attempted" value={formatDateTime(latestEnrichment.createdAt)} />
                {latestEnrichment.error ? (
                  <div className="sm:col-span-2 lg:col-span-4">
                    <dt className="text-xs text-muted-foreground">Why it did not complete</dt>
                    <dd className="text-sm">{latestEnrichment.error}</dd>
                  </div>
                ) : null}
              </dl>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Field({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | null | undefined;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1.5 text-sm font-medium">
        {value ? (
          <>
            {icon}
            <span className="min-w-0 truncate" title={value}>
              {value}
            </span>
          </>
        ) : (
          <span
            className="font-normal text-muted-foreground"
            title="No source covered this field. Unknown, not absent."
          >
            Unknown
          </span>
        )}
      </dd>
    </div>
  );
}
