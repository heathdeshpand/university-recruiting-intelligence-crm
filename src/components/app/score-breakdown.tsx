import type { Confidence, SignalCategory } from "@prisma/client";
import { ExternalLink } from "lucide-react";
import { groupBreakdown, type CategoryBreakdown } from "@/lib/pipeline/scoring/engine";
import { ScoreBadge } from "@/components/app/badges";
import { cn } from "@/lib/util/cn";

/**
 * A score, its per-category split, and the evidence behind every point.
 *
 * This component is the answer to "why does this candidate have this score?".
 * Nothing here is a summary of the score -- each row is a rule that fired,
 * the evidence that satisfied it, and the source that published it.
 */

export interface ScoreFactorView {
  id: string;
  ruleKey: string;
  label: string;
  category: SignalCategory;
  points: number;
  evidenceSummary: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  confidence: Confidence;
}

export function ScoreBreakdown({
  title,
  description,
  value,
  breakdown,
  factors,
  configName,
}: {
  title: string;
  description?: string;
  value: number | null;
  breakdown: Record<string, CategoryBreakdown> | null;
  factors: ScoreFactorView[];
  configName?: string;
}) {
  const groups = breakdown ? groupBreakdown(breakdown) : [];
  const groupTotal = groups.reduce((sum, g) => sum + g.earned, 0);
  const clamped = value !== null && groupTotal > value;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-4 border-b p-5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
          {configName ? (
            <p className="mt-1 text-xs text-muted-foreground">Rule set: {configName}</p>
          ) : null}
        </div>
        <ScoreBadge score={value} size="lg" />
      </div>

      {value === null ? (
        <p className="p-5 text-sm text-muted-foreground">
          This score has not been computed yet. Run the scoring stage for this university.
        </p>
      ) : (
        <>
          {groups.length > 0 ? (
            <div className="space-y-2.5 border-b p-5">
              {groups.map((group) => {
                const pct = group.max > 0 ? (group.earned / group.max) * 100 : 0;
                return (
                  <div key={group.label}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span>{group.label}</span>
                      <span className="tabular font-medium">
                        {group.earned}
                        <span className="text-muted-foreground">/{group.max}</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          pct >= 80 ? "bg-success" : pct >= 45 ? "bg-info" : "bg-warning",
                        )}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {clamped ? (
                <p className="pt-1 text-xs text-muted-foreground">
                  Categories total {groupTotal}; scores are reported on a 0–100 scale, so this is
                  capped at 100.
                </p>
              ) : null}
            </div>
          ) : null}

          {factors.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No scoring rule fired for this candidate. Every signal the rules look for is either
              absent from their evidence or unknown, and unknown never costs points.
            </p>
          ) : (
            <ul className="divide-y">
              {factors.map((factor) => (
                <li key={factor.id} className="flex gap-3 p-4">
                  <span className="tabular shrink-0 rounded bg-success/12 px-1.5 py-0.5 text-sm font-semibold text-success">
                    +{factor.points}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{factor.label}</p>

                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {factor.evidenceSummary ?? (
                        <span className="italic">
                          Derived from the candidate&rsquo;s graduation year rather than a specific
                          source record.
                        </span>
                      )}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {factor.sourceName ? <span>Source: {factor.sourceName}</span> : null}
                      <span>Confidence: {factor.confidence.toLowerCase()}</span>
                      {factor.sourceUrl && !factor.sourceUrl.startsWith("about:") ? (
                        <a
                          href={factor.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <ExternalLink className="size-3" />
                          View source
                        </a>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
