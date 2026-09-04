import Link from "next/link";
import { prisma } from "@/lib/db";
import { getUniversityOr404 } from "@/lib/api/universities";
import { getScoreDistribution } from "@/lib/api/stats";
import { PipelineRunner } from "@/components/app/pipeline-runner";
import { ScoreBadge, TierBadge } from "@/components/app/badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JOB_TYPE_DESCRIPTIONS, JOB_TYPE_LABELS } from "@/lib/jobs/types";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scoring" };

export default async function UniversityScoringPage({
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

  const [finalDistribution, discoveryDistribution, tiers, topCandidates, configs] =
    await Promise.all([
      getScoreDistribution(university.id, "finalScore"),
      getScoreDistribution(university.id, "discoveryScore"),
      prisma.candidate.groupBy({
        by: ["tier"],
        where: { universityId: university.id },
        _count: { _all: true },
      }),
      prisma.candidate.findMany({
        where: { universityId: university.id, finalScore: { not: null } },
        orderBy: { finalScore: "desc" },
        take: 10,
        select: {
          id: true,
          canonicalName: true,
          finalScore: true,
          discoveryScore: true,
          tier: true,
          signalCount: true,
        },
      }),
      prisma.scoringConfig.findMany({
        where: { isDefault: true },
        include: { rules: { where: { active: true }, orderBy: { points: "desc" } } },
        orderBy: { kind: "asc" },
      }),
    ]);

  const tierCounts = Object.fromEntries(tiers.map((t) => [t.tier, t._count._all]));
  const totalScored = finalDistribution.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Score distribution</CardTitle>
              <CardDescription>
                {totalScored === 0
                  ? "No candidates have been scored yet."
                  : `${totalScored.toLocaleString()} scored candidates. Click a band to see who is in it.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Distribution
                title="Final score"
                buckets={finalDistribution}
                universitySlug={university.slug}
                param="minFinalScore"
                maxParam="maxFinalScore"
              />
              <Distribution
                title="Discovery score"
                buckets={discoveryDistribution}
                universitySlug={university.slug}
                param="minDiscoveryScore"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Highest ranked</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {topCandidates.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">
                  Run final scoring to rank this university&rsquo;s candidates.
                </p>
              ) : (
                <ul className="divide-y">
                  {topCandidates.map((candidate) => (
                    <li key={candidate.id} className="flex items-center gap-3 px-5 py-2.5">
                      <TierBadge tier={candidate.tier} />
                      <Link
                        href={`/candidates/${candidate.id}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium text-primary hover:underline"
                      >
                        {candidate.canonicalName}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {candidate.signalCount} signals
                      </span>
                      <ScoreBadge score={candidate.discoveryScore} />
                      <ScoreBadge score={candidate.finalScore} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <PipelineRunner
            universitySlug={university.slug}
            defaultStage="DISCOVERY_SCORING"
            stages={[
              {
                type: "DISCOVERY_SCORING",
                label: JOB_TYPE_LABELS.DISCOVERY_SCORING,
                description: JOB_TYPE_DESCRIPTIONS.DISCOVERY_SCORING,
              },
              {
                type: "FINAL_SCORING",
                label: JOB_TYPE_LABELS.FINAL_SCORING,
                description: JOB_TYPE_DESCRIPTIONS.FINAL_SCORING,
              },
            ]}
          />

          <Card>
            <CardHeader>
              <CardTitle>Tiers</CardTitle>
              <CardDescription>Applied to the final score.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2">
                {[
                  { tier: "TIER_A" as const, label: "A · 85 and above" },
                  { tier: "TIER_B" as const, label: "B · 70 to 84" },
                  { tier: "TIER_C" as const, label: "C · 50 to 69" },
                  { tier: "TIER_D" as const, label: "D · below 50" },
                  { tier: "UNRANKED" as const, label: "Not yet scored" },
                ].map((row) => (
                  <div key={row.tier} className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-sm">
                      <TierBadge tier={row.tier} />
                      {row.label}
                    </dt>
                    <dd className="tabular text-sm font-medium">
                      {(tierCounts[row.tier] ?? 0).toLocaleString()}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Discovery threshold</CardTitle>
              <CardDescription>
                Candidates at or above this score enter the enrichment queue. Everyone else stays
                discovered, with their evidence intact, and is simply not enriched.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="tabular text-3xl font-semibold">{threshold}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Change it in <Link href="/settings" className="text-primary hover:underline">Settings</Link>.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active scoring rules</CardTitle>
          <CardDescription>
            These are database rows, not code. Every point a candidate earns comes from one of
            them, and none of them can subtract.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          {configs.map((config) => (
            <div key={config.id}>
              <h4 className="mb-2 text-sm font-semibold">{config.name}</h4>
              <ul className="space-y-1">
                {config.rules.map((rule) => (
                  <li key={rule.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{rule.label}</span>
                    <span className="tabular shrink-0 text-muted-foreground">
                      +{rule.points}
                      {rule.pointsPerExtraOccurrence > 0
                        ? ` (+${rule.pointsPerExtraOccurrence} each, max ${rule.maxPoints ?? "—"})`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Distribution({
  title,
  buckets,
  universitySlug,
  param,
  maxParam,
}: {
  title: string;
  buckets: Array<{ label: string; min: number; max: number; count: number }>;
  universitySlug: string;
  param: string;
  maxParam?: string;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1.5">
        {buckets.map((bucket) => {
          const href =
            `/universities/${universitySlug}/candidates?${param}=${bucket.min}` +
            (maxParam ? `&${maxParam}=${bucket.max}` : "");

          return (
            <li key={bucket.label}>
              <Link href={href} className="group flex items-center gap-3">
                <span className="tabular w-16 shrink-0 text-sm text-muted-foreground">
                  {bucket.label}
                </span>
                <span className="h-4 flex-1 overflow-hidden rounded bg-muted">
                  <span
                    className="block h-full rounded bg-primary/70 transition-all group-hover:bg-primary"
                    style={{ width: `${Math.max((bucket.count / max) * 100, bucket.count > 0 ? 1.5 : 0)}%` }}
                  />
                </span>
                <span className="tabular w-14 shrink-0 text-right text-sm font-medium">
                  {bucket.count.toLocaleString()}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
