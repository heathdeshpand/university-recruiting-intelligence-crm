import { runSourceDiscovery } from "@/lib/pipeline/discovery";
import { recordAudit } from "@/lib/api/audit";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * Searches a university's public web presence for pages that might contain
 * student records, and writes them into the source registry.
 */
export const sourceDiscoveryHandler: JobHandler = async (ctx) => {
  const university = await ctx.prisma.university.findUnique({
    where: { id: ctx.universityId },
    include: { domains: { orderBy: [{ isPrimary: "desc" }, { domain: "asc" }] } },
  });

  if (!university) throw new Error("The university no longer exists.");
  if (university.domains.length === 0) {
    throw new Error(
      "This university has no domains configured, so there is nothing to search. Add at least one domain first.",
    );
  }

  await ctx.setTotal(100);
  await ctx.setProgress(5, "Preparing discovery");

  const result = await runSourceDiscovery(
    ctx.prisma,
    {
      universityId: university.id,
      universitySlug: university.slug,
      name: university.name,
      shortName: university.shortName,
      athleticName: university.athleticName,
      aliases: university.aliases,
      domains: university.domains.map((d) => d.domain),
      isDemo: university.isDemo,
    },
    async (message, meta) => {
      await ctx.log("info", message, meta);
    },
    () => ctx.isCancelled(),
  );

  await ctx.setProgress(100, "Discovery complete");

  for (const note of result.notes) {
    await ctx.log("info", note);
  }

  await recordAudit({
    action: "source.discovered",
    entityType: "university",
    entityId: university.id,
    universityId: university.id,
    summary: `Discovery registered ${result.sourcesCreated} new source(s) for ${university.name}`,
    metadata: {
      created: result.sourcesCreated,
      updated: result.sourcesUpdated,
      notFound: result.categoriesNotFound,
      providers: result.providersUsed,
    },
  });

  const summary =
    result.sourcesCreated + result.sourcesUpdated === 0
      ? `Found no candidate sources. ${result.categoriesNotFound} categories were searched and not found.`
      : `Registered ${result.sourcesCreated} new and refreshed ${result.sourcesUpdated} existing source(s). ${result.categoriesNotFound} categories were searched and not found.`;

  return {
    summary,
    stats: {
      sourcesCreated: result.sourcesCreated,
      sourcesUpdated: result.sourcesUpdated,
      categoriesNotFound: result.categoriesNotFound,
      pagesFetched: result.pagesFetched,
      providers: result.providersUsed.join(", "),
    },
  };
};
