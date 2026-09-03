import type {
  CandidateStatus,
  Confidence,
  EnrichmentStatus,
  MatchStatus,
  SourceStatus,
  Tier,
  TriState,
} from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/util/cn";

/**
 * Shared status vocabulary.
 *
 * Colour carries meaning consistently across the app, and the distinction the
 * product cares most about is encoded here: "not found" and "unknown" are
 * neutral or amber, never red. A university not publishing something is not an
 * error, and a missing signal is not a negative one.
 */

const SOURCE_STATUS: Record<SourceStatus, { label: string; variant: Parameters<typeof Badge>[0]["variant"] }> = {
  DISCOVERED: { label: "Discovered", variant: "muted" },
  VALIDATED: { label: "Validated", variant: "info" },
  ACTIVE: { label: "Active", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  UNAVAILABLE: { label: "Not found", variant: "warning" },
  REQUIRES_REVIEW: { label: "Needs review", variant: "warning" },
  DISABLED: { label: "Disabled", variant: "muted" },
};

export function SourceStatusBadge({ status }: { status: SourceStatus }) {
  const s = SOURCE_STATUS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

const CANDIDATE_STATUS: Record<CandidateStatus, { label: string; variant: Parameters<typeof Badge>[0]["variant"] }> = {
  NEW: { label: "New", variant: "muted" },
  DISCOVERED: { label: "Discovered", variant: "secondary" },
  QUALIFIED: { label: "Qualified", variant: "info" },
  ENRICHED: { label: "Enriched", variant: "success" },
  REVIEWED: { label: "Reviewed", variant: "default" },
  ARCHIVED: { label: "Archived", variant: "muted" },
};

export function CandidateStatusBadge({ status }: { status: CandidateStatus }) {
  const s = CANDIDATE_STATUS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

const ENRICHMENT_STATUS: Record<EnrichmentStatus, { label: string; variant: Parameters<typeof Badge>[0]["variant"] }> = {
  NOT_ELIGIBLE: { label: "Below threshold", variant: "muted" },
  QUEUED: { label: "Queued", variant: "secondary" },
  PROCESSING: { label: "Processing", variant: "info" },
  ENRICHED: { label: "Enriched", variant: "success" },
  FAILED: { label: "No match", variant: "warning" },
  MANUAL_REVIEW: { label: "Ambiguous", variant: "warning" },
};

export function EnrichmentStatusBadge({ status }: { status: EnrichmentStatus }) {
  const s = ENRICHMENT_STATUS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

const MATCH_STATUS: Record<MatchStatus, { label: string; variant: Parameters<typeof Badge>[0]["variant"] }> = {
  AUTO_MATCHED: { label: "Auto-matched", variant: "success" },
  PROBABLE_MATCH: { label: "Probable", variant: "info" },
  MANUAL_REVIEW: { label: "Needs review", variant: "warning" },
  NOT_MATCHED: { label: "Not matched", variant: "muted" },
};

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  const s = MATCH_STATUS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

const TIER: Record<Tier, { label: string; className: string }> = {
  TIER_A: { label: "A", className: "bg-success/15 text-success border-success/25" },
  TIER_B: { label: "B", className: "bg-info/15 text-info border-info/25" },
  TIER_C: { label: "C", className: "bg-warning/15 text-warning border-warning/25" },
  TIER_D: { label: "D", className: "bg-muted text-muted-foreground" },
  UNRANKED: { label: "—", className: "bg-muted text-muted-foreground" },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const t = TIER[tier];
  return (
    <span
      className={cn(
        "inline-flex size-6 items-center justify-center rounded border text-xs font-semibold",
        t.className,
      )}
      title={tier === "UNRANKED" ? "Not yet scored" : `Tier ${t.label}`}
    >
      {t.label}
    </span>
  );
}

/** A 0–100 score, coloured by band. Renders an em dash when not yet computed. */
export function ScoreBadge({
  score,
  size = "default",
}: {
  score: number | null | undefined;
  size?: "default" | "lg";
}) {
  if (score === null || score === undefined) {
    return (
      <span className="text-sm text-muted-foreground" title="Not yet scored">
        —
      </span>
    );
  }

  const tone =
    score >= 85
      ? "bg-success/15 text-success"
      : score >= 70
        ? "bg-info/15 text-info"
        : score >= 50
          ? "bg-warning/15 text-warning"
          : "bg-muted text-muted-foreground";

  return (
    <span
      className={cn(
        "tabular inline-flex items-center justify-center rounded font-semibold",
        tone,
        size === "lg" ? "min-w-14 px-2.5 py-1 text-lg" : "min-w-9 px-1.5 py-0.5 text-sm",
      )}
    >
      {score}
    </span>
  );
}

/**
 * YES / NO / UNKNOWN.
 *
 * UNKNOWN is styled as genuinely neutral, and its tooltip says why: the
 * university may simply not publish that kind of data.
 */
export function TriStateChip({ value, label }: { value: TriState; label?: string }) {
  const config = {
    YES: { text: "Yes", variant: "success" as const, title: "Supported by at least one source record." },
    NO: { text: "No", variant: "muted" as const, title: "A source explicitly indicated this does not apply." },
    UNKNOWN: {
      text: "Unknown",
      variant: "muted" as const,
      title:
        "No source covered this. Absence of data is not evidence of absence, and this contributes nothing to any score.",
    },
  }[value];

  return (
    <Badge variant={config.variant} title={config.title}>
      {label ? `${label}: ` : ""}
      {config.text}
    </Badge>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const map = {
    HIGH: { label: "High confidence", variant: "success" as const },
    MEDIUM: { label: "Medium confidence", variant: "info" as const },
    LOW: { label: "Low confidence", variant: "warning" as const },
  };
  const c = map[confidence];
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

/** Formats a match confidence in [0,1] as a percentage. */
export function ConfidencePercent({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  const pct = Math.round(value * 100);
  const tone = pct >= 85 ? "text-success" : pct >= 70 ? "text-info" : "text-warning";
  return <span className={cn("tabular font-medium", tone)}>{pct}%</span>;
}
