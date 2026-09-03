import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  Database,
  GitMerge,
  Sparkles,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Funnel } from "@/components/app/funnel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getDashboardStats } from "@/lib/api/stats";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  if (stats.universities === 0) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          description="Discover public university data sources, resolve fragmented records into candidates, and rank them with explainable signals."
        />
        <div className="p-6">
          <EmptyState
            icon={<Building2 />}
            title="No universities yet"
            description={
              <>
                Add a university to begin, or run{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  npm run db:seed
                </code>{" "}
                to load the synthetic demo dataset and walk the whole pipeline end to end.
              </>
            }
            action={
              <Button asChild>
                <Link href="/universities/new">Add a university</Link>
              </Button>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Pipeline health across every university in the workspace."
        actions={
          <Button asChild>
            <Link href="/universities/new">Add university</Link>
          </Button>
        }
      />

      <div className="space-y-6 p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Universities"
            value={stats.universities}
            icon={<Building2 />}
            hint="Workspaces being tracked"
          />
          <StatCard
            label="Unique candidates"
            value={stats.candidates.toLocaleString()}
            icon={<Users />}
            hint={`Resolved from ${stats.rawRecords.toLocaleString()} raw records`}
          />
          <StatCard
            label="High-signal"
            value={stats.highSignalCandidates.toLocaleString()}
            tone="success"
            icon={<Sparkles />}
            hint={`Discovery score ≥ ${stats.discoveryThreshold}`}
          />
          <StatCard
            label="Average final score"
            value={stats.averageFinalScore ?? "—"}
            icon={<Sparkles />}
            hint={
              stats.averageFinalScore === null
                ? "Final scoring has not run yet"
                : "Across scored candidates"
            }
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Discovery funnel</CardTitle>
              <CardDescription>
                The product deliberately does not start from the full student body. Each stage
                narrows the set before any contact information is looked up.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Funnel
                stages={[
                  { label: "Raw source records", value: stats.rawRecords },
                  { label: "Normalized records", value: stats.normalizedRecords },
                  { label: "Unique candidates", value: stats.candidates },
                  {
                    label: "High-signal candidates",
                    value: stats.highSignalCandidates,
                    hint: `Qualified for enrichment at a discovery score of ${stats.discoveryThreshold} or above.`,
                  },
                  { label: "Enriched candidates", value: stats.enrichedCandidates },
                ]}
              />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Source health</CardTitle>
                <CardDescription>
                  Universities publish different things. A category that is not found is recorded as
                  unavailable, never as a failure.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Discovered" value={stats.sourcesDiscovered} icon={<Database />} />
                <StatCard label="Active" value={stats.sourcesActive} tone="success" />
                <StatCard label="Not found" value={stats.sourcesNotFound} tone="warning" />
                <StatCard label="Failed" value={stats.sourcesFailed} tone="destructive" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Needs a human</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div className="flex items-center gap-2.5">
                    <GitMerge className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Entity matches awaiting review</p>
                      <p className="text-xs text-muted-foreground">
                        Ambiguous pairs are never merged automatically.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular text-lg font-semibold">{stats.pendingMatches}</span>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/entity-resolution">Review</Link>
                    </Button>
                  </div>
                </div>

                {stats.sourcesFailed > 0 ? (
                  <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle className="size-4 text-destructive" />
                      <div>
                        <p className="text-sm font-medium">Sources failed to collect</p>
                        <p className="text-xs text-muted-foreground">
                          Inspect the error, retry, or disable the source.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular text-lg font-semibold">{stats.sourcesFailed}</span>
                      <Button asChild size="sm" variant="outline">
                        <Link href="/sources?status=FAILED">Inspect</Link>
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
