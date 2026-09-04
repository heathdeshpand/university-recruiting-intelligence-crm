import type { MatchAnalytics } from "@/lib/api/matches";
import { StatCard } from "@/components/app/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Entity-resolution analytics.
 *
 * The numbers a reviewer needs to judge whether resolution is working: how
 * much it consolidated, how much it decided on its own, and how much it
 * handed back.
 */
export function MatchAnalyticsPanel({ analytics }: { analytics: MatchAnalytics }) {
  const consolidation =
    analytics.duplicateRate === null ? null : Math.round(analytics.duplicateRate * 100);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Records"
          value={analytics.totalRecords.toLocaleString()}
          hint="Normalized source records"
        />
        <StatCard
          label="Candidates"
          value={analytics.totalCandidates.toLocaleString()}
          hint={
            consolidation === null
              ? "Entity resolution has not run"
              : `${consolidation}% fewer than records`
          }
        />
        <StatCard
          label="Awaiting a decision"
          value={analytics.pending.toLocaleString()}
          tone={analytics.pending > 0 ? "warning" : "success"}
          hint="Never merged automatically"
        />
        <StatCard
          label="Average confidence"
          value={
            analytics.averageConfidence === null
              ? "—"
              : `${Math.round(analytics.averageConfidence * 100)}%`
          }
          hint="Across every compared pair"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How pairs were decided</CardTitle>
          <CardDescription>
            Only pairs scoring above the review floor are stored. Clear non-matches are discarded
            rather than filling the queue with noise.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Auto-matched" value={analytics.autoMatched} tone="text-success" />
            <Stat label="Probable" value={analytics.probable} tone="text-info" />
            <Stat label="Needs review" value={analytics.manualReview} tone="text-warning" />
            <Stat label="Not matched" value={analytics.notMatched} />
            <Stat label="Confirmed by a person" value={analytics.confirmedByHuman} tone="text-success" />
            <Stat label="Rejected by a person" value={analytics.rejectedByHuman} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`tabular text-xl font-semibold ${tone ?? ""}`}>{value.toLocaleString()}</dd>
    </div>
  );
}
