"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { ParserType, SourceStatus, SourceType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SourceStatusBadge } from "@/components/app/badges";
import { cn } from "@/lib/util/cn";
import { displayUrl, formatNumber, formatRelative, humanizeEnum } from "@/lib/util/format";

/**
 * One source in the registry, expandable to show why it is in the state it is
 * in and to correct it.
 *
 * The expanded view is the answer to "why did discovery think this?" and
 * "why did collection fail?", which is what makes a wrong classification
 * fixable rather than mysterious.
 */

export interface SourceView {
  id: string;
  name: string;
  url: string;
  sourceType: SourceType;
  status: SourceStatus;
  parserType: ParserType;
  accessMethod: string;
  discoveryMethod: string;
  confidence: number;
  recordCount: number;
  description: string | null;
  classifierNotes: string | null;
  errorMessage: string | null;
  active: boolean;
  lastDiscoveredAt: string | null;
  lastValidatedAt: string | null;
  lastCollectedAt: string | null;
  validationSummary: { recordEstimate?: number; reasons?: string[]; pageTitle?: string } | null;
}

const SOURCE_TYPES: SourceType[] = [
  "GREEK_LIFE", "STUDENT_ORGANIZATION", "CLUB_SPORT", "INTRAMURAL", "ATHLETICS",
  "STUDENT_LEADERSHIP", "STUDENT_GOVERNMENT", "ENTREPRENEURSHIP", "BUSINESS_ORGANIZATION",
  "SALES_ORGANIZATION", "PROFESSIONAL_ORGANIZATION", "COMPETITIVE_ORGANIZATION",
  "HONOR_SOCIETY", "STUDENT_DIRECTORY", "NEWS_OR_AWARDS", "OTHER", "UNKNOWN",
];

const PARSER_TYPES: ParserType[] = [
  "HTML_TABLE", "HTML_LIST", "HTML_CARD_GRID", "JSON_ENDPOINT", "CSV",
  "ATHLETICS_ROSTER", "ORG_DIRECTORY", "GENERIC_HTML", "NONE",
];

export function SourceRow({ source }: { source: SourceView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPlaceholder = source.url.startsWith("about:");

  async function update(patch: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Could not update the source.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("border-b last:border-b-0", !source.active && "opacity-70")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{source.name}</span>
            <SourceStatusBadge status={source.status} />
          </div>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {isPlaceholder ? humanizeEnum(source.sourceType) : displayUrl(source.url, 60)}
          </p>
        </div>

        <div className="hidden shrink-0 text-right sm:block">
          <p className="tabular text-sm font-medium">{formatNumber(source.recordCount)}</p>
          <p className="text-xs text-muted-foreground">records</p>
        </div>
      </button>

      {open ? (
        <div className="space-y-4 border-t bg-muted/30 px-4 py-4">
          {source.errorMessage ? (
            <div className="rounded-md bg-warning/10 p-3">
              <p className="text-xs font-medium text-warning">What happened</p>
              <p className="mt-0.5 text-sm">{source.errorMessage}</p>
            </div>
          ) : null}

          {source.description ? (
            <p className="text-sm text-muted-foreground">{source.description}</p>
          ) : null}

          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Type" value={humanizeEnum(source.sourceType)} />
            <Field label="Extractor" value={humanizeEnum(source.parserType)} />
            <Field label="Access" value={humanizeEnum(source.accessMethod)} />
            <Field label="Found by" value={humanizeEnum(source.discoveryMethod)} />
            <Field
              label="Classifier confidence"
              value={source.confidence > 0 ? `${Math.round(source.confidence * 100)}%` : "—"}
            />
            <Field label="Records" value={formatNumber(source.recordCount)} />
            <Field label="Discovered" value={formatRelative(source.lastDiscoveredAt)} />
            <Field label="Validated" value={formatRelative(source.lastValidatedAt)} />
            <Field label="Collected" value={formatRelative(source.lastCollectedAt)} />
          </dl>

          {source.classifierNotes ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Why it was classified this way</p>
              <p className="mt-0.5 text-sm">{source.classifierNotes}</p>
            </div>
          ) : null}

          {source.validationSummary?.reasons?.length ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">What validation saw</p>
              <ul className="mt-0.5 space-y-0.5">
                {source.validationSummary.reasons.map((reason, i) => (
                  <li key={i} className="text-sm">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!isPlaceholder ? (
            <div className="flex flex-wrap items-end gap-3 border-t pt-4">
              <label className="min-w-40 flex-1 space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Reclassify as</span>
                <Select
                  defaultValue={source.sourceType}
                  disabled={saving}
                  onChange={(e) => update({ sourceType: e.target.value })}
                >
                  {SOURCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {humanizeEnum(t)}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="min-w-40 flex-1 space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Extractor</span>
                <Select
                  defaultValue={source.parserType}
                  disabled={saving}
                  onChange={(e) => update({ parserType: e.target.value })}
                >
                  {PARSER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {humanizeEnum(t)}
                    </option>
                  ))}
                </Select>
              </label>

              <div className="flex gap-2">
                {source.status !== "ACTIVE" && source.active ? (
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => update({ status: "ACTIVE", active: true })}>
                    Activate
                  </Button>
                ) : null}
                {source.active ? (
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => update({ status: "DISABLED", active: false })}>
                    Disable
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => update({ status: "DISCOVERED", active: true })}>
                    Re-enable
                  </Button>
                )}
                <Button asChild size="sm" variant="ghost">
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink />
                    Open
                  </a>
                </Button>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
