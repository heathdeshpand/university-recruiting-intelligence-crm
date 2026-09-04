import Link from "next/link";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import type { JobStatus, JobType } from "@prisma/client";
import { JOB_TYPE_LABELS } from "@/lib/jobs/types";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, formatRelative } from "@/lib/util/format";

export interface JobListItem {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  total: number;
  step: string | null;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
  metadata: unknown;
  university?: { name: string; slug: string } | null;
}

const STATUS_ICON = {
  QUEUED: Clock,
  RUNNING: Loader2,
  COMPLETED: CheckCircle2,
  FAILED: XCircle,
  CANCELLED: XCircle,
} as const;

const STATUS_VARIANT = {
  QUEUED: "muted",
  RUNNING: "info",
  COMPLETED: "success",
  FAILED: "destructive",
  CANCELLED: "warning",
} as const;

/**
 * Job history.
 *
 * Shows the summary a completed job wrote about itself, which is usually more
 * useful than its status: "collected 1,032 records from 5 sources, 0 had
 * problems" tells a recruiter what happened; "COMPLETED" does not.
 */
export function JobList({ jobs, showUniversity = false }: { jobs: JobListItem[]; showUniversity?: boolean }) {
  if (jobs.length === 0) {
    return (
      <div className="p-5">
        <EmptyState
          icon={<Clock />}
          title="No jobs yet"
          description="Pipeline stages you run will appear here with their progress and results."
        />
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {jobs.map((job) => {
        const Icon = STATUS_ICON[job.status];
        const stats = (job.metadata ?? {}) as Record<string, unknown>;
        const duration =
          typeof stats.durationMs === "number" ? `${(stats.durationMs / 1000).toFixed(1)}s` : null;

        return (
          <li key={job.id} className="flex gap-3 px-5 py-3">
            <Icon
              className={`mt-0.5 size-4 shrink-0 ${
                job.status === "RUNNING" ? "animate-spin text-info" : ""
              } ${job.status === "COMPLETED" ? "text-success" : ""} ${
                job.status === "FAILED" ? "text-destructive" : ""
              } ${job.status === "CANCELLED" ? "text-warning" : ""} ${
                job.status === "QUEUED" ? "text-muted-foreground" : ""
              }`}
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{JOB_TYPE_LABELS[job.type]}</span>
                <Badge variant={STATUS_VARIANT[job.status]}>{job.status.toLowerCase()}</Badge>
                {showUniversity && job.university ? (
                  <Link
                    href={`/universities/${job.university.slug}`}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    {job.university.name}
                  </Link>
                ) : null}
              </div>

              {job.step ? <p className="mt-0.5 text-sm text-muted-foreground">{job.step}</p> : null}
              {job.error ? <p className="mt-0.5 text-sm text-destructive">{job.error}</p> : null}

              <p className="mt-1 text-xs text-muted-foreground">
                {formatRelative(job.createdAt)}
                {duration ? ` · took ${duration}` : ""}
                {job.total > 0 && job.status === "RUNNING"
                  ? ` · ${job.progress.toLocaleString()} of ${job.total.toLocaleString()}`
                  : ""}
                {job.completedAt ? ` · finished ${formatDateTime(job.completedAt)}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
