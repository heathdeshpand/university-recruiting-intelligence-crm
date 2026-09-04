import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { MatchReview } from "@/components/app/match-review";
import { MatchAnalyticsPanel } from "@/components/app/match-analytics";
import { getMatchAnalytics, queryMatches, toMatchView } from "@/lib/api/matches";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entity resolution" };

export default async function EntityResolutionPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const [result, analytics] = await Promise.all([
    queryMatches({ page }),
    getMatchAnalytics(),
  ]);

  return (
    <>
      <PageHeader
        title="Entity resolution"
        description="Records that might describe the same person, and have not been merged automatically. Nothing here is merged until a person decides."
      />

      <div className="space-y-6 p-6">
        <MatchAnalyticsPanel analytics={analytics} />

        <Card>
          <CardHeader>
            <CardTitle>Review queue</CardTitle>
            <CardDescription>
              {result.total === 0
                ? "Nothing is waiting for a decision."
                : `${result.total.toLocaleString()} pair${result.total === 1 ? "" : "s"} waiting, highest scoring first.`}
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            {result.matches.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<CheckCircle2 />}
                  title="No pairs need a decision"
                  description="Either entity resolution has not run yet, or every ambiguous pair has been reviewed."
                />
              </div>
            ) : (
              <div className="border-t">
                {result.matches.map((match) => (
                  <div key={match.id}>
                    <p className="bg-muted/40 px-5 py-1.5 text-xs text-muted-foreground">
                      {match.university.name}
                    </p>
                    <MatchReview match={toMatchView(match)} />
                  </div>
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
                  <Link href={`/entity-resolution?page=${Math.max(1, page - 1)}`}>Previous</Link>
                </Button>
                <Button asChild size="sm" variant="outline" disabled={page >= result.pageCount}>
                  <Link href={`/entity-resolution?page=${Math.min(result.pageCount, page + 1)}`}>
                    Next
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
