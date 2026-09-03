import type { Job, JobType, PrismaClient } from "@prisma/client";
import type { Logger } from "@/lib/util/logger";

/**
 * The job contract.
 *
 * Every long-running pipeline stage is a job. Handlers receive a context that
 * lets them report progress and write log lines that the UI streams back, and
 * that lets them notice when a user has cancelled the run.
 */

export interface JobContext {
  job: Job;
  universityId: string;
  prisma: PrismaClient;
  logger: Logger;

  /** Declares how many units of work this job will do. */
  setTotal(total: number): Promise<void>;

  /** Reports absolute progress, optionally naming the current step. */
  setProgress(progress: number, step?: string): Promise<void>;

  /** Advances progress by one unit. */
  tick(step?: string): Promise<void>;

  /** Writes a line to the job log, visible in the UI. */
  log(level: "debug" | "info" | "warn" | "error", message: string, meta?: Record<string, unknown>): Promise<void>;

  /** True once the job has been cancelled; handlers should stop promptly. */
  isCancelled(): Promise<boolean>;

  /** Throws if the job has been cancelled. Call between units of work. */
  assertNotCancelled(): Promise<void>;

  /** Arbitrary metadata supplied when the job was enqueued. */
  metadata: Record<string, unknown>;
}

export interface JobResult {
  /** Short human-readable summary shown on the completed job. */
  summary: string;
  /** Structured counters merged into the job's metadata. */
  stats?: Record<string, number | string | null | undefined>;
}

export type JobHandler = (ctx: JobContext) => Promise<JobResult>;

export class JobCancelledError extends Error {
  constructor() {
    super("Job was cancelled.");
    this.name = "JobCancelledError";
  }
}

/** Ordered stages executed by a FULL_PIPELINE run. */
export const PIPELINE_STAGES: JobType[] = [
  "SOURCE_DISCOVERY",
  "SOURCE_VALIDATION",
  "DATA_COLLECTION",
  "NORMALIZATION",
  "ENTITY_RESOLUTION",
  "SIGNAL_EXTRACTION",
  "DISCOVERY_SCORING",
  "ENRICHMENT",
  "FINAL_SCORING",
];

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  SOURCE_DISCOVERY: "Source discovery",
  SOURCE_VALIDATION: "Source validation",
  DATA_COLLECTION: "Data collection",
  NORMALIZATION: "Normalization",
  ENTITY_RESOLUTION: "Entity resolution",
  SIGNAL_EXTRACTION: "Signal extraction",
  DISCOVERY_SCORING: "Discovery scoring",
  ENRICHMENT: "Selective enrichment",
  FINAL_SCORING: "Final scoring",
  EXPORT: "Workbook export",
  FULL_PIPELINE: "Full pipeline",
};

export const JOB_TYPE_DESCRIPTIONS: Record<JobType, string> = {
  SOURCE_DISCOVERY:
    "Searches the university's public web presence for pages that might contain student records, and classifies what it finds.",
  SOURCE_VALIDATION:
    "Checks whether each discovered page actually contains extractable records, rather than just describing a programme.",
  DATA_COLLECTION:
    "Fetches each active source and stores exactly what it returned as raw records.",
  NORMALIZATION:
    "Cleans names, organizations, roles and years into comparable form, keeping the original values.",
  ENTITY_RESOLUTION:
    "Compares records that might describe the same person and merges the confident ones into canonical candidates.",
  SIGNAL_EXTRACTION:
    "Turns evidence into structured recruiting signals, and detects combinations of them.",
  DISCOVERY_SCORING:
    "Scores every candidate on pre-enrichment signals and decides who qualifies for enrichment.",
  ENRICHMENT:
    "Looks up only the candidates that passed the discovery threshold against directory sources.",
  FINAL_SCORING: "Produces the final ranking and tier from all available signals.",
  EXPORT: "Builds the university's Excel workbook.",
  FULL_PIPELINE: "Runs every stage in order.",
};
