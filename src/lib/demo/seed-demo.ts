import type { PrismaClient } from "@prisma/client";
import { buildDemoUniversities } from "@/lib/demo/fixtures";

/**
 * Registers the demo universities and their sources.
 *
 * Sources are created in DISCOVERED/VALIDATED state with the demo fixture
 * access method. Nothing downstream of that is seeded: candidates, evidence,
 * signals and scores only exist once the pipeline actually runs. That keeps
 * the demo honest -- what you see in the CRM was produced by the same code
 * that would process a real university.
 */

export interface DemoSeedSummary {
  slug: string;
  name: string;
  sourceCount: number;
  notFound: number;
}

export async function seedDemoUniversities(prisma: PrismaClient): Promise<DemoSeedSummary[]> {
  const fixtures = buildDemoUniversities();
  const summaries: DemoSeedSummary[] = [];

  for (const fixture of fixtures) {
    const university = await prisma.university.upsert({
      where: { slug: fixture.slug },
      update: {
        name: fixture.name,
        shortName: fixture.shortName,
        athleticName: fixture.athleticName ?? null,
        aliases: fixture.aliases,
        city: fixture.city,
        state: fixture.state,
        isDemo: true,
      },
      create: {
        slug: fixture.slug,
        name: fixture.name,
        shortName: fixture.shortName,
        athleticName: fixture.athleticName ?? null,
        aliases: fixture.aliases,
        city: fixture.city,
        state: fixture.state,
        country: "US",
        isDemo: true,
        notes: "Synthetic demo university. Every person, source and score under it is fictional.",
      },
    });

    await prisma.universityDomain.upsert({
      where: { universityId_domain: { universityId: university.id, domain: fixture.domain } },
      update: { isPrimary: true },
      create: { universityId: university.id, domain: fixture.domain, isPrimary: true },
    });

    let notFound = 0;

    for (const source of fixture.sources) {
      const url = `https://${fixture.domain}${source.urlPath}`;
      if (source.notFound) notFound += 1;

      await prisma.universitySource.upsert({
        where: { universityId_url: { universityId: university.id, url } },
        update: {
          name: source.name,
          description: source.description,
          sourceType: source.sourceType,
          parserType: source.parserType,
          accessMethod: source.accessMethod,
          status: source.notFound ? "UNAVAILABLE" : "VALIDATED",
          confidence: source.notFound ? 0 : 0.95,
          active: !source.notFound,
        },
        create: {
          universityId: university.id,
          url,
          domain: fixture.domain,
          name: source.name,
          description: source.description,
          sourceType: source.sourceType,
          parserType: source.parserType,
          accessMethod: source.accessMethod,
          discoveryMethod: "DEMO_FIXTURE",
          status: source.notFound ? "UNAVAILABLE" : "VALIDATED",
          confidence: source.notFound ? 0 : 0.95,
          active: !source.notFound,
          classifierNotes: source.notFound
            ? "Discovery searched for this category and found no page containing extractable records."
            : "Registered from the demo fixture set.",
          lastDiscoveredAt: new Date(),
          lastValidatedAt: source.notFound ? null : new Date(),
        },
      });
    }

    summaries.push({
      slug: fixture.slug,
      name: fixture.name,
      sourceCount: fixture.sources.length,
      notFound,
    });
  }

  return summaries;
}

/** Deletes every demo university. Cascades remove all data beneath them. */
export async function deleteDemoData(prisma: PrismaClient): Promise<{ universities: number }> {
  const { count } = await prisma.university.deleteMany({ where: { isDemo: true } });
  return { universities: count };
}
