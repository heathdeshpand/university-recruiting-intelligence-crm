import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app/page-header";
import { UniversityTabs } from "@/components/app/university-tabs";

/**
 * University workspace shell.
 *
 * Each pipeline stage is its own route rather than a client-side tab, so the
 * URL is shareable, each tab fetches only its own data on the server, and a
 * heavy tab never slows down a light one.
 */
export default async function UniversityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const university = await prisma.university.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: { domains: { where: { isPrimary: true }, take: 1 } },
  });

  if (!university) notFound();

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/universities" className="hover:underline">
            Universities
          </Link>
        }
        title={
          <span className="flex items-center gap-2">
            {university.name}
            {university.isDemo ? <Badge variant="warning">Demo</Badge> : null}
          </span>
        }
        description={
          <span className="font-mono text-xs">
            {university.domains[0]?.domain ?? "no primary domain set"}
          </span>
        }
      />
      <UniversityTabs slug={university.slug} />
      <div className="p-6">{children}</div>
    </>
  );
}
