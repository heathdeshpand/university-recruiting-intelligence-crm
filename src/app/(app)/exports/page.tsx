import Link from "next/link";
import { Download, FileSpreadsheet } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
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

export default async function ExportsPage() {
  const exports = await prisma.export.findMany({
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      university: { select: { name: true, slug: true } },
      createdBy: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Exports"
        description="Generated workbooks. Downloads require a session and are recorded in the audit log, because a workbook contains personal data."
      />

      <div className="p-6">
        <Card>
          <CardContent className="p-0">
            {exports.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<FileSpreadsheet />}
                  title="No exports yet"
                  description="Generate a workbook from a university's Exports tab."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>University</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exports.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-mono text-xs">{record.filename}</TableCell>
                      <TableCell>
                        <Link
                          href={`/universities/${record.university.slug}/exports`}
                          className="text-sm text-primary hover:underline"
                        >
                          {record.university.name}
                        </Link>
                      </TableCell>
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
                        ) : null}
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
