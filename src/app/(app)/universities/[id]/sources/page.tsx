import { Database } from "lucide-react";
import { prisma } from "@/lib/db";
import { getUniversityOr404 } from "@/lib/api/universities";
import { SourceRow, type SourceView } from "@/components/app/source-row";
import { PipelineRunner } from "@/components/app/pipeline-runner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { JOB_TYPE_DESCRIPTIONS, JOB_TYPE_LABELS } from "@/lib/jobs/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sources" };

/** Ordered so the sources that need attention appear first. */
const STATUS_ORDER = ["FAILED", "REQUIRES_REVIEW", "ACTIVE", "VALIDATED", "DISCOVERED", "DISABLED", "UNAVAILABLE"];

export default async function UniversitySourcesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const university = await getUniversityOr404(id);

  const sources = await prisma.universitySource.findMany({
    where: { universityId: university.id },
    orderBy: [{ sourceType: "asc" }, { name: "asc" }],
  });

  const sorted = [...sources].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
  );

  const views: SourceView[] = sorted.map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    sourceType: s.sourceType,
    status: s.status,
    parserType: s.parserType,
    accessMethod: s.accessMethod,
    discoveryMethod: s.discoveryMethod,
    confidence: s.confidence,
    recordCount: s.recordCount,
    description: s.description,
    classifierNotes: s.classifierNotes,
    errorMessage: s.errorMessage,
    active: s.active,
    lastDiscoveredAt: s.lastDiscoveredAt?.toISOString() ?? null,
    lastValidatedAt: s.lastValidatedAt?.toISOString() ?? null,
    lastCollectedAt: s.lastCollectedAt?.toISOString() ?? null,
    validationSummary: s.validationSummary as SourceView["validationSummary"],
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Source registry</CardTitle>
              <CardDescription>
                What this university publishes, what could be read, and what could not. A category
                shown as &ldquo;not found&rdquo; was searched for and did not exist — which is not
                the same as its students having no involvement of that kind.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {views.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={<Database />}
                    title="No sources yet"
                    description="Run source discovery to search this university's public web presence."
                  />
                </div>
              ) : (
                <div className="border-t">
                  {views.map((source) => (
                    <SourceRow key={source.id} source={source} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <PipelineRunner
            universitySlug={university.slug}
            defaultStage="SOURCE_DISCOVERY"
            stages={[
              {
                type: "SOURCE_DISCOVERY",
                label: JOB_TYPE_LABELS.SOURCE_DISCOVERY,
                description: JOB_TYPE_DESCRIPTIONS.SOURCE_DISCOVERY,
              },
              {
                type: "SOURCE_VALIDATION",
                label: JOB_TYPE_LABELS.SOURCE_VALIDATION,
                description: JOB_TYPE_DESCRIPTIONS.SOURCE_VALIDATION,
              },
              {
                type: "DATA_COLLECTION",
                label: JOB_TYPE_LABELS.DATA_COLLECTION,
                description: JOB_TYPE_DESCRIPTIONS.DATA_COLLECTION,
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
