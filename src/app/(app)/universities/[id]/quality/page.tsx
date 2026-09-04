import { getUniversityOr404 } from "@/lib/api/universities";
import { DataQualityPanel } from "@/components/app/data-quality";
import { getDataQuality } from "@/lib/api/stats";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data quality" };

export default async function UniversityDataQualityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const university = await getUniversityOr404(id);
  const quality = await getDataQuality(university.id);

  return <DataQualityPanel quality={quality} universitySlug={university.slug} />;
}
