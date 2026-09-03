import type { PrismaClient } from "@prisma/client";
import { fetchSourceContent } from "@/lib/pipeline/transport";
import { extract } from "@/lib/pipeline/extract/registry";
import { normalizeRecord } from "@/lib/pipeline/normalize";
import { ENRICHMENT_ONLY_SOURCE_TYPES } from "@/lib/config/discovery";
import type { DirectoryEntry, DirectoryIndex } from "@/lib/pipeline/enrich/types";
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


export * from "@/lib/pipeline/enrich/types";
export {
  AMBIGUITY_MARGIN,
  DIRECTORY_MATCH_THRESHOLD,
  enrichCandidate,
  type EnrichableCandidate,
} from "@/lib/pipeline/enrich/match";
