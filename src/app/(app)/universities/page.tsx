import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
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
import { listUniversities } from "@/lib/api/universities";
import { formatNumber } from "@/lib/util/format";

export const metadata = { title: "Universities" };
export const dynamic = "force-dynamic";

export default async function UniversitiesPage() {
  const universities = await listUniversities();

  return (
    <>
      <PageHeader
        title="Universities"
        description="Each university is its own workspace, with its own discovered sources, candidates and scores."
        actions={
          <Button asChild>
            <Link href="/universities/new">
              <Plus />
              Add university
            </Link>
          </Button>
        }
      />

      <div className="p-6">
        {universities.length === 0 ? (
          <EmptyState
            icon={<Building2 />}
            title="No universities yet"
            description="Add a university to run source discovery against its public web presence."
            action={
              <Button asChild>
                <Link href="/universities/new">Add university</Link>
              </Button>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>University</TableHead>
                  <TableHead>Primary domain</TableHead>
                  <TableHead className="text-right">Sources</TableHead>
                  <TableHead className="text-right">Raw records</TableHead>
                  <TableHead className="text-right">Candidates</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {universities.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Link
                        href={`/universities/${u.slug}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {u.name}
                      </Link>
                      <div className="flex items-center gap-1.5 pt-0.5">
                        {u.shortName ? (
                          <span className="text-xs text-muted-foreground">{u.shortName}</span>
                        ) : null}
                        {u.isDemo ? (
                          <Badge variant="warning" className="text-[10px]">
                            Demo
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {u.domains[0]?.domain ?? "—"}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatNumber(u._count.sources)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatNumber(u._count.rawRecords)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatNumber(u._count.candidates)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
