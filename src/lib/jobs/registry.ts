import type { JobType } from "@prisma/client";
import type { JobHandler } from "@/lib/jobs/types";
import { sourceDiscoveryHandler } from "@/lib/jobs/handlers/source-discovery";
import { sourceValidationHandler } from "@/lib/jobs/handlers/source-validation";
import { dataCollectionHandler } from "@/lib/jobs/handlers/data-collection";
import { normalizationHandler } from "@/lib/jobs/handlers/normalization";
import { entityResolutionHandler } from "@/lib/jobs/handlers/entity-resolution";
import { signalExtractionHandler } from "@/lib/jobs/handlers/signal-extraction";
import { discoveryScoringHandler } from "@/lib/jobs/handlers/discovery-scoring";
import { enrichmentHandler } from "@/lib/jobs/handlers/enrichment";
import { finalScoringHandler } from "@/lib/jobs/handlers/final-scoring";
import { exportHandler } from "@/lib/jobs/handlers/export";
import { fullPipelineHandler } from "@/lib/jobs/handlers/full-pipeline";

/**
 * Job type -> handler.
 *
 * Adding a pipeline stage means adding an enum value and one entry here.
 */
const HANDLERS: Record<JobType, JobHandler> = {
  SOURCE_DISCOVERY: sourceDiscoveryHandler,
  SOURCE_VALIDATION: sourceValidationHandler,
  DATA_COLLECTION: dataCollectionHandler,
  NORMALIZATION: normalizationHandler,
  ENTITY_RESOLUTION: entityResolutionHandler,
  SIGNAL_EXTRACTION: signalExtractionHandler,
  DISCOVERY_SCORING: discoveryScoringHandler,
  ENRICHMENT: enrichmentHandler,
  FINAL_SCORING: finalScoringHandler,
  EXPORT: exportHandler,
  FULL_PIPELINE: fullPipelineHandler,
};

export function getJobHandler(type: JobType): JobHandler {
  const handler = HANDLERS[type];
  if (!handler) throw new Error(`No handler is registered for job type ${type}.`);
  return handler;
}
