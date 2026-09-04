import { prisma } from "@/lib/db";
import { getUniversityOr404 } from "@/lib/api/universities";
import { JobList } from "@/components/app/job-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jobs" };

export default async function UniversityJobsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const university = await getUniversityOr404(id);

  const jobs = await prisma.job.findMany({
    where: { universityId: university.id },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job history</CardTitle>
        <CardDescription>
          Every pipeline stage run for this university, with what it did and how long it took.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <JobList jobs={jobs} />
      </CardContent>
    </Card>
  );
}
