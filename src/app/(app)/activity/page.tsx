import Link from "next/link";
import { History } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, formatRelative } from "@/lib/util/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity" };

const PAGE_SIZE = 100;

/**
 * The audit log, made readable.
 *
 * Recording every consequential action is only half of an audit trail; if
 * nobody can read it, it answers no questions. This is where "who activated
 * that source", "who decided these two records were different people" and
 * "who took a copy of this data out of the system" get answered.
 */

/** Groups actions so the filter bar is short and meaningful. */
const CATEGORIES: Array<{ label: string; prefixes: string[] }> = [
  { label: "Sources", prefixes: ["source.", "collection."] },
  { label: "Candidates", prefixes: ["candidate.", "match."] },
  { label: "Scoring", prefixes: ["score.", "signals.", "normalization."] },
  { label: "Enrichment", prefixes: ["enrichment."] },
  { label: "Exports", prefixes: ["export."] },
  { label: "Access", prefixes: ["auth.", "config.", "university."] },
];

/** Actions worth colouring, because they change who can see or do what. */
const NOTABLE: Record<string, "warning" | "destructive" | "info" | "success"> = {
  "auth.login_failed": "warning",
  "university.deleted": "destructive",
  "source.failed": "warning",
  "source.disabled": "warning",
  "match.rejected": "info",
  "match.confirmed": "success",
  "candidate.split": "info",
  "candidate.merged": "info",
  "export.downloaded": "warning",
  "config.updated": "info",
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; category?: string }>;
}) {
  const { page: pageParam, category } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const selected = CATEGORIES.find((c) => c.label === category);
  const where = selected
    ? { OR: selected.prefixes.map((prefix) => ({ action: { startsWith: prefix } })) }
    : {};

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { at: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        actor: { select: { name: true, email: true } },
        university: { select: { name: true, slug: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    if (category && !("category" in overrides)) params.set("category", category);
    for (const [k, v] of Object.entries(overrides)) if (v) params.set(k, v);
    const query = params.toString();
    return `/activity${query ? `?${query}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Activity"
        description="Every consequential action, in order. Source activations, entity-match decisions, manual corrections, configuration changes and export downloads."
      />

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap gap-1.5">
          <Button asChild size="sm" variant={selected ? "outline" : "secondary"}>
            <Link href={href({ category: "" })}>All ({total.toLocaleString()})</Link>
          </Button>
          {CATEGORIES.map((c) => (
            <Button key={c.label} asChild size="sm" variant={category === c.label ? "secondary" : "outline"}>
              <Link href={href({ category: c.label, page: "" })}>{c.label}</Link>
            </Button>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            {entries.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<History />}
                  title="Nothing recorded yet"
                  description="Actions are logged as you use the application — running the pipeline, deciding matches, changing configuration, downloading exports."
                />
              </div>
            ) : (
              <ul className="divide-y">
                {entries.map((entry) => {
                  const tone = NOTABLE[entry.action];
                  const metadata = entry.metadata as Record<string, unknown> | null;

                  return (
                    <li key={entry.id} className="flex gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm">{entry.summary}</span>
                          <Badge variant={tone ?? "muted"} className="font-mono text-[10px]">
                            {entry.action}
                          </Badge>
                        </div>

                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {entry.actor ? entry.actor.name : "system"}
                          {entry.university ? (
                            <>
                              {" · "}
                              <Link
                                href={`/universities/${entry.university.slug}`}
                                className="hover:underline"
                              >
                                {entry.university.name}
                              </Link>
                            </>
                          ) : null}
                          {" · "}
                          <span title={formatDateTime(entry.at)}>{formatRelative(entry.at)}</span>
                          {entry.ip && entry.ip !== "unknown" ? ` · ${entry.ip}` : ""}
                        </p>

                        {metadata && Object.keys(metadata).length > 0 ? (
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                            {Object.entries(metadata)
                              .filter(([, v]) => v !== null && v !== undefined && v !== "")
                              .slice(0, 6)
                              .map(([k, v]) => `${k}=${String(v).slice(0, 40)}`)
                              .join("  ")}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>

          {pageCount > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
              <p className="tabular text-sm text-muted-foreground">
                Page {page} of {pageCount} · {total.toLocaleString()} entries
              </p>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline" disabled={page <= 1}>
                  <Link href={href({ page: String(Math.max(1, page - 1)) })}>Previous</Link>
                </Button>
                <Button asChild size="sm" variant="outline" disabled={page >= pageCount}>
                  <Link href={href({ page: String(Math.min(pageCount, page + 1)) })}>Next</Link>
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
