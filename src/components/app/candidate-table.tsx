import Link from "next/link";
import { Mail, Users } from "lucide-react";
import type { CandidateListItem } from "@/lib/api/candidates";
import {
  CandidateStatusBadge,
  ConfidencePercent,
  EnrichmentStatusBadge,
  ScoreBadge,
  TierBadge,
} from "@/components/app/badges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * The candidate table.
 *
 * Signal counts are shown per category rather than as one number, because
 * "three competitive signals and no career signals" is a different candidate
 * from the reverse, and a single total hides that.
 */

const CATEGORY_COLUMNS = [
  { label: "Social", categories: ["SOCIAL"] },
  { label: "Comp.", categories: ["COMPETITIVE"] },
  { label: "Career", categories: ["SALES", "BUSINESS", "ENTREPRENEURSHIP", "WORK_EXPERIENCE", "CUSTOMER_FACING", "CAREER"] },
  { label: "Lead.", categories: ["LEADERSHIP"] },
] as const;

function countByCategory(candidate: CandidateListItem, categories: readonly string[]): number {
  return candidate.signals.filter((s) => categories.includes(s.category)).length;
}

export function CandidateTable({
  candidates,
  showUniversity = false,
  emptyTitle = "No candidates match these filters",
  emptyDescription,
}: {
  candidates: CandidateListItem[];
  showUniversity?: boolean;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
}) {
  if (candidates.length === 0) {
    return (
      <div className="p-5">
        <EmptyState icon={<Users />} title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">Tier</TableHead>
          <TableHead>Name</TableHead>
          {showUniversity ? <TableHead>University</TableHead> : null}
          <TableHead className="text-right">Final</TableHead>
          <TableHead className="text-right">Discovery</TableHead>
          {CATEGORY_COLUMNS.map((c) => (
            <TableHead key={c.label} className="text-right">
              {c.label}
            </TableHead>
          ))}
          <TableHead>Major</TableHead>
          <TableHead className="text-right">Grad</TableHead>
          <TableHead>Enrichment</TableHead>
          <TableHead className="text-right">Match</TableHead>
          <TableHead className="text-right">Sources</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {candidates.map((candidate) => (
          <TableRow key={candidate.id}>
            <TableCell>
              <TierBadge tier={candidate.tier} />
            </TableCell>

            <TableCell>
              <Link
                href={`/candidates/${candidate.id}`}
                className="font-medium text-primary hover:underline"
              >
                {candidate.canonicalName}
              </Link>
              <div className="flex items-center gap-1.5 pt-0.5">
                {candidate.email ? (
                  <span
                    className="flex items-center gap-1 text-xs text-muted-foreground"
                    title={candidate.email}
                  >
                    <Mail className="size-3" />
                    email
                  </span>
                ) : null}
                {candidate.needsReview ? (
                  <Badge variant="warning" className="text-[10px]">
                    Review
                  </Badge>
                ) : null}
                {candidate.patterns.length > 0 ? (
                  <span
                    className="text-xs text-muted-foreground"
                    title={candidate.patterns.map((p) => p.label).join("; ")}
                  >
                    {candidate.patterns.length} pattern{candidate.patterns.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
            </TableCell>

            {showUniversity ? (
              <TableCell>
                <Link
                  href={`/universities/${candidate.university.slug}`}
                  className="text-sm text-muted-foreground hover:underline"
                >
                  {candidate.university.name}
                </Link>
              </TableCell>
            ) : null}

            <TableCell className="text-right">
              <ScoreBadge score={candidate.finalScore} />
            </TableCell>
            <TableCell className="text-right">
              <ScoreBadge score={candidate.discoveryScore} />
            </TableCell>

            {CATEGORY_COLUMNS.map((column) => {
              const count = countByCategory(candidate, column.categories);
              return (
                <TableCell key={column.label} className="tabular text-right">
                  {count > 0 ? (
                    count
                  ) : (
                    <span className="text-muted-foreground" title="No signals in this category">
                      —
                    </span>
                  )}
                </TableCell>
              );
            })}

            <TableCell className="max-w-40 truncate text-sm">
              {candidate.major ?? <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell className="tabular text-right text-sm">
              {candidate.graduationYear ?? <span className="text-muted-foreground">—</span>}
            </TableCell>

            <TableCell>
              <EnrichmentStatusBadge status={candidate.enrichmentStatus} />
            </TableCell>

            <TableCell className="text-right">
              <ConfidencePercent value={candidate.matchConfidence} />
            </TableCell>

            <TableCell className="tabular text-right text-sm">{candidate.sourceCount}</TableCell>

            <TableCell>
              <CandidateStatusBadge status={candidate.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Page links that preserve every active filter. */
export function Pagination({
  page,
  pageCount,
  total,
  buildHref,
}: {
  page: number;
  pageCount: number;
  total: number;
  buildHref: (page: number) => string;
}) {
  if (pageCount <= 1) {
    return (
      <p className="tabular px-4 py-3 text-sm text-muted-foreground">
        {total.toLocaleString()} candidate{total === 1 ? "" : "s"}
      </p>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
      <p className="tabular text-sm text-muted-foreground">
        Page {page} of {pageCount} · {total.toLocaleString()} candidates
      </p>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline" disabled={page <= 1}>
          <Link href={buildHref(Math.max(1, page - 1))} aria-disabled={page <= 1}>
            Previous
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" disabled={page >= pageCount}>
          <Link href={buildHref(Math.min(pageCount, page + 1))} aria-disabled={page >= pageCount}>
            Next
          </Link>
        </Button>
      </div>
    </div>
  );
}
