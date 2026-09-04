"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobProgress } from "@/components/app/job-progress";

/** Queues a workbook build and shows its progress. */
export function ExportButton({ universitySlug }: { universitySlug: string }) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setPending(true);
    setError(null);

    try {
      const res = await fetch(`/api/universities/${universitySlug}/exports`, { method: "POST" });
      const body = (await res.json()) as { job?: { id: string }; error?: string };

      if (!res.ok || !body.job) {
        setError(body.error ?? "Could not start the export.");
        return;
      }
      setJobId(body.job.id);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={generate} disabled={pending || jobId !== null}>
        <FileSpreadsheet />
        {pending ? "Starting…" : "Generate workbook"}
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {jobId ? (
        <JobProgress
          jobId={jobId}
          compact
          onFinished={() => {
            setJobId(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
