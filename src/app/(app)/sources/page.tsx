import Link from "next/link";
import { Database } from "lucide-react";
import type { SourceStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/app/page-header";
import { SourceStatusBadge } from "@/components/app/badges";
import { StatCard } from "@/components/app/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { displayUrl, formatNumber, formatRelative, humanizeEnum } from "@/lib/util/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sources" };

const STATUSES: SourceStatus[] = [
  "ACTIVE", "VALIDATED", "DISCOVERED", "REQUIRES_REVIEW", "FAILED", "UNAVAILABLE", "DISABLED",
];

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = STATUSES.includes(status as SourceStatus) ? (status as SourceStatus) : undefined;

  const [sources, counts] = await Promise.all([
    prisma.universitySource.findMany({
      where: filter ? { status: filter } : {},
      orderBy: [{ status: "asc" }, { universityId: "asc" }, { sourceType: "asc" }],
      take: 400,
      include: { university: { select: { name: true, slug: true } } },
    }),
    prisma.universitySource.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countFor = (s: SourceStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="Sources"
        description="Every source across every university. What a university publishes varies enormously, and a category recorded as not found was searched for and did not exist."
      />

      <div className="space-y-4 p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active" value={countFor("ACTIVE")} tone="success" />
          <StatCard label="Needs review" value={countFor("REQUIRES_REVIEW")} tone="warning" />
          <StatCard label="Not found" value={countFor("UNAVAILABLE")} tone="warning" hint="Searched, not published" />
          <StatCard label="Failed" value={countFor("FAILED")} tone="destructive" />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button asChild size="sm" variant={filter ? "outline" : "secondary"}>
            <Link href="/sources">All</Link>
          </Button>
          {STATUSES.map((s) => (
            <Button key={s} asChild size="sm" variant={filter === s ? "secondary" : "outline"}>
              <Link href={`/sources?status=${s}`}>
                {humanizeEnum(s)} ({countFor(s)})
              </Link>
            </Button>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            {sources.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<Database />}
                  title="No sources match"
                  description="Add a university and run source discovery."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>University</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Extractor</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                    <TableHead>Last collected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((source) => (
                    <TableRow key={source.id}>
                      <TableCell>
                        <Link
                          href={`/universities/${source.university.slug}/sources`}
                          className="font-medium text-primary hover:underline"
                        >
                          {source.name}
                        </Link>
                        {!source.url.startsWith("about:") ? (
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {displayUrl(source.url, 48)}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">{source.university.name}</TableCell>
                      <TableCell className="text-sm">{humanizeEnum(source.sourceType)}</TableCell>
                      <TableCell>
                        <SourceStatusBadge status={source.status} />
                      </TableCell>
                      <TableCell className="text-sm">{humanizeEnum(source.parserType)}</TableCell>
                      <TableCell className="tabular text-right">
                        {formatNumber(source.recordCount)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatRelative(source.lastCollectedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
