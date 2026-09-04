import { Download, FileSpreadsheet } from "lucide-react";
import { prisma } from "@/lib/db";
import { getUniversityOr404 } from "@/lib/api/universities";
import { ExportButton } from "@/components/app/export-button";
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
export const metadata = { title: "Exports" };

export default async function UniversityExportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const university = await getUniversityOr404(id);

  const exports = await prisma.export.findMany({
    where: { universityId: university.id },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: { createdBy: { select: { name: true } } },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Workbooks</CardTitle>
            <CardDescription>
              Each export is a self-contained Excel workbook: candidates, per-category records,
              score breakdowns with their evidence, entity-resolution decisions and the source
              registry. Source URLs and explanations are literal values, so the file is useful
              without this application.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {exports.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<FileSpreadsheet />}
                  title="No workbooks yet"
                  description="Generate one to export everything this university has produced."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exports.map((record) => {
                    const counts = (record.sheetCounts ?? {}) as Record<string, number>;
                    const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);

                    return (
                      <TableRow key={record.id}>
                        <TableCell className="font-mono text-xs">{record.filename}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              record.status === "COMPLETED"
                                ? "success"
                                : record.status === "FAILED"
                                  ? "destructive"
                                  : "info"
                            }
                          >
                            {record.status.toLowerCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular text-right text-sm">
                          {record.sizeBytes ? `${Math.round(record.sizeBytes / 1024)} KB` : "—"}
                        </TableCell>
                        <TableCell className="tabular text-sm">
                          {totalRows > 0 ? totalRows.toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(record.createdAt)}
                          {record.createdBy ? ` · ${record.createdBy.name}` : ""}
                        </TableCell>
                        <TableCell className="text-right">
                          {record.status === "COMPLETED" ? (
                            <Button asChild size="sm" variant="outline">
                              <a href={`/api/exports/${record.id}/download`}>
                                <Download />
                                Download
                              </a>
                            </Button>
                          ) : record.error ? (
                            <span className="text-xs text-destructive">{record.error}</span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Generate</CardTitle>
          </CardHeader>
          <CardContent>
            <ExportButton universitySlug={university.slug} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>A note on handling</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              A generated workbook contains personal data. Downloads require a session and are
              recorded in the audit log.
            </p>
            <p>
              Exports are written outside the repository and are gitignored, so a workbook cannot
              be committed by accident.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
