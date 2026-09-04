"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/util/cn";

/**
 * Live view of a running job.
 *
 * Polls rather than streams: pipeline stages report progress every few hundred
 * milliseconds at most, so a one-second poll is indistinguishable to a user
 * and avoids holding a connection open per viewer. Polling stops the moment
 * the job reaches a terminal state.
 */

export interface JobSummary {
  id: string;
  type: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  progress: number;
  total: number;
  step: string | null;
  error: string | null;
}

interface JobLogLine {
  id: string;
  level: string;
  message: string;
  at: string;
}

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export function JobProgress({
  jobId,
  onFinished,
  compact = false,
}: {
  jobId: string;
  onFinished?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [job, setJob] = useState<JobSummary | null>(null);
  const [logs, setLogs] = useState<JobLogLine[]>([]);
  const [cancelling, setCancelling] = useState(false);

  const poll = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}`);
    if (!res.ok) return true;
    const body = (await res.json()) as { job: JobSummary & { logs: JobLogLine[] } };
    setJob(body.job);
    setLogs(body.job.logs ?? []);
    return TERMINAL.has(body.job.status);
  }, [jobId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      const done = await poll().catch(() => false);
      if (cancelled) return;
      if (done) {
        // Refresh the server components so the page's counts catch up with
        // what the job just changed.
        router.refresh();
        onFinished?.();
        return;
      }
      timer = setTimeout(tick, 1000);
    };

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [poll, router, onFinished]);

  if (!job) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Starting…
      </div>
    );
  }

  const pct = job.total > 0 ? Math.min(100, Math.round((job.progress / job.total) * 100)) : job.status === "COMPLETED" ? 100 : 5;
  const running = job.status === "RUNNING" || job.status === "QUEUED";

  async function cancel() {
    setCancelling(true);
    await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {running ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" /> : null}
            {job.status === "COMPLETED" ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : null}
            {job.status === "FAILED" ? <XCircle className="size-4 shrink-0 text-destructive" /> : null}
            {job.status === "CANCELLED" ? <AlertTriangle className="size-4 shrink-0 text-warning" /> : null}
            <span className="text-sm font-medium">{job.step ?? job.type.replace(/_/g, " ").toLowerCase()}</span>
            <Badge variant={job.status === "FAILED" ? "destructive" : running ? "info" : "success"}>
              {job.status.toLowerCase()}
            </Badge>
          </div>
          {job.total > 0 ? (
            <p className="tabular mt-0.5 text-xs text-muted-foreground">
              {job.progress.toLocaleString()} of {job.total.toLocaleString()}
            </p>
          ) : null}
        </div>

        {running ? (
          <Button size="sm" variant="outline" onClick={cancel} disabled={cancelling}>
            {cancelling ? "Cancelling…" : "Cancel"}
          </Button>
        ) : null}
      </div>

      <Progress
        value={pct}
        indicatorClassName={cn(
          job.status === "FAILED" && "bg-destructive",
          job.status === "COMPLETED" && "bg-success",
          job.status === "CANCELLED" && "bg-warning",
        )}
      />

      {job.error ? (
        <p className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">{job.error}</p>
      ) : null}

      {!compact && logs.length > 0 ? (
        <div className="scrollbar-thin max-h-56 overflow-y-auto rounded-md bg-muted/50 p-2.5">
          <ul className="space-y-1">
            {logs.map((line) => (
              <li
                key={line.id}
                className={cn(
                  "font-mono text-xs leading-relaxed",
                  line.level === "error" && "text-destructive",
                  line.level === "warn" && "text-warning",
                  line.level === "info" && "text-muted-foreground",
                )}
              >
                {line.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
