"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JobProgress } from "@/components/app/job-progress";
import { cn } from "@/lib/util/cn";

/**
 * Runs pipeline stages for a university.
 *
 * Every stage can be run on its own, which is the point: re-running entity
 * resolution after correcting a match should not mean re-crawling every
 * source. The full pipeline is just all of them in order.
 */

export interface StageOption {
  type: string;
  label: string;
  description: string;
}

export function PipelineRunner({
  universitySlug,
  stages,
  defaultStage = "FULL_PIPELINE",
  compact = false,
}: {
  universitySlug: string;
  stages: StageOption[];
  defaultStage?: string;
  compact?: boolean;
}) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function run(type: string) {
    setPending(type);
    setError(null);

    try {
      const res = await fetch(`/api/universities/${universitySlug}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const body = (await res.json()) as { job?: { id: string }; error?: string };

      if (!res.ok || !body.job) {
        setError(body.error ?? "Could not start that stage.");
        setPending(null);
        return;
      }

      setActiveJobId(body.job.id);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPending(null);
    }
  }

  const primary = stages.find((s) => s.type === defaultStage);
  const rest = stages.filter((s) => s.type !== defaultStage);

  if (compact) {
    return (
      <div className="space-y-3">
        <Button onClick={() => run(defaultStage)} disabled={pending !== null || activeJobId !== null}>
          <Play />
          {primary?.label ?? "Run"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {activeJobId ? (
          <JobProgress jobId={activeJobId} compact onFinished={() => setActiveJobId(null)} />
        ) : null}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run the pipeline</CardTitle>
        <CardDescription>
          Each stage can be run on its own. Re-running a stage is always safe: collection is
          idempotent, and resolution respects decisions a reviewer has already made.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {activeJobId ? (
          <JobProgress jobId={activeJobId} onFinished={() => setActiveJobId(null)} />
        ) : null}

        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {primary ? (
          <div className="flex items-start justify-between gap-4 rounded-lg border bg-accent/40 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">{primary.label}</p>
              <p className="text-xs text-muted-foreground">{primary.description}</p>
            </div>
            <Button
              onClick={() => run(primary.type)}
              disabled={pending !== null || activeJobId !== null}
              className="shrink-0"
            >
              <Play />
              Run
            </Button>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          {rest.map((stage) => (
            <div
              key={stage.type}
              className={cn(
                "flex items-start justify-between gap-3 rounded-md border p-3",
                (pending !== null || activeJobId !== null) && "opacity-60",
              )}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{stage.label}</p>
                <p className="text-xs text-muted-foreground">{stage.description}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => run(stage.type)}
                disabled={pending !== null || activeJobId !== null}
                className="shrink-0"
              >
                Run
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
