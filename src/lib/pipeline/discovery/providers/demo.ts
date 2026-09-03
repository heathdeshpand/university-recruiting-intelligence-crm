import { demoUniversity } from "@/lib/demo/fixtures";
import type { DiscoveryProvider, DiscoveryProviderResult } from "@/lib/pipeline/discovery/providers/types";
import { DISCOVERY_CATEGORIES } from "@/lib/config/discovery";

/**
 * Demo discovery.
 *
 * Returns the fixture set's URLs as though they had been found on the web,
 * including the categories the fixture university deliberately does not
 * publish. Those come back as "not found" so the demo exercises the same
 * missing-category handling a real university would trigger.
 */
export const demoDiscoveryProvider: DiscoveryProvider = {
  name: "Demo fixtures",
  description:
    "Serves the synthetic demo university's sources without contacting any real website.",

  isAvailable(target) {
    return target.isDemo && demoUniversity(target.universitySlug) !== undefined;
  },

  async discover(target, report): Promise<DiscoveryProviderResult> {
    const fixture = demoUniversity(target.universitySlug);
    if (!fixture) {
      return { urls: [], categoriesNotFound: [], pagesFetched: 0, notes: [] };
    }

    await report(
      `Demo mode: reading ${fixture.sources.length} fixture sources for ${fixture.name}. No network requests are made.`,
    );

    const urls = fixture.sources
      .filter((s) => !s.notFound)
      .map((s) => ({
        url: `https://${fixture.domain}${s.urlPath}`,
        label: s.name,
        sourceType: s.sourceType,
        confidence: 0.95,
        discoveryMethod: "DEMO_FIXTURE" as const,
        notes: s.description,
      }));

    const publishedTypes = new Set(fixture.sources.map((s) => s.sourceType));
    const explicitlyMissing = fixture.sources.filter((s) => s.notFound).map((s) => s.sourceType);

    // Categories the fixture set never mentions are also "searched and not
    // found" -- a university simply not having them is the normal case.
    const impliedMissing = DISCOVERY_CATEGORIES.map((c) => c.sourceType).filter(
      (t) => !publishedTypes.has(t),
    );

    return {
      urls,
      categoriesNotFound: [...new Set([...explicitlyMissing, ...impliedMissing])],
      pagesFetched: 0,
      notes: [
        "Discovery ran against the synthetic fixture set. Nothing on the public internet was contacted.",
      ],
    };
  },
};
