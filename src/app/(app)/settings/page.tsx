import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/app/page-header";
import { ScoringSettings } from "@/app/(app)/settings/scoring-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SIGNAL_DEFINITIONS } from "@/lib/config/signals";
import { aiConfigured, demoModeEnabled, env, liveNetworkEnabled, searchApiConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [configs, signalDefinitions] = await Promise.all([
    prisma.scoringConfig.findMany({
      where: { isDefault: true },
      include: { rules: { orderBy: [{ category: "asc" }, { order: "asc" }] } },
      orderBy: { kind: "asc" },
    }),
    prisma.signalDefinition.findMany({ orderBy: [{ category: "asc" }, { key: "asc" }] }),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Scoring weights, the discovery threshold and the signal taxonomy are data, not code. Changing them here does not need a deploy."
      />

      <div className="space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Environment</CardTitle>
            <CardDescription>
              How this installation is configured. These come from environment variables and are
              shown so it is always clear what the application is and is not allowed to do.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Setting
                label="Demo mode"
                enabled={demoModeEnabled}
                on="Synthetic data, no live requests"
                off="Off"
              />
              <Setting
                label="Live network access"
                enabled={liveNetworkEnabled}
                on="Real websites may be contacted"
                off="Disabled — no real website is contacted"
              />
              <Setting
                label="robots.txt"
                enabled={env.RESPECT_ROBOTS_TXT}
                on="Honoured on every request"
                off="Not honoured"
                invertTone
              />
              <Setting
                label="Search API"
                enabled={searchApiConfigured}
                on={`Configured (${env.SEARCH_PROVIDER})`}
                off="Not configured — the crawler handles discovery"
                neutralWhenOff
              />
              <Setting
                label="AI assistance"
                enabled={aiConfigured}
                on={`Configured (${env.AI_PROVIDER})`}
                off="Not configured — all classification is rule-based"
                neutralWhenOff
              />
              <div>
                <dt className="text-xs text-muted-foreground">Per-host request delay</dt>
                <dd className="tabular text-sm font-medium">{env.HTTP_PER_HOST_DELAY_MS} ms</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Discovery page budget</dt>
                <dd className="tabular text-sm font-medium">{env.DISCOVERY_MAX_PAGES} pages</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">User-Agent</dt>
                <dd className="truncate font-mono text-xs" title={env.HTTP_USER_AGENT}>
                  {env.HTTP_USER_AGENT}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {configs.map((config) => (
          <ScoringSettings
            key={config.id}
            config={{
              id: config.id,
              name: config.name,
              kind: config.kind,
              description: config.description,
              discoveryThreshold: config.discoveryThreshold,
              rules: config.rules.map((r) => ({
                id: r.id,
                key: r.key,
                label: r.label,
                category: r.category,
                signalKey: r.signalKey,
                points: r.points,
                active: r.active,
              })),
            }}
          />
        ))}

        <Card>
          <CardHeader>
            <CardTitle>Signal taxonomy</CardTitle>
            <CardDescription>
              {signalDefinitions.length} signals, stored as rows so new ones can be added without a
              migration. None of them describe, infer or proxy for a protected attribute.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {signalDefinitions.map((definition) => (
                <li key={definition.id} className="rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{definition.label}</span>
                    {!definition.active ? <Badge variant="muted">Off</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{definition.description}</p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {definition.key} · {definition.category.toLowerCase()}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What this application will not do</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
              <li>Bypass authentication, paywalls or CAPTCHAs</li>
              <li>Scrape private accounts or anything behind a login</li>
              <li>Contact anyone — there is no outreach in this version</li>
              <li>Infer religion, race, politics, health or sexual orientation</li>
              <li>Score anyone on financial hardship or academic difficulty</li>
              <li>Treat missing data as a negative signal</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              {SIGNAL_DEFINITIONS.length} built-in signals are defined in code as defaults and
              seeded into the table above.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Setting({
  label,
  enabled,
  on,
  off,
  invertTone = false,
  neutralWhenOff = false,
}: {
  label: string;
  enabled: boolean;
  on: string;
  off: string;
  invertTone?: boolean;
  neutralWhenOff?: boolean;
}) {
  const variant = neutralWhenOff && !enabled
    ? "muted"
    : enabled
      ? invertTone
        ? "success"
        : "info"
      : invertTone
        ? "destructive"
        : "muted";

  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">
        <Badge variant={variant}>{enabled ? on : off}</Badge>
      </dd>
    </div>
  );
}
