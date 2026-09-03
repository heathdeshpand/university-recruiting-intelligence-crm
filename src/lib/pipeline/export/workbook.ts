import ExcelJS from "exceljs";
import type { PrismaClient, SourceType } from "@prisma/client";
import { DISCOVERY_CATEGORIES } from "@/lib/config/discovery";
import { groupBreakdown, type CategoryBreakdown } from "@/lib/pipeline/scoring/engine";

/**
 * Builds a university's Excel workbook.
 *
 * Design rule: the workbook has to be useful on its own, opened by someone
 * who has never seen the application. So every sheet carries source URLs,
 * plain-language score explanations and match confidences as literal values.
 * Nothing important is hidden inside a formula, and nothing requires the app
 * to interpret it.
 *
 * Categories a university does not publish still get a sheet, carrying a note
 * that says the category was searched for and not found. An absent sheet
 * would be ambiguous; an explicit "not published" is information.
 */

export interface WorkbookResult {
  buffer: Buffer;
  sheetCounts: Record<string, number>;
}

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F3864" },
};

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: Array<{ header: string; key: string; width: number }>,
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = columns;

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  header.fill = HEADER_FILL;
  header.alignment = { vertical: "middle" };
  header.height = 20;

  return sheet;
}

/** Writes an explanatory row on a sheet that legitimately has no data. */
function addUnavailableNote(sheet: ExcelJS.Worksheet, message: string): void {
  const row = sheet.addRow({});
  row.getCell(1).value = message;
  row.getCell(1).font = { italic: true, color: { argb: "FF806000" } };
  sheet.mergeCells(row.number, 1, row.number, Math.max(2, sheet.columnCount));
}

export async function buildUniversityWorkbook(
  prisma: PrismaClient,
  universityId: string,
): Promise<WorkbookResult> {
  const university = await prisma.university.findUniqueOrThrow({
    where: { id: universityId },
    include: { domains: true },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "University Recruiting Intelligence CRM";
  workbook.created = new Date();

  const sheetCounts: Record<string, number> = {};

  // --- Overview -------------------------------------------------------------
  const overview = addSheet(workbook, "Overview", [
    { header: "Field", key: "field", width: 34 },
    { header: "Value", key: "value", width: 70 },
  ]);

  const [candidateCount, rawCount, sourceCount, enrichedCount, avgScore] = await Promise.all([
    prisma.candidate.count({ where: { universityId } }),
    prisma.rawRecord.count({ where: { universityId } }),
    prisma.universitySource.count({ where: { universityId } }),
    prisma.candidate.count({ where: { universityId, enrichmentStatus: "ENRICHED" } }),
    prisma.candidate.aggregate({ where: { universityId, finalScore: { not: null } }, _avg: { finalScore: true } }),
  ]);

  for (const [field, value] of [
    ["University", university.name],
    ["Primary domain", university.domains.find((d) => d.isPrimary)?.domain ?? "—"],
    ["Exported at", new Date().toISOString()],
    ["Sources registered", sourceCount],
    ["Raw source records", rawCount],
    ["Unique candidates", candidateCount],
    ["Enriched candidates", enrichedCount],
    ["Average final score", avgScore._avg.finalScore ? Math.round(avgScore._avg.finalScore) : "not scored"],
    [
      "Data note",
      university.isDemo
        ? "SYNTHETIC DEMO DATA. Every person, source and score in this workbook is fictional."
        : "Derived from publicly accessible sources. Scores are decision support, not objective judgements.",
    ],
    [
      "Missing data",
      "Blank fields mean no source covered that field. They do not mean the answer is no.",
    ],
  ] as Array<[string, string | number]>) {
    overview.addRow({ field, value });
  }
  if (university.isDemo) {
    overview.getRow(overview.rowCount - 1).font = { bold: true, color: { argb: "FFC00000" } };
  }
  sheetCounts.Overview = overview.rowCount - 1;

  // --- Candidates -----------------------------------------------------------
  const candidatesSheet = addSheet(workbook, "Candidates", [
    { header: "Candidate ID", key: "id", width: 26 },
    { header: "Name", key: "name", width: 26 },
    { header: "Final score", key: "finalScore", width: 12 },
    { header: "Tier", key: "tier", width: 8 },
    { header: "Discovery score", key: "discoveryScore", width: 15 },
    { header: "Status", key: "status", width: 13 },
    { header: "Enrichment", key: "enrichment", width: 16 },
    { header: "Major", key: "major", width: 24 },
    { header: "Graduation year", key: "graduationYear", width: 15 },
    { header: "Career stage", key: "careerStage", width: 16 },
    { header: "Email", key: "email", width: 32 },
    { header: "Source records", key: "recordCount", width: 14 },
    { header: "Distinct sources", key: "sourceCount", width: 15 },
    { header: "Signals", key: "signalCount", width: 9 },
    { header: "Match confidence", key: "matchConfidence", width: 16 },
    { header: "Signal summary", key: "signals", width: 60 },
    { header: "Signal patterns", key: "patterns", width: 44 },
  ]);

  const candidates = await prisma.candidate.findMany({
    where: { universityId },
    orderBy: [{ finalScore: "desc" }, { discoveryScore: "desc" }],
    include: {
      signals: { select: { definitionKey: true, occurrences: true }, orderBy: { definitionKey: "asc" } },
      patterns: { select: { label: true } },
    },
  });

  for (const c of candidates) {
    candidatesSheet.addRow({
      id: c.id,
      name: c.canonicalName,
      finalScore: c.finalScore ?? "",
      tier: c.tier === "UNRANKED" ? "" : c.tier.replace("TIER_", ""),
      discoveryScore: c.discoveryScore ?? "",
      status: c.status,
      enrichment: c.enrichmentStatus,
      major: c.major ?? "",
      graduationYear: c.graduationYear ?? "",
      careerStage: c.careerStage === "UNKNOWN" ? "" : c.careerStage,
      email: c.email ?? "",
      recordCount: c.recordCount,
      sourceCount: c.sourceCount,
      signalCount: c.signalCount,
      matchConfidence: c.matchConfidence !== null ? `${Math.round(c.matchConfidence * 100)}%` : "",
      signals: c.signals
        .map((s) => (s.occurrences > 1 ? `${s.definitionKey} (${s.occurrences})` : s.definitionKey))
        .join(", "),
      patterns: c.patterns.map((p) => p.label).join("; "),
    });
  }
  candidatesSheet.autoFilter = { from: "A1", to: { row: 1, column: candidatesSheet.columnCount } };
  sheetCounts.Candidates = candidates.length;

  // --- Scoring --------------------------------------------------------------
  const scoringSheet = addSheet(workbook, "Scoring", [
    { header: "Candidate ID", key: "candidateId", width: 26 },
    { header: "Name", key: "name", width: 24 },
    { header: "Score kind", key: "kind", width: 12 },
    { header: "Total", key: "total", width: 8 },
    { header: "Breakdown", key: "breakdown", width: 62 },
    { header: "Factor", key: "factor", width: 34 },
    { header: "Points", key: "points", width: 8 },
    { header: "Evidence", key: "evidence", width: 60 },
    { header: "Source", key: "source", width: 30 },
    { header: "Source URL", key: "sourceUrl", width: 50 },
    { header: "Confidence", key: "confidence", width: 12 },
  ]);

  const scores = await prisma.score.findMany({
    where: { candidate: { universityId } },
    include: {
      candidate: { select: { canonicalName: true } },
      factors: { orderBy: { points: "desc" } },
    },
    orderBy: [{ kind: "asc" }, { value: "desc" }],
  });

  let scoringRows = 0;
  for (const score of scores) {
    const summary = groupBreakdown(score.breakdown as unknown as Record<string, CategoryBreakdown>)
      .map((g) => `${g.label} ${g.earned}/${g.max}`)
      .join(" · ");

    if (score.factors.length === 0) {
      scoringSheet.addRow({
        candidateId: score.candidateId,
        name: score.candidate.canonicalName,
        kind: score.kind,
        total: score.value,
        breakdown: summary,
        factor: "No scoring rule fired for this candidate.",
      });
      scoringRows += 1;
      continue;
    }

    for (const [i, factor] of score.factors.entries()) {
      scoringSheet.addRow({
        // Repeating the identity on every factor row keeps the sheet usable
        // when someone sorts or filters it, which they will.
        candidateId: score.candidateId,
        name: score.candidate.canonicalName,
        kind: score.kind,
        total: i === 0 ? score.value : "",
        breakdown: i === 0 ? summary : "",
        factor: factor.label,
        points: factor.points,
        evidence: factor.evidenceSummary ?? "",
        source: factor.sourceName ?? "",
        sourceUrl: factor.sourceUrl ?? "",
        confidence: factor.confidence,
      });
      scoringRows += 1;
    }
  }
  sheetCounts.Scoring = scoringRows;

  // --- Per-category record sheets ------------------------------------------
  const CATEGORY_SHEETS: Array<{ name: string; types: SourceType[] }> = [
    { name: "Greek Life", types: ["GREEK_LIFE", "FRATERNITY", "SORORITY"] },
    { name: "Club Sports", types: ["CLUB_SPORT"] },
    { name: "Intramurals", types: ["INTRAMURAL"] },
    { name: "Student Organizations", types: ["STUDENT_ORGANIZATION", "STUDENT_GOVERNMENT", "HONOR_SOCIETY"] },
    // Career-oriented organizations get their own sheet even when they were
    // found inside the general organization directory.
    { name: "Athletics", types: ["ATHLETICS"] },
    {
      name: "Career Organizations",
      types: ["ENTREPRENEURSHIP", "BUSINESS_ORGANIZATION", "SALES_ORGANIZATION", "PROFESSIONAL_ORGANIZATION", "COMPETITIVE_ORGANIZATION"],
    },
  ];

  for (const spec of CATEGORY_SHEETS) {
    const sheet = addSheet(workbook, spec.name, [
      { header: "Candidate ID", key: "candidateId", width: 26 },
      { header: "Candidate", key: "candidate", width: 24 },
      { header: "Name as published", key: "rawName", width: 26 },
      { header: "Organization", key: "organization", width: 34 },
      { header: "Role", key: "role", width: 22 },
      { header: "Sport", key: "sport", width: 18 },
      { header: "Major", key: "major", width: 22 },
      { header: "Graduation year", key: "year", width: 15 },
      { header: "Source", key: "source", width: 32 },
      { header: "Source URL", key: "sourceUrl", width: 52 },
      { header: "Collected at", key: "collectedAt", width: 22 },
    ]);

    const records = await prisma.normalizedRecord.findMany({
      where: {
        universityId,
        // A sales club found inside a general student-organization directory
        // still belongs on the career sheet. Categorising by the source alone
        // would file it under "student organizations" and leave the career
        // sheet empty, which is exactly the wrong answer.
        OR: [
          { rawRecord: { source: { sourceType: { in: spec.types } } } },
          { organizationCategory: { in: spec.types } },
        ],
      },
      include: {
        candidateLink: { select: { candidate: { select: { id: true, canonicalName: true } } } },
        rawRecord: {
          select: {
            rawName: true,
            rawUrl: true,
            discoveredAt: true,
            source: { select: { name: true, url: true } },
          },
        },
      },
      orderBy: { normalizedName: "asc" },
    });

    if (records.length === 0) {
      const notFound = await prisma.universitySource.findFirst({
        where: { universityId, sourceType: { in: spec.types }, status: "UNAVAILABLE" },
      });
      const label =
        DISCOVERY_CATEGORIES.find((c) => spec.types.includes(c.sourceType))?.label ?? spec.name;

      addUnavailableNote(
        sheet,
        notFound
          ? `${label}: discovery searched for this category and found no page containing extractable records. This means the university does not appear to publish it. It does not mean its students have no involvement of this kind.`
          : `${label}: no records collected. Either no source of this type has been collected yet, or the university does not publish one.`,
      );
      sheetCounts[spec.name] = 0;
      continue;
    }

    for (const r of records) {
      sheet.addRow({
        candidateId: r.candidateLink?.candidate.id ?? "",
        candidate: r.candidateLink?.candidate.canonicalName ?? "",
        rawName: r.rawRecord.rawName ?? "",
        organization: r.organization ?? "",
        role: r.role ?? "",
        sport: r.sportCanonical ?? r.sport ?? "",
        major: r.major ?? "",
        year: r.graduationYear ?? "",
        source: r.rawRecord.source.name,
        sourceUrl: r.rawRecord.rawUrl ?? r.rawRecord.source.url,
        collectedAt: r.rawRecord.discoveredAt.toISOString(),
      });
    }
    sheet.autoFilter = { from: "A1", to: { row: 1, column: sheet.columnCount } };
    sheetCounts[spec.name] = records.length;
  }

  // --- Career signals -------------------------------------------------------
  const careerSheet = addSheet(workbook, "Career Signals", [
    { header: "Candidate ID", key: "candidateId", width: 26 },
    { header: "Candidate", key: "candidate", width: 24 },
    { header: "Signal", key: "signal", width: 28 },
    { header: "Category", key: "category", width: 18 },
    { header: "Value", key: "value", width: 10 },
    { header: "Occurrences", key: "occurrences", width: 12 },
    { header: "Confidence", key: "confidence", width: 12 },
    { header: "Supporting evidence", key: "evidence", width: 70 },
    { header: "Source URL", key: "sourceUrl", width: 50 },
  ]);

  const careerSignals = await prisma.signal.findMany({
    where: {
      candidate: { universityId },
      category: { in: ["SALES", "BUSINESS", "ENTREPRENEURSHIP", "CAREER", "WORK_EXPERIENCE", "CUSTOMER_FACING", "JOB_SEARCH"] },
    },
    include: {
      candidate: { select: { id: true, canonicalName: true } },
      evidenceLinks: { take: 3, include: { evidence: { select: { statement: true, sourceUrl: true } } } },
    },
    orderBy: [{ candidateId: "asc" }, { category: "asc" }],
  });

  if (careerSignals.length === 0) {
    addUnavailableNote(
      careerSheet,
      "No career, sales or work-experience signals were found. These signals are only recorded when a source states them explicitly; they are never inferred.",
    );
  } else {
    for (const s of careerSignals) {
      careerSheet.addRow({
        candidateId: s.candidate.id,
        candidate: s.candidate.canonicalName,
        signal: s.definitionKey,
        category: s.category,
        value: s.value,
        occurrences: s.occurrences,
        confidence: s.confidence,
        evidence: s.evidenceLinks.map((l) => l.evidence.statement).join(" | "),
        sourceUrl: s.evidenceLinks[0]?.evidence.sourceUrl ?? "",
      });
    }
    careerSheet.autoFilter = { from: "A1", to: { row: 1, column: careerSheet.columnCount } };
  }
  sheetCounts["Career Signals"] = careerSignals.length;

  // --- Student directory / enrichment --------------------------------------
  const directorySheet = addSheet(workbook, "Student Directory", [
    { header: "Candidate ID", key: "candidateId", width: 26 },
    { header: "Candidate", key: "candidate", width: 24 },
    { header: "Discovery score", key: "score", width: 15 },
    { header: "Outcome", key: "outcome", width: 20 },
    { header: "Matched name", key: "matchedName", width: 26 },
    { header: "Match confidence", key: "confidence", width: 16 },
    { header: "Email", key: "email", width: 32 },
    { header: "Major", key: "major", width: 24 },
    { header: "Graduation year", key: "year", width: 15 },
    { header: "Matching factors", key: "matching", width: 46 },
    { header: "Conflicting factors", key: "conflicting", width: 40 },
    { header: "Source URL", key: "sourceUrl", width: 48 },
    { header: "Attempted at", key: "at", width: 22 },
  ]);

  const enrichmentJobs = await prisma.enrichmentJob.findMany({
    where: { universityId },
    include: {
      candidate: { select: { id: true, canonicalName: true } },
      results: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  if (enrichmentJobs.length === 0) {
    addUnavailableNote(
      directorySheet,
      "No enrichment has been attempted. Enrichment runs only for candidates whose discovery score reaches the threshold, and only where the university publishes a usable directory.",
    );
  } else {
    for (const job of enrichmentJobs) {
      const result = job.results[0];
      const fields = (result?.fields ?? {}) as { email?: string; major?: string; graduationYear?: number };
      const matching = (result?.matchingFactors ?? []) as Array<{ label: string }>;
      const conflicting = (result?.conflictingFactors ?? []) as Array<{ label: string }>;

      directorySheet.addRow({
        candidateId: job.candidate.id,
        candidate: job.candidate.canonicalName,
        score: job.qualifiedScore ?? "",
        outcome: result?.outcome ?? job.status,
        matchedName: result?.matchedName ?? "",
        confidence: result?.matchConfidence ? `${Math.round(result.matchConfidence * 100)}%` : "",
        email: fields.email ?? "",
        major: fields.major ?? "",
        year: fields.graduationYear ?? "",
        matching: matching.map((f) => f.label).join("; "),
        conflicting: conflicting.map((f) => f.label).join("; "),
        sourceUrl: result?.sourceUrl ?? "",
        at: job.createdAt.toISOString(),
      });
    }
    directorySheet.autoFilter = { from: "A1", to: { row: 1, column: directorySheet.columnCount } };
  }
  sheetCounts["Student Directory"] = enrichmentJobs.length;

  // --- Entity resolution ----------------------------------------------------
  const matchSheet = addSheet(workbook, "Entity Resolution", [
    { header: "Status", key: "status", width: 16 },
    { header: "Match score", key: "score", width: 12 },
    { header: "Confidence", key: "confidence", width: 12 },
    { header: "Record A", key: "recordA", width: 26 },
    { header: "Record A source", key: "sourceA", width: 30 },
    { header: "Record B", key: "recordB", width: 26 },
    { header: "Record B source", key: "sourceB", width: 30 },
    { header: "Matching factors", key: "matching", width: 60 },
    { header: "Conflicting factors", key: "conflicting", width: 44 },
    { header: "Human decision", key: "decision", width: 16 },
    { header: "Candidate A", key: "candidateA", width: 26 },
    { header: "Candidate B", key: "candidateB", width: 26 },
  ]);

  const matches = await prisma.entityMatch.findMany({
    where: { universityId },
    include: {
      recordA: { include: { rawRecord: { select: { source: { select: { name: true } } } } } },
      recordB: { include: { rawRecord: { select: { source: { select: { name: true } } } } } },
    },
    orderBy: { matchScore: "desc" },
    take: 5000,
  });

  if (matches.length === 0) {
    addUnavailableNote(matchSheet, "Entity resolution has not run, or found no pairs worth comparing.");
  } else {
    for (const m of matches) {
      const matching = (m.matchingFactors ?? []) as Array<{ label: string; detail?: string }>;
      const conflicting = (m.conflictingFactors ?? []) as Array<{ label: string; detail?: string }>;
      matchSheet.addRow({
        status: m.status,
        score: m.matchScore,
        confidence: `${Math.round(m.confidence * 100)}%`,
        recordA: m.recordA.normalizedName,
        sourceA: m.recordA.rawRecord.source.name,
        recordB: m.recordB.normalizedName,
        sourceB: m.recordB.rawRecord.source.name,
        matching: matching.map((f) => (f.detail ? `${f.label} (${f.detail})` : f.label)).join("; "),
        conflicting: conflicting.map((f) => (f.detail ? `${f.label} (${f.detail})` : f.label)).join("; "),
        decision: m.manualDecision ?? "",
        candidateA: m.candidateAId ?? "",
        candidateB: m.candidateBId ?? "",
      });
    }
    matchSheet.autoFilter = { from: "A1", to: { row: 1, column: matchSheet.columnCount } };
  }
  sheetCounts["Entity Resolution"] = matches.length;

  // --- Sources --------------------------------------------------------------
  const sourcesSheet = addSheet(workbook, "Sources", [
    { header: "Name", key: "name", width: 40 },
    { header: "Type", key: "type", width: 26 },
    { header: "Status", key: "status", width: 16 },
    { header: "URL", key: "url", width: 56 },
    { header: "Extractor", key: "parser", width: 22 },
    { header: "Access method", key: "access", width: 18 },
    { header: "Discovery method", key: "discovery", width: 18 },
    { header: "Confidence", key: "confidence", width: 12 },
    { header: "Records", key: "records", width: 10 },
    { header: "Discovered at", key: "discovered", width: 22 },
    { header: "Last collected", key: "collected", width: 22 },
    { header: "Notes", key: "notes", width: 70 },
  ]);

  const sources = await prisma.universitySource.findMany({
    where: { universityId },
    orderBy: [{ status: "asc" }, { sourceType: "asc" }],
  });

  for (const s of sources) {
    sourcesSheet.addRow({
      name: s.name,
      type: s.sourceType,
      status: s.status,
      url: s.url.startsWith("about:") ? "" : s.url,
      parser: s.parserType,
      access: s.accessMethod,
      discovery: s.discoveryMethod,
      confidence: s.confidence ? `${Math.round(s.confidence * 100)}%` : "",
      records: s.recordCount,
      discovered: s.lastDiscoveredAt?.toISOString() ?? "",
      collected: s.lastCollectedAt?.toISOString() ?? "",
      notes: s.errorMessage ?? s.description ?? s.classifierNotes ?? "",
    });
  }
  sourcesSheet.autoFilter = { from: "A1", to: { row: 1, column: sourcesSheet.columnCount } };
  sheetCounts.Sources = sources.length;

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(arrayBuffer), sheetCounts };
}
