import Link from "next/link";
import { Database, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { getUniversityOr404 } from "@/lib/api/universities";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/util/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Raw data" };

const PAGE_SIZE = 100;

/**
 * The raw layer, shown as-is.
 *
 * Raw records are never rewritten by later stages, so this page is the ground
 * truth for "what did the source actually say?". A record that failed to
 * normalize still appears here, which is how a parser problem becomes
 * visible rather than silent.
 */
export default async function UniversityRawPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; sourceId?: string }>;
}) {
  const { id } = await params;
  const { page: pageParam, sourceId } = await searchParams;
  const university = await getUniversityOr404(id);
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const where = {
    universityId: university.id,
    ...(sourceId ? { sourceId } : {}),
  };

  const [records, total, sources] = await Promise.all([
    prisma.rawRecord.findMany({
      where,
      orderBy: { discoveredAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        source: { select: { id: true, name: true, url: true } },
        normalized: { select: { id: true, candidateLink: { select: { candidateId: true } } } },
      },
    }),
    prisma.rawRecord.count({ where }),
    prisma.universitySource.findMany({
      where: { universityId: university.id, recordCount: { gt: 0 } },
      select: { id: true, name: true, recordCount: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const base = `/universities/${university.slug}/raw`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Raw source records</CardTitle>
          <CardDescription>
            Exactly what each source returned, before normalization. These rows are never
            overwritten, so they stay available as evidence for every downstream decision.
          </CardDescription>
        </CardHeader>

        {sources.length > 0 ? (
          <CardContent className="flex flex-wrap gap-1.5 pb-4">
            <Button asChild size="sm" variant={sourceId ? "outline" : "secondary"}>
              <Link href={base}>All sources ({total.toLocaleString()})</Link>
            </Button>
            {sources.map((source) => (
              <Button
                key={source.id}
                asChild
                size="sm"
                variant={sourceId === source.id ? "secondary" : "outline"}
              >
                <Link href={`${base}?sourceId=${source.id}`}>
                  {source.name} ({source.recordCount.toLocaleString()})
                </Link>
              </Button>
            ))}
          </CardContent>
        ) : null}

        <CardContent className="p-0">
          {records.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Database />}
                title="No raw records"
                description="Run data collection to fetch this university's active sources."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name as published</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Major</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Collected</TableHead>
                  <TableHead>Resolved to</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.rawName ?? "—"}</TableCell>
                    <TableCell>{record.rawOrganization ?? "—"}</TableCell>
                    <TableCell>{record.rawRole ?? "—"}</TableCell>
                    <TableCell>{record.rawMajor ?? "—"}</TableCell>
                    <TableCell className="tabular">{record.rawYear ?? "—"}</TableCell>
                    <TableCell>
                      {record.rawUrl && !record.rawUrl.startsWith("about:") ? (
                        <a
                          href={record.rawUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {record.source.name}
                          <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        record.source.name
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(record.discoveredAt)}
                    </TableCell>
                    <TableCell>
                      {record.normalized?.candidateLink ? (
                        <Link
                          href={`/candidates/${record.normalized.candidateLink.candidateId}`}
                          className="text-sm text-primary hover:underline"
                        >
                          Candidate
                        </Link>
                      ) : record.normalized ? (
                        <Badge variant="warning">Not yet resolved</Badge>
                      ) : (
                        <Badge
                          variant="muted"
                          title="No person name could be parsed from this record, so it never became a candidate."
                        >
                          Not normalized
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {pageCount > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
            <p className="tabular text-sm text-muted-foreground">
              Page {page} of {pageCount} · {total.toLocaleString()} records
            </p>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline" disabled={page <= 1}>
                <Link href={`${base}?page=${Math.max(1, page - 1)}${sourceId ? `&sourceId=${sourceId}` : ""}`}>
                  Previous
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" disabled={page >= pageCount}>
                <Link href={`${base}?page=${Math.min(pageCount, page + 1)}${sourceId ? `&sourceId=${sourceId}` : ""}`}>
                  Next
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
