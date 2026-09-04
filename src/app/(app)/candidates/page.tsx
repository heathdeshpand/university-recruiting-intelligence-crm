import { PageHeader } from "@/components/app/page-header";
import { CandidateFilters } from "@/components/app/candidate-filters";
import { CandidateTable, Pagination } from "@/components/app/candidate-table";
import { listGraduationYears, listMajors, queryCandidates } from "@/lib/api/candidates";
import {
  buildQueryString,
  countActiveFilters,
  parseCandidateQuery,
  toFilterState,
  type RawSearchParams,
} from "@/lib/api/search-params";

export const dynamic = "force-dynamic";
export const metadata = { title: "Candidates" };

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const query = parseCandidateQuery(params);

  const [result, majors, years] = await Promise.all([
    queryCandidates(query),
    listMajors(),
    listGraduationYears(),
  ]);

  return (
    <>
      <PageHeader
        title="Candidates"
        description="Every resolved candidate across all universities. Filters run on the server, so a filtered view is shareable as a URL."
      />

      <div className="space-y-4 p-6">
        <CandidateFilters
          action="/candidates"
          filters={toFilterState(params)}
          majors={majors}
          years={years}
          activeCount={countActiveFilters(params)}
        />

        <div className="rounded-lg border bg-card">
          <CandidateTable
            candidates={result.candidates}
            showUniversity
            emptyDescription={
              countActiveFilters(params) > 0
                ? "Try widening or clearing the filters."
                : "Run the pipeline for a university to produce candidates."
            }
          />
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            buildHref={(page) => `/candidates${buildQueryString(params, { page: String(page) })}`}
          />
        </div>
      </div>
    </>
  );
}
