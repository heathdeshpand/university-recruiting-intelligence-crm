"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Manual correction of a candidate.
 *
 * Two operations, both of which override the pipeline's judgement:
 *
 *   Editing identity  marks the candidate as manually edited, after which
 *                     entity resolution will not overwrite these fields.
 *   Splitting         detaches records into a new candidate, pinning both
 *                     sides so a later run cannot pull them back together.
 *
 * Neither recomputes scores. A score records what the rules said when they
 * ran, so the component says plainly that scoring is now stale rather than
 * silently recomputing and hiding that the numbers moved.
 */

export interface SourceRecordOption {
  normalizedRecordId: string;
  label: string;
  detail: string;
  pinned: boolean;
}

export function ManualOverrides({
  candidateId,
  universitySlug,
  initial,
  records,
}: {
  candidateId: string;
  universitySlug: string;
  initial: {
    canonicalName: string;
    firstName: string | null;
    lastName: string | null;
    major: string | null;
    graduationYear: number | null;
  };
  records: SourceRecordOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function saveIdentity(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNote(null);

    const form = new FormData(e.currentTarget);
    const year = String(form.get("graduationYear") ?? "").trim();

    try {
      const res = await fetch(`/api/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonicalName: String(form.get("canonicalName") ?? "").trim(),
          firstName: String(form.get("firstName") ?? "").trim() || null,
          lastName: String(form.get("lastName") ?? "").trim() || null,
          major: String(form.get("major") ?? "").trim() || null,
          graduationYear: year ? Number.parseInt(year, 10) : null,
        }),
      });
      const body = (await res.json()) as { error?: string; note?: string };

      if (!res.ok) {
        setError(body.error ?? "Could not save those changes.");
        return;
      }

      setNote(body.note ?? "Saved.");
      setEditing(false);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  async function split() {
    if (selected.size === 0) return;
    setPending(true);
    setError(null);
    setNote(null);

    try {
      const res = await fetch(`/api/candidates/${candidateId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ normalizedRecordIds: [...selected] }),
      });
      const body = (await res.json()) as {
        error?: string;
        note?: string;
        candidate?: { id: string };
      };

      if (!res.ok || !body.candidate) {
        setError(body.error ?? "Could not split those records off.");
        return;
      }

      setSelected(new Set());
      setSplitting(false);
      router.push(`/candidates/${body.candidate.id}`);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  const canSplit = records.length > 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => { setEditing((v) => !v); setSplitting(false); }}>
          <Pencil />
          {editing ? "Cancel edit" : "Correct details"}
        </Button>

        {canSplit ? (
          <Button size="sm" variant="outline" onClick={() => { setSplitting((v) => !v); setEditing(false); }}>
            <Scissors />
            {splitting ? "Cancel split" : "Split records off"}
          </Button>
        ) : null}
      </div>

      {note ? (
        <Alert variant="info">
          <AlertDescription>{note}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {editing ? (
        <form onSubmit={saveIdentity} className="space-y-3 rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Editing these fields marks the candidate as manually corrected. Entity resolution will
            not overwrite them on a later run.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="canonicalName">Display name</Label>
              <Input id="canonicalName" name="canonicalName" defaultValue={initial.canonicalName} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" name="firstName" defaultValue={initial.firstName ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" name="lastName" defaultValue={initial.lastName ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="major">Major</Label>
              <Input id="major" name="major" defaultValue={initial.major ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="graduationYear">Graduation year</Label>
              <Input
                id="graduationYear"
                name="graduationYear"
                type="number"
                min={1900}
                max={2100}
                defaultValue={initial.graduationYear ?? ""}
              />
            </div>
          </div>

          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save corrections"}
          </Button>
        </form>
      ) : null}

      {splitting ? (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Select the records that belong to a <strong>different</strong> person. They move to a
            new candidate, and both sides are pinned so entity resolution cannot merge them back.
          </p>

          <ul className="space-y-1.5">
            {records.map((record) => (
              <li key={record.normalizedRecordId}>
                <label className="flex items-start gap-2.5 rounded-md border p-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 rounded border-input"
                    checked={selected.has(record.normalizedRecordId)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(record.normalizedRecordId);
                      else next.delete(record.normalizedRecordId);
                      setSelected(next);
                    }}
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{record.label}</span>
                    <span className="block text-xs text-muted-foreground">{record.detail}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {selected.size === records.length ? (
            <p className="text-sm text-warning">
              Leave at least one record on this candidate — splitting off all of them would leave it
              empty.
            </p>
          ) : null}

          <Button
            size="sm"
            onClick={split}
            disabled={pending || selected.size === 0 || selected.size === records.length}
          >
            {pending
              ? "Splitting…"
              : `Split ${selected.size} record${selected.size === 1 ? "" : "s"} into a new candidate`}
          </Button>
        </div>
      ) : null}

      {(editing || splitting) && universitySlug ? (
        <p className="text-xs text-muted-foreground">
          Neither action recomputes scores. Re-run signal extraction and scoring for{" "}
          <a href={`/universities/${universitySlug}/scoring`} className="text-primary hover:underline">
            this university
          </a>{" "}
          to bring them in line.
        </p>
      ) : null}
    </div>
  );
}
