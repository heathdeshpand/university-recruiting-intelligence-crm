import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/app/page-header";
import { JobList } from "@/components/app/job-list";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jobs" };

export default async function JobsPage() {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { university: { select: { name: true, slug: true } } },
  });

  const running = jobs.filter((j) => j.status === "RUNNING" || j.status === "QUEUED").length;

  return (
    <>
      <PageHeader
        title="Jobs"
        description={
          running > 0
            ? `${running} job${running === 1 ? "" : "s"} in progress. Pipeline work runs in the background, so no page waits on it.`
            : "Pipeline work runs in the background. Every stage that has run is recorded here."
        }
      />
      <div className="p-6">
        <Card>
          <CardContent className="p-0">
            <JobList jobs={jobs} showUniversity />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
