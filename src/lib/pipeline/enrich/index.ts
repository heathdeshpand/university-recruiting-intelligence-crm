import type { PrismaClient } from "@prisma/client";
import { fetchSourceContent } from "@/lib/pipeline/transport";
import { extract } from "@/lib/pipeline/extract/registry";
import { normalizeRecord } from "@/lib/pipeline/normalize";
import { buildSurnameFrequency, scorePair } from "@/lib/pipeline/resolve/score";
import type { ResolvableRecord } from "@/lib/pipeline/resolve/types";
import { ENRICHMENT_ONLY_SOURCE_TYPES } from "@/lib/config/discovery";
import { phoneticKey } from "@/lib/util/text";
import { parseName } from "@/lib/util/names";

/**
 * Directory enrichment.
 *
 * Only candidates that passed the discovery threshold reach this stage. For
 * each one, the directory is searched for a matching person using the same
 * entity-resolution scoring that merged their records in the first place --
 * so a directory match is held to the same standard as any other identity
 * claim, and a weak match is reported as ambiguous rather than accepted.
 *
 * The directory page itself is fetched once per run and cached in memory. It
 * is never stored as raw records, because storing it would amount to
 * ingesting the entire student body through the back door.
 */

/** Fields the directory may contribute. Deliberately narrow. */
export interface EnrichmentFields {
  email?: string;
  major?: string;
  graduationYear?: number;
}

export type EnrichmentOutcomeKind =
  | "MATCHED"
  | "NO_MATCH"
  | "AMBIGUOUS"
  | "SOURCE_UNAVAILABLE"
  | "ERROR";

export interface EnrichmentAttempt {
  outcome: EnrichmentOutcomeKind;
  matchConfidence: number | null;
  matchedName: string | null;
  fields: EnrichmentFields;
  matchingFactors: Array<{ label: string; detail?: string }>;
  conflictingFactors: Array<{ label: string; detail?: string }>;
  sourceUrl: string | null;
  message: string;
}

/** A directory entry, in the shape entity resolution compares. */
interface DirectoryEntry extends ResolvableRecord {
  email: string | null;
  major: string | null;
  graduationYear: number | null;
}

export interface DirectoryIndex {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  entries: DirectoryEntry[];
  /** Entries keyed by phonetic surname, for fast lookup. */
  byPhonetic: Map<string, DirectoryEntry[]>;
}

/** Confidence at or above which a directory match is accepted. */
export const DIRECTORY_MATCH_THRESHOLD = 0.85;
/** How close the runner-up may be before the match is called ambiguous. */
export const AMBIGUITY_MARGIN = 0.08;

/**
 * Loads and indexes a university's enrichment sources.
 *
 * Returns an empty array when the university publishes no directory. That is
 * a completely normal outcome -- plenty of universities do not -- and it is
 * reported as "no enrichment source available", not as a failure.
 */
export async function loadDirectories(
  prisma: PrismaClient,
  universityId: string,
  universitySlug: string,
  isDemo: boolean,
): Promise<{ directories: DirectoryIndex[]; problems: string[] }> {
  const sources = await prisma.universitySource.findMany({
    where: {
      universityId,
      active: true,
      status: { in: ["VALIDATED", "ACTIVE"] },
      sourceType: { in: [...ENRICHMENT_ONLY_SOURCE_TYPES] },
    },
  });

  const directories: DirectoryIndex[] = [];
  const problems: string[] = [];

  for (const source of sources) {
    const fetched = await fetchSourceContent(source, universitySlug, isDemo);
    if (!fetched.ok) {
      problems.push(`${source.name}: ${fetched.error.message}`);
      continue;
    }

    const outcome = extract(
      {
        url: fetched.value.finalUrl,
        body: fetched.value.body,
        contentType: fetched.value.contentType,
        sourceType: source.sourceType,
      },
      source.parserType,
    );

    if (outcome.records.length === 0) {
      problems.push(`${source.name}: no directory entries could be read from the page.`);
      continue;
    }

    const entries: DirectoryEntry[] = [];
    for (const record of outcome.records) {
      const normalized = normalizeRecord({
        rawName: record.name,
        rawOrganization: record.organization ?? null,
        rawRole: record.role ?? null,
        rawMajor: record.major ?? null,
        rawYear: record.year ?? null,
        rawSport: record.sport ?? null,
      });
      if (!normalized) continue;

      const parsed = parseName(record.name);

      entries.push({
        id: `${source.id}:${entries.length}`,
        normalizedName: normalized.normalizedName,
        firstName: normalized.firstName ?? null,
        middleInitial: normalized.middleInitial ?? null,
        lastName: normalized.lastName ?? null,
        suffix: normalized.suffix ?? null,
        nameKey: normalized.nameKey,
        lastNamePhonetic: parsed.last ? phoneticKey(parsed.last) : null,
        organizationCanonical: null,
        sportCanonical: null,
        majorCanonical: normalized.majorCanonical ?? null,
        graduationYear: normalized.graduationYear ?? null,
        email: record.email?.toLowerCase() ?? null,
        sourceId: source.id,
        major: normalized.majorCanonical ?? null,
      });
    }

    const byPhonetic = new Map<string, DirectoryEntry[]>();
    for (const entry of entries) {
      const key = entry.lastNamePhonetic ?? "";
      const list = byPhonetic.get(key);
      if (list) list.push(entry);
      else byPhonetic.set(key, [entry]);
    }

    directories.push({
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      entries,
      byPhonetic,
    });
  }

  return { directories, problems };
}

/** The candidate side of a directory comparison. */
export interface EnrichableCandidate {
  id: string;
  canonicalName: string;
  firstName: string | null;
  middleInitial: string | null;
  lastName: string | null;
  major: string | null;
  graduationYear: number | null;
  email: string | null;
}

export function enrichCandidate(
  candidate: EnrichableCandidate,
  directory: DirectoryIndex,
): EnrichmentAttempt {
  const phonetic = candidate.lastName ? phoneticKey(candidate.lastName) : "";
  const pool = directory.byPhonetic.get(phonetic) ?? [];

  if (pool.length === 0) {
    return {
      outcome: "NO_MATCH",
      matchConfidence: null,
      matchedName: null,
      fields: {},
      matchingFactors: [],
      conflictingFactors: [],
      sourceUrl: directory.sourceUrl,
      message: `No entry with a comparable surname was found in ${directory.sourceName}.`,
    };
  }

  const candidateRecord: ResolvableRecord = {
    id: candidate.id,
    normalizedName: candidate.canonicalName,
    firstName: candidate.firstName,
    middleInitial: candidate.middleInitial,
    lastName: candidate.lastName,
    suffix: null,
    nameKey: "",
    lastNamePhonetic: phonetic,
    organizationCanonical: null,
    sportCanonical: null,
    majorCanonical: candidate.major,
    graduationYear: candidate.graduationYear,
    email: candidate.email,
    sourceId: "candidate",
  };

  const frequency = buildSurnameFrequency(directory.entries);

  const scored = pool
    .map((entry) => ({ entry, result: scorePair(candidateRecord, entry, frequency) }))
    .sort((a, b) => b.result.matchScore - a.result.matchScore);

  const best = scored[0];
  if (!best || best.result.confidence < DIRECTORY_MATCH_THRESHOLD - 0.25) {
    return {
      outcome: "NO_MATCH",
      matchConfidence: best?.result.confidence ?? null,
      matchedName: null,
      fields: {},
      matchingFactors: [],
      conflictingFactors: best?.result.conflictingFactors.map((f) => ({ label: f.label, detail: f.detail })) ?? [],
      sourceUrl: directory.sourceUrl,
      message: `The closest entry in ${directory.sourceName} scored ${Math.round((best?.result.confidence ?? 0) * 100)}%, which is too low to accept.`,
    };
  }

  const runnerUp = scored[1];
  const isAmbiguous =
    runnerUp !== undefined &&
    best.result.confidence - runnerUp.result.confidence < AMBIGUITY_MARGIN &&
    runnerUp.result.confidence >= DIRECTORY_MATCH_THRESHOLD - 0.15;

  if (isAmbiguous) {
    // Two directory entries fit about equally well. Guessing would silently
    // attach the wrong person's contact details, so this goes to a human.
    return {
      outcome: "AMBIGUOUS",
      matchConfidence: best.result.confidence,
      matchedName: best.entry.normalizedName,
      fields: {},
      matchingFactors: best.result.matchingFactors.map((f) => ({ label: f.label, detail: f.detail })),
      conflictingFactors: best.result.conflictingFactors.map((f) => ({ label: f.label, detail: f.detail })),
      sourceUrl: directory.sourceUrl,
      message: `Two directory entries matched almost equally well (${Math.round(best.result.confidence * 100)}% and ${Math.round(runnerUp!.result.confidence * 100)}%). Left for manual review rather than guessing.`,
    };
  }

  if (best.result.confidence < DIRECTORY_MATCH_THRESHOLD) {
    return {
      outcome: "AMBIGUOUS",
      matchConfidence: best.result.confidence,
      matchedName: best.entry.normalizedName,
      fields: {},
      matchingFactors: best.result.matchingFactors.map((f) => ({ label: f.label, detail: f.detail })),
      conflictingFactors: best.result.conflictingFactors.map((f) => ({ label: f.label, detail: f.detail })),
      sourceUrl: directory.sourceUrl,
      message: `The best directory match scored ${Math.round(best.result.confidence * 100)}%, below the ${Math.round(DIRECTORY_MATCH_THRESHOLD * 100)}% needed to accept it automatically.`,
    };
  }

  // Only non-sensitive fields the directory actually published.
  const fields: EnrichmentFields = {};
  if (best.entry.email) fields.email = best.entry.email;
  if (best.entry.major) fields.major = best.entry.major;
  if (best.entry.graduationYear) fields.graduationYear = best.entry.graduationYear;

  return {
    outcome: "MATCHED",
    matchConfidence: best.result.confidence,
    matchedName: best.entry.normalizedName,
    fields,
    matchingFactors: best.result.matchingFactors.map((f) => ({ label: f.label, detail: f.detail })),
    conflictingFactors: best.result.conflictingFactors.map((f) => ({ label: f.label, detail: f.detail })),
    sourceUrl: directory.sourceUrl,
    message: `Matched ${best.entry.normalizedName} in ${directory.sourceName} at ${Math.round(best.result.confidence * 100)}% confidence.`,
  };
}
