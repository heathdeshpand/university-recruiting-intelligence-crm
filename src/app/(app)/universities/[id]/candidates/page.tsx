import { getUniversityOr404 } from "@/lib/api/universities";
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

export default async function UniversityCandidatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const university = await getUniversityOr404(id);

  const query = parseCandidateQuery(search, university.id);
  const base = `/universities/${university.slug}/candidates`;

  const [result, majors, years] = await Promise.all([
    queryCandidates(query),
    listMajors(university.id),
    listGraduationYears(university.id),
  ]);

  return (
    <div className="space-y-4">
      <CandidateFilters
        action={base}
        filters={toFilterState(search)}
        majors={majors}
        years={years}
        activeCount={countActiveFilters(search)}
      />

      <div className="rounded-lg border bg-card">
        <CandidateTable
          candidates={result.candidates}
          emptyDescription={
            countActiveFilters(search) > 0
              ? "Try widening or clearing the filters."
              : "Run entity resolution to turn this university's records into candidates."
          }
        />
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          buildHref={(page) => `${base}${buildQueryString(search, { page: String(page) })}`}
        />
      </div>
    </div>
  );
}
