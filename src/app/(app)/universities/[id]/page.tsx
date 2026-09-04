import Link from "next/link";
import { AlertTriangle, Database, GitMerge, Sparkles, Users } from "lucide-react";
import { getUniversityOr404, getUniversityOverview } from "@/lib/api/universities";
import { env } from "@/lib/env";
import { StatCard } from "@/components/app/stat-card";
import { Funnel } from "@/components/app/funnel";
import { PipelineRunner, type StageOption } from "@/components/app/pipeline-runner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { JOB_TYPE_DESCRIPTIONS, JOB_TYPE_LABELS, PIPELINE_STAGES } from "@/lib/jobs/types";
import { formatRelative } from "@/lib/util/format";

export const dynamic = "force-dynamic";

const STAGES: StageOption[] = [
  {
    type: "FULL_PIPELINE",
    label: JOB_TYPE_LABELS.FULL_PIPELINE,
    description: JOB_TYPE_DESCRIPTIONS.FULL_PIPELINE,
  },
  ...PIPELINE_STAGES.map((type) => ({
    type,
    label: JOB_TYPE_LABELS[type],
    description: JOB_TYPE_DESCRIPTIONS[type],
  })),
];

export default async function UniversityOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const university = await getUniversityOr404(id);
  const overview = await getUniversityOverview(university.id, env.DISCOVERY_THRESHOLD);

  const base = `/universities/${university.slug}`;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Sources"
          value={overview.sources.total}
          icon={<Database />}
          hint={`${overview.sources.active} active · ${overview.sources.unavailable} not found · ${overview.sources.failed} failed`}
        />
        <StatCard
          label="Unique candidates"
          value={overview.candidates.toLocaleString()}
          icon={<Users />}
          hint={`Resolved from ${overview.rawRecords.toLocaleString()} raw records`}
        />
        <StatCard
          label="High-signal"
          value={overview.highSignalCandidates.toLocaleString()}
          tone="success"
          icon={<Sparkles />}
          hint={`Discovery score ≥ ${overview.discoveryThreshold}`}
        />
        <StatCard
          label="Average final score"
          value={overview.averageFinalScore ?? "—"}
          hint={
            overview.averageFinalScore === null
              ? "Final scoring has not run yet"
              : `${overview.scoredCandidates.toLocaleString()} candidates scored`
          }
        />
      </div>

      {overview.pendingMatches > 0 ? (
        <Alert variant="warning">
          <GitMerge />
          <AlertTitle>{overview.pendingMatches} match{overview.pendingMatches === 1 ? "" : "es"} need a human decision</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              These pairs scored high enough to be worth checking but not high enough to merge
              automatically. Nothing is merged until you say so.
            </span>
            <Button asChild size="sm" variant="outline">
              <Link href={`${base}/entity-resolution`}>Review them</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {overview.sources.failed > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>
            {overview.sources.failed} source{overview.sources.failed === 1 ? "" : "s"} could not be collected
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>The rest of the pipeline ran normally. Inspect the error to decide what to do.</span>
            <Button asChild size="sm" variant="outline">
              <Link href={`${base}/sources`}>Inspect sources</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <PipelineRunner universitySlug={university.slug} stages={STAGES} />
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Funnel</CardTitle>
              <CardDescription>
                Contact details are only ever looked up for candidates that reach the threshold.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Funnel
                stages={[
                  { label: "Raw records", value: overview.rawRecords },
                  { label: "Normalized", value: overview.normalizedRecords },
                  { label: "Unique candidates", value: overview.candidates },
                  { label: "High-signal", value: overview.highSignalCandidates },
                  { label: "Enriched", value: overview.enrichedCandidates },
                ]}
              />
            </CardContent>
          </Card>

          {overview.missingCategories.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Categories not found</CardTitle>
                <CardDescription>
                  Discovery searched for these and found no page containing extractable records.
                  That means this university does not appear to publish them — not that its students
                  have no involvement of that kind.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-wrap gap-1.5">
                  {overview.missingCategories.map((label) => (
                    <li
                      key={label}
                      className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
                    >
                      {label}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Last collection</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {formatRelative(overview.lastCollectionAt)}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
