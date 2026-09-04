import type { PrismaClient, SourceType } from "@prisma/client";
import { categoryFor, DISCOVERY_CATEGORIES } from "@/lib/config/discovery";
import { demoDiscoveryProvider } from "@/lib/pipeline/discovery/providers/demo";
import { crawlDiscoveryProvider } from "@/lib/pipeline/discovery/providers/crawl";
import { searchDiscoveryProvider } from "@/lib/pipeline/discovery/providers/search";
import type {
  DiscoveredUrl,
  DiscoveryProvider,
  DiscoveryProgress,
  DiscoveryTarget,
} from "@/lib/pipeline/discovery/providers/types";
import { env } from "@/lib/env";

/**
 * Source discovery orchestration.
 *
 * Runs every available provider, merges what they propose, and writes the
 * result into the source registry.
 *
 * The important behaviour here is what happens to categories nothing was
 * found for. They are recorded as UNAVAILABLE sources with an explanation,
 * not omitted. That distinction is the difference between "this university
 * does not publish club sport rosters" and "we never looked", and the whole
 * product depends on being able to tell a recruiter which one it is.
 */

const PROVIDERS: DiscoveryProvider[] = [
  demoDiscoveryProvider,
  searchDiscoveryProvider,
  crawlDiscoveryProvider,
];

export interface DiscoveryRunResult {
  sourcesCreated: number;
  sourcesUpdated: number;
  categoriesNotFound: number;
  pagesFetched: number;
  providersUsed: string[];
  notes: string[];
}

export async function runSourceDiscovery(
  prisma: PrismaClient,
  target: DiscoveryTarget,
  report: DiscoveryProgress,
  shouldStop: () => Promise<boolean>,
): Promise<DiscoveryRunResult> {
  const available = PROVIDERS.filter((p) => p.isAvailable(target));

  if (available.length === 0) {
    const reason = target.isDemo
      ? "No demo fixture set exists for this university."
      : env.ENABLE_LIVE_NETWORK
        ? "No discovery provider is configured for this university. Check that it has at least one domain."
        : "Live network access is disabled, so no real website can be contacted. Set ENABLE_LIVE_NETWORK=true in .env to run discovery against a real university, or use a demo university to see the pipeline work end to end.";
    throw new Error(reason);
  }

  const merged = new Map<string, DiscoveredUrl>();
  const notFoundVotes = new Map<SourceType, number>();
  const notes: string[] = [];
  let pagesFetched = 0;

  for (const provider of available) {
    if (await shouldStop()) break;
    await report(`Running discovery provider: ${provider.name}.`);

    const result = await provider.discover(target, report, shouldStop);
    pagesFetched += result.pagesFetched;
    notes.push(...result.notes);

    for (const url of result.urls) {
      const existing = merged.get(url.url);
      // When two providers propose the same URL, keep the more confident
      // classification rather than whichever ran last.
      if (!existing || existing.confidence < url.confidence) merged.set(url.url, url);
    }

    for (const type of result.categoriesNotFound) {
      notFoundVotes.set(type, (notFoundVotes.get(type) ?? 0) + 1);
    }
  }

  // A category counts as not found only if every provider that ran agreed.
  const categoriesNotFound = [...notFoundVotes.entries()]
    .filter(([type, votes]) => votes === available.length && ![...merged.values()].some((u) => u.sourceType === type))
    .map(([type]) => type);

  let sourcesCreated = 0;
  let sourcesUpdated = 0;

  for (const discovered of merged.values()) {
    let domain: string;
    try {
      domain = new URL(discovered.url).host;
    } catch {
      continue;
    }

    const category = categoryFor(discovered.sourceType);

    const existing = await prisma.universitySource.findUnique({
      where: { universityId_url: { universityId: target.universityId, url: discovered.url } },
      select: { id: true, status: true, parserType: true },
    });

    if (existing) {
      await prisma.universitySource.update({
        where: { id: existing.id },
        data: {
          sourceType: discovered.sourceType,
          confidence: discovered.confidence,
          classifierNotes: discovered.notes,
          lastDiscoveredAt: new Date(),
          // Re-discovery must not undo a human's correction or reactivate a
          // source someone deliberately disabled.
          ...(existing.status === "DISABLED" || existing.status === "ACTIVE"
            ? {}
            : { status: "DISCOVERED" as const }),
        },
      });
      sourcesUpdated += 1;
      continue;
    }

    await prisma.universitySource.create({
      data: {
        universityId: target.universityId,
        url: discovered.url,
        domain,
        name: discovered.label?.slice(0, 200) || category?.label || "Discovered source",
        description: discovered.notes.slice(0, 1000),
        sourceType: discovered.sourceType,
        parserType: category?.preferredParser ?? "GENERIC_HTML",
        accessMethod: target.isDemo ? "DEMO_FIXTURE" : "PUBLIC_HTML",
        discoveryMethod: discovered.discoveryMethod,
        status: "DISCOVERED",
        confidence: discovered.confidence,
        classifierNotes: discovered.notes,
        lastDiscoveredAt: new Date(),
      },
    });
    sourcesCreated += 1;
  }

  // Record the categories that were searched for and not found, so the UI can
  // distinguish "not published" from "not looked for".
  //
  // A category already represented by a source -- whether a working one or an
  // existing "not found" marker -- is skipped, so re-running discovery cannot
  // accumulate duplicate placeholders for the same category.
  const alreadyRepresented = new Set(
    (
      await prisma.universitySource.findMany({
        where: { universityId: target.universityId },
        select: { sourceType: true },
        distinct: ["sourceType"],
      })
    ).map((s) => s.sourceType),
  );

  for (const type of categoriesNotFound) {
    if (alreadyRepresented.has(type)) continue;

    const category = DISCOVERY_CATEGORIES.find((c) => c.sourceType === type);
    if (!category) continue;

    const placeholderUrl = `about:not-found/${type.toLowerCase()}`;

    await prisma.universitySource.upsert({
      where: { universityId_url: { universityId: target.universityId, url: placeholderUrl } },
      update: { lastDiscoveredAt: new Date() },
      create: {
        universityId: target.universityId,
        url: placeholderUrl,
        domain: target.domains[0] ?? "",
        name: category.label,
        description: `Discovery searched for ${category.label} and did not find a page containing extractable records. This means the university does not appear to publish this data publicly. It does not mean its students have no involvement of this kind.`,
        sourceType: type,
        parserType: "NONE",
        accessMethod: "UNAVAILABLE",
        discoveryMethod: target.isDemo ? "DEMO_FIXTURE" : "PATH_HEURISTIC",
        status: "UNAVAILABLE",
        confidence: 0,
        active: false,
        classifierNotes: "Searched, not found.",
        lastDiscoveredAt: new Date(),
      },
    });
  }

  return {
    sourcesCreated,
    sourcesUpdated,
    categoriesNotFound: categoriesNotFound.length,
    pagesFetched,
    providersUsed: available.map((p) => p.name),
    notes,
  };
}

export { PROVIDERS as DISCOVERY_PROVIDERS };
