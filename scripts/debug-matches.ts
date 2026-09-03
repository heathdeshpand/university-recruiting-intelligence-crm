import { prisma } from "../src/lib/db";

async function main() {
  const university = await prisma.university.findUniqueOrThrow({
    where: { slug: "example-state-university" },
  });

  const counts = await prisma.entityMatch.groupBy({
    by: ["status"],
    where: { universityId: university.id },
    _count: { _all: true },
  });
  console.log("Match status counts:", Object.fromEntries(counts.map((c) => [c.status, c._count._all])));

  const probable = await prisma.entityMatch.findMany({
    where: { universityId: university.id, status: "PROBABLE_MATCH" },
    include: { recordA: true, recordB: true },
    orderBy: { matchScore: "desc" },
    take: 8,
  });

  console.log("\n--- Sample PROBABLE matches ---");
  for (const m of probable) {
    console.log(`\n${m.matchScore}  ${m.recordA.normalizedName}  vs  ${m.recordB.normalizedName}`);
    console.log(`  A: year=${m.recordA.graduationYear} major=${m.recordA.majorCanonical} org=${m.recordA.organization}`);
    console.log(`  B: year=${m.recordB.graduationYear} major=${m.recordB.majorCanonical} org=${m.recordB.organization}`);
    console.log(`  +  ${(m.matchingFactors as Array<{label:string;points:number}>).map((f) => `${f.label}(${f.points})`).join(", ")}`);
    console.log(`  -  ${(m.conflictingFactors as Array<{label:string}>).map((f) => f.label).join(", ") || "none"}`);
  }

  const review = await prisma.entityMatch.findMany({
    where: { universityId: university.id, status: "MANUAL_REVIEW" },
    include: { recordA: true, recordB: true },
    orderBy: { matchScore: "desc" },
    take: 5,
  });
  console.log("\n--- Sample MANUAL_REVIEW matches ---");
  for (const m of review) {
    console.log(`\n${m.matchScore}  ${m.recordA.normalizedName}  vs  ${m.recordB.normalizedName}`);
    console.log(`  A: year=${m.recordA.graduationYear} major=${m.recordA.majorCanonical}`);
    console.log(`  B: year=${m.recordB.graduationYear} major=${m.recordB.majorCanonical}`);
    console.log(`  +  ${(m.matchingFactors as Array<{label:string;points:number}>).map((f) => `${f.label}(${f.points})`).join(", ")}`);
  }

  const dist = await prisma.candidate.groupBy({
    by: ["recordCount"],
    where: { universityId: university.id },
    _count: { _all: true },
    orderBy: { recordCount: "asc" },
  });
  console.log("\nCandidates by record count:", dist.map((d) => `${d.recordCount}rec:${d._count._all}`).join(" "));
}

main().finally(() => prisma.$disconnect());
