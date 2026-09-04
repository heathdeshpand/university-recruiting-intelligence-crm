import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { getUniversityOr404 } from "@/lib/api/universities";
import { MatchReview } from "@/components/app/match-review";
import { MatchAnalyticsPanel } from "@/components/app/match-analytics";
import { getMatchAnalytics, queryMatches, toMatchView } from "@/lib/api/matches";
import { PipelineRunner } from "@/components/app/pipeline-runner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { JOB_TYPE_DESCRIPTIONS, JOB_TYPE_LABELS } from "@/lib/jobs/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entity resolution" };

export default async function UniversityEntityResolutionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const university = await getUniversityOr404(id);
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const [result, analytics] = await Promise.all([
    queryMatches({ universityId: university.id, page }),
    getMatchAnalytics(university.id),
  ]);

  const base = `/universities/${university.slug}/entity-resolution`;

  return (
    <div className="space-y-6">
      <MatchAnalyticsPanel analytics={analytics} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Review queue</CardTitle>
              <CardDescription>
                Pairs that scored high enough to be worth checking but not high enough to merge on
                their own. A rejection is permanent: later runs will not merge the pair, and
                clustering refuses any chain that would reunite them.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0">
              {result.matches.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={<CheckCircle2 />}
                    title="Nothing waiting"
                    description="Either entity resolution has not run for this university, or every ambiguous pair has been decided."
                  />
                </div>
              ) : (
                <div className="border-t">
                  {result.matches.map((match) => (
                    <MatchReview key={match.id} match={toMatchView(match)} />
                  ))}
                </div>
              )}
            </CardContent>

            {result.pageCount > 1 ? (
              <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
                <p className="tabular text-sm text-muted-foreground">
                  Page {result.page} of {result.pageCount}
                </p>
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline" disabled={page <= 1}>
                    <Link href={`${base}?page=${Math.max(1, page - 1)}`}>Previous</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" disabled={page >= result.pageCount}>
                    <Link href={`${base}?page=${Math.min(result.pageCount, page + 1)}`}>Next</Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-4">
          <PipelineRunner
            universitySlug={university.slug}
            defaultStage="ENTITY_RESOLUTION"
            stages={[
              {
                type: "ENTITY_RESOLUTION",
                label: JOB_TYPE_LABELS.ENTITY_RESOLUTION,
                description: JOB_TYPE_DESCRIPTIONS.ENTITY_RESOLUTION,
              },
              {
                type: "SIGNAL_EXTRACTION",
                label: JOB_TYPE_LABELS.SIGNAL_EXTRACTION,
                description:
                  "Run after merging records so each candidate's evidence reflects the records it now owns.",
              },
            ]}
          />

          <Card>
            <CardHeader>
              <CardTitle>How merging is decided</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">85 and above</strong> merges automatically.
                Reaching it requires corroboration beyond the name.
              </p>
              <p>
                <strong className="text-foreground">70 to 84</strong> is a probable match, shown
                here for a decision.
              </p>
              <p>
                <strong className="text-foreground">50 to 69</strong> is worth a look but weak.
              </p>
              <p>
                Two records that agree on nothing but a name cap out around 58, so people who
                merely share a name are never merged automatically.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
