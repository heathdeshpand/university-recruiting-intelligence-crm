import { PageHeader } from "@/components/app/page-header";
import { DataQualityPanel } from "@/components/app/data-quality";
import { getDataQuality } from "@/lib/api/stats";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data quality" };

export default async function DataQualityPage() {
  const quality = await getDataQuality();

  return (
    <>
      <PageHeader
        title="Data quality"
        description="How much to trust what the CRM is showing. Where records were lost between stages, what is unknown rather than absent, and what is still waiting on a person."
      />
      <div className="p-6">
        <DataQualityPanel quality={quality} />
      </div>
    </>
  );
}
