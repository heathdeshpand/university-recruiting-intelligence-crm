import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { NewUniversityForm } from "@/app/(app)/universities/new/form";

export const metadata = { title: "Add university" };

export default function NewUniversityPage() {
  return (
    <>
      <PageHeader
        title="Add a university"
        breadcrumb={
          <Link href="/universities" className="hover:underline">
            Universities
          </Link>
        }
        description="Source discovery uses the domains and names you give here to search the university's public web presence. The more accurate the aliases, the better discovery performs."
      />
      <div className="max-w-2xl p-6">
        <NewUniversityForm />
      </div>
    </>
  );
}
