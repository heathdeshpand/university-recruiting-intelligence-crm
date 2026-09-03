import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/util/logger";

const log = createLogger("audit");

/**
 * Append-only audit trail.
 *
 * Everything that changes data a recruiter will act on gets a row here:
 * source activation, entity-match decisions, manual merges, score
 * recalculation, exports. Writing the log must never break the action it is
 * describing, so failures are logged and swallowed.
 */

export type AuditAction =
  | "university.created"
  | "university.updated"
  | "university.deleted"
  | "source.discovered"
  | "source.validated"
  | "source.activated"
  | "source.disabled"
  | "source.failed"
  | "source.reclassified"
  | "collection.started"
  | "collection.completed"
  | "normalization.completed"
  | "candidate.created"
  | "candidate.updated"
  | "candidate.merged"
  | "candidate.split"
  | "candidate.status_changed"
  | "match.confirmed"
  | "match.rejected"
  | "match.flagged"
  | "signals.extracted"
  | "score.calculated"
  | "enrichment.queued"
  | "enrichment.attempted"
  | "enrichment.completed"
  | "export.created"
  | "export.downloaded"
  | "config.updated"
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout";

export interface AuditInput {
  actorId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  universityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        universityId: input.universityId ?? null,
        summary: input.summary.slice(0, 1000),
        metadata: (input.metadata ?? undefined) as never,
        ip: input.ip ?? null,
      },
    });
  } catch (e) {
    log.error("Failed to write audit log entry", {
      action: input.action,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
