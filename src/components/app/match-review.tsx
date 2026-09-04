"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Flag, GitMerge, X } from "lucide-react";
import type { MatchStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MatchStatusBadge } from "@/components/app/badges";
import { cn } from "@/lib/util/cn";

/**
 * One entity-match decision.
 *
 * Both records are shown side by side, field by field, with agreements and
 * disagreements called out. The reviewer is deciding whether two records
 * describe one person, so they need to see exactly what differs -- not a
 * score with a thumbs-up button.
 */

export interface MatchRecordView {
  id: string;
  normalizedName: string;
  rawName: string | null;
  organization: string | null;
  role: string | null;
  major: string | null;
  graduationYear: number | null;
  email: string | null;
  sourceName: string;
  sourceUrl: string;
}

export interface MatchView {
  id: string;
  matchScore: number;
  confidence: number;
  status: MatchStatus;
  matchingFactors: Array<{ label: string; detail?: string; points?: number }>;
  conflictingFactors: Array<{ label: string; detail?: string; points?: number }>;
  recordA: MatchRecordView;
  recordB: MatchRecordView;
  candidateAId: string | null;
  candidateBId: string | null;
}

const FIELDS: Array<{ key: keyof MatchRecordView; label: string }> = [
  { key: "rawName", label: "Name as published" },
  { key: "organization", label: "Organization" },
  { key: "role", label: "Role" },
  { key: "major", label: "Major" },
  { key: "graduationYear", label: "Graduation year" },
  { key: "email", label: "Email" },
  { key: "sourceName", label: "Source" },
];

export function MatchReview({ match }: { match: MatchView }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<string | null>(null);

  async function decide(decision: "CONFIRMED" | "REJECTED" | "REVIEW") {
    setPending(decision);
    setError(null);

    try {
      const res = await fetch(`/api/matches/${match.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const body = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(body.error ?? "Could not record that decision.");
        setPending(null);
        return;
      }

      setResolved(decision);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setPending(null);
    }
  }

  if (resolved) {
    return (
      <div className="flex items-center gap-2 border-b bg-muted/40 px-5 py-3 text-sm">
        {resolved === "CONFIRMED" ? (
          <>
            <Check className="size-4 text-success" />
            <span>
              Merged <strong>{match.recordA.normalizedName}</strong> and{" "}
              <strong>{match.recordB.normalizedName}</strong> into one candidate.
            </span>
          </>
        ) : resolved === "REJECTED" ? (
          <>
            <X className="size-4 text-muted-foreground" />
            <span>
              Recorded as different people. Entity resolution will not merge them, and will refuse
              any chain of matches that would reunite them.
            </span>
          </>
        ) : (
          <>
            <Flag className="size-4 text-warning" />
            <span>Flagged for another look.</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="border-b p-5 last:border-b-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <GitMerge className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Are these the same person?</span>
        <MatchStatusBadge status={match.status} />
        <Badge variant="secondary">
          {match.matchScore} / 100 · {Math.round(match.confidence * 100)}% confidence
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b">
              <th className="w-40 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Field
              </th>
              <th className="py-1.5 text-left font-medium">Record A</th>
              <th className="py-1.5 text-left font-medium">Record B</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map((field) => {
              const a = match.recordA[field.key];
              const b = match.recordB[field.key];
              const bothPresent = a !== null && a !== undefined && b !== null && b !== undefined;
              const agree = bothPresent && String(a) === String(b);

              // Fields that are *expected* to differ between two records of
              // the same person are never flagged as conflicts:
              //   name        differs by design -- "Greg" and "Gregory" are a
              //               match, not a disagreement, and the factor lists
              //               below explain how the names were compared
              //   org / role  a person belongs to more than one organization
              //   source      two records of one person come from two sources
              const EXPECTED_TO_DIFFER = new Set(["rawName", "organization", "role", "sourceName"]);
              const disagree = bothPresent && !agree && !EXPECTED_TO_DIFFER.has(String(field.key));

              return (
                <tr key={String(field.key)} className="border-b last:border-b-0">
                  <td className="py-1.5 text-xs text-muted-foreground">{field.label}</td>
                  <td className={cn("py-1.5", agree && "text-success", disagree && "text-warning")}>
                    {a ?? <span className="text-muted-foreground">Unknown</span>}
                  </td>
                  <td className={cn("py-1.5", agree && "text-success", disagree && "text-warning")}>
                    {b ?? <span className="text-muted-foreground">Unknown</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-success/8 p-3">
          <p className="text-xs font-medium text-success">What matches</p>
          <ul className="mt-1 space-y-0.5">
            {match.matchingFactors.map((f, i) => (
              <li key={i} className="text-sm">
                {f.label}
                {f.detail ? <span className="text-muted-foreground"> — {f.detail}</span> : null}
                {f.points ? <span className="tabular text-xs text-muted-foreground"> (+{f.points})</span> : null}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-md bg-warning/8 p-3">
          <p className="text-xs font-medium text-warning">What conflicts</p>
          {match.conflictingFactors.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Nothing conflicts — but the records also do not corroborate each other beyond the
              name, which is why this needs a human.
            </p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {match.conflictingFactors.map((f, i) => (
                <li key={i} className="text-sm">
                  {f.label}
                  {f.detail ? <span className="text-muted-foreground"> — {f.detail}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="success" disabled={pending !== null} onClick={() => decide("CONFIRMED")}>
          <Check />
          {pending === "CONFIRMED" ? "Merging…" : "Same person — merge"}
        </Button>
        <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => decide("REJECTED")}>
          <X />
          {pending === "REJECTED" ? "Saving…" : "Different people"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending !== null} onClick={() => decide("REVIEW")}>
          <Flag />
          Not sure — leave for later
        </Button>
      </div>
    </div>
  );
}
