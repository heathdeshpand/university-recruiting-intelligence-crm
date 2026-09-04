"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CandidateStatus } from "@prisma/client";
import { Select } from "@/components/ui/select";

/**
 * Candidate status control.
 *
 * Status is a recruiter's own workflow marker, so changing it does not touch
 * scores or evidence. Outreach statuses are deliberately absent: this version
 * of the product ends at the CRM and does not contact anyone.
 */

const STATUSES: Array<{ value: CandidateStatus; label: string }> = [
  { value: "NEW", label: "New" },
  { value: "DISCOVERED", label: "Discovered" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "ENRICHED", label: "Enriched" },
  { value: "REVIEWED", label: "Reviewed" },
  { value: "ARCHIVED", label: "Archived" },
];

export function CandidateActions({
  candidateId,
  status,
}: {
  candidateId: string;
  status: CandidateStatus;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Could not update the status.");
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
    <div className="flex items-center gap-2">
      <label className="w-44 space-y-1">
        <span className="sr-only">Candidate status</span>
        <Select defaultValue={status} disabled={saving} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </label>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
