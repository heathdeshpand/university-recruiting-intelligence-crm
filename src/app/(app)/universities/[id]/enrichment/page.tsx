import Link from "next/link";
import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { getUniversityOr404 } from "@/lib/api/universities";
import { PipelineRunner } from "@/components/app/pipeline-runner";
import { EnrichmentStatusBadge, ScoreBadge } from "@/components/app/badges";
import { StatCard } from "@/components/app/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JOB_TYPE_DESCRIPTIONS, JOB_TYPE_LABELS } from "@/lib/jobs/types";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/util/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Enrichment" };

export default async function UniversityEnrichmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const university = await getUniversityOr404(id);

  const settings = await prisma.universitySettings.findUnique({
    where: { universityId: university.id },
  });
  const threshold = settings?.discoveryThreshold ?? env.DISCOVERY_THRESHOLD;

  const [byStatus, directories, queue, attempts] = await Promise.all([
    prisma.candidate.groupBy({
      by: ["enrichmentStatus"],
      where: { universityId: university.id },
      _count: { _all: true },
    }),
    prisma.universitySource.findMany({
      where: { universityId: university.id, sourceType: "STUDENT_DIRECTORY" },
      select: { id: true, name: true, status: true, url: true, recordCount: true },
    }),
    prisma.candidate.findMany({
      where: { universityId: university.id, enrichmentStatus: "QUEUED" },
      orderBy: { discoveryScore: "desc" },
      take: 25,
      select: {
        id: true,
        canonicalName: true,
        discoveryScore: true,
        signalCount: true,
        patterns: { select: { label: true }, take: 2 },
      },
    }),
    prisma.enrichmentJob.findMany({
      where: { universityId: university.id },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        candidate: { select: { id: true, canonicalName: true } },
        results: { take: 1, orderBy: { createdAt: "desc" } },
      },
    }),
  ]);

  const count = (status: string) =>
    byStatus.find((s) => s.enrichmentStatus === status)?._count._all ?? 0;

  const usableDirectory = directories.find(
    (d) => d.status === "ACTIVE" || d.status === "VALIDATED",
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Below threshold" value={count("NOT_ELIGIBLE").toLocaleString()} hint="Never looked up" />
        <StatCard label="Queued" value={count("QUEUED").toLocaleString()} tone="info" />
        <StatCard label="Enriched" value={count("ENRICHED").toLocaleString()} tone="success" />
        <StatCard label="No match" value={count("FAILED").toLocaleString()} tone="warning" />
        <StatCard label="Ambiguous" value={count("MANUAL_REVIEW").toLocaleString()} tone="warning" />
      </div>

      {!usableDirectory ? (
        <Alert variant="info">
          <AlertTitle>This university has no usable directory source</AlertTitle>
          <AlertDescription>
            {directories.length === 0
              ? "Discovery found no public student directory. That is common, and it is not a failure: candidates are still fully discovered, resolved and scored on their public involvement — there is simply no contact information to look up."
              : "A directory source exists but has not validated as usable. Check it on the Sources tab."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Enrichment queue</CardTitle>
              <CardDescription>
                Candidates whose discovery score reached {threshold}. These are the only candidates
                a directory will ever be searched for — the rest of the population is never looked
                up.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {queue.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={<Sparkles />}
                    title="Nothing queued"
                    description={`No candidate currently has a discovery score of ${threshold} or above and is awaiting enrichment.`}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidate</TableHead>
                      <TableHead className="text-right">Discovery score</TableHead>
                      <TableHead className="text-right">Signals</TableHead>
                      <TableHead>Why they qualified</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queue.map((candidate) => (
                      <TableRow key={candidate.id}>
                        <TableCell>
                          <Link
                            href={`/candidates/${candidate.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {candidate.canonicalName}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right">
                          <ScoreBadge score={candidate.discoveryScore} />
                        </TableCell>
                        <TableCell className="tabular text-right">{candidate.signalCount}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {candidate.patterns.length > 0
                            ? candidate.patterns.map((p) => p.label).join("; ")
                            : `Discovery score of ${candidate.discoveryScore} met the threshold of ${threshold}`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent attempts</CardTitle>
              <CardDescription>
                What each directory lookup returned, including the ones that found nothing.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {attempts.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">No enrichment has been attempted.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead className="text-right">Confidence</TableHead>
                      <TableHead>Matched entry</TableHead>
                      <TableHead>Attempted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attempts.map((job) => {
                      const result = job.results[0];
                      return (
                        <TableRow key={job.id}>
                          <TableCell>
                            <Link
                              href={`/candidates/${job.candidate.id}`}
                              className="text-primary hover:underline"
                            >
                              {job.candidate.canonicalName}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <EnrichmentStatusBadge status={job.status} />
                          </TableCell>
                          <TableCell className="tabular text-right">
                            {result?.matchConfidence
                              ? `${Math.round(result.matchConfidence * 100)}%`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-sm">{result?.matchedName ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDateTime(job.createdAt)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <PipelineRunner
            universitySlug={university.slug}
            defaultStage="ENRICHMENT"
            stages={[
              {
                type: "ENRICHMENT",
                label: JOB_TYPE_LABELS.ENRICHMENT,
                description: JOB_TYPE_DESCRIPTIONS.ENRICHMENT,
              },
              {
                type: "FINAL_SCORING",
                label: JOB_TYPE_LABELS.FINAL_SCORING,
                description: "Re-rank candidates once enrichment has added what it could.",
              },
            ]}
          />

          <Card>
            <CardHeader>
              <CardTitle>Enrichment sources</CardTitle>
              <CardDescription>
                Read only during enrichment, and only for candidates that qualified.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {directories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No directory source has been discovered for this university.
                </p>
              ) : (
                <ul className="space-y-2">
                  {directories.map((d) => (
                    <li key={d.id} className="text-sm">
                      <p className="font-medium">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{d.status.toLowerCase()}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
