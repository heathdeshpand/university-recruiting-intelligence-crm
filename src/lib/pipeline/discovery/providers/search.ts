import type { SourceType } from "@prisma/client";
import { env, searchApiConfigured } from "@/lib/env";
import { DISCOVERY_CATEGORIES } from "@/lib/config/discovery";
import { classifyUrl } from "@/lib/pipeline/discovery/classifier";
import type {
  DiscoveredUrl,
  DiscoveryProvider,
  DiscoveryProviderResult,
  DiscoveryTarget,
} from "@/lib/pipeline/discovery/providers/types";
import { attempt } from "@/lib/util/result";

/**
 * Search-API-backed discovery.
 *
 * Entirely optional. With no SEARCH_API_KEY set this provider reports itself
 * unavailable and the crawler handles everything, which is the supported
 * default. When a key is present, a site-scoped query per category is a much
 * cheaper way to find a university's roster pages than crawling to them.
 *
 * Results are still classified and still validated. A search engine saying a
 * page is about Greek life is a hint, not a decision.
 */

interface SearchHit {
  url: string;
  title: string;
  description?: string;
}

async function braveSearch(query: string, count: number): Promise<SearchHit[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));

  const res = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": env.SEARCH_API_KEY },
  });
  if (!res.ok) throw new Error(`Search API returned HTTP ${res.status}.`);

  const body = (await res.json()) as {
    web?: { results?: Array<{ url?: string; title?: string; description?: string }> };
  };

  return (body.web?.results ?? [])
    .filter((r): r is { url: string; title: string; description?: string } => Boolean(r.url))
    .map((r) => ({ url: r.url, title: r.title ?? "", description: r.description }));
}

async function serpApiSearch(query: string, count: number): Promise<SearchHit[]> {
  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(count));
  url.searchParams.set("api_key", env.SEARCH_API_KEY);
  url.searchParams.set("engine", "google");

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Search API returned HTTP ${res.status}.`);

  const body = (await res.json()) as {
    organic_results?: Array<{ link?: string; title?: string; snippet?: string }>;
  };

  return (body.organic_results ?? [])
    .filter((r): r is { link: string; title: string; snippet?: string } => Boolean(r.link))
    .map((r) => ({ url: r.link, title: r.title ?? "", description: r.snippet }));
}

async function runSearch(query: string, count: number): Promise<SearchHit[]> {
  switch (env.SEARCH_PROVIDER) {
    case "brave":
      return braveSearch(query, count);
    case "serpapi":
      return serpApiSearch(query, count);
    default:
      return [];
  }
}

export const searchDiscoveryProvider: DiscoveryProvider = {
  name: "Search API",
  description:
    "Runs one site-scoped search per discovery category. Optional; requires SEARCH_PROVIDER and SEARCH_API_KEY to be configured.",

  isAvailable(target: DiscoveryTarget) {
    return !target.isDemo && searchApiConfigured && env.ENABLE_LIVE_NETWORK && target.domains.length > 0;
  },

  async discover(target, report, shouldStop): Promise<DiscoveryProviderResult> {
    const candidates = new Map<string, DiscoveredUrl>();
    const notes: string[] = [];
    let queries = 0;

    const primaryDomain = target.domains[0]!;

    for (const category of DISCOVERY_CATEGORIES) {
      if (await shouldStop()) break;

      const terms = category.titleKeywords.slice(0, 2).join(" OR ");
      const query = `site:${primaryDomain} (${terms})`;

      const result = await attempt(() => runSearch(query, 10));
      queries += 1;

      if (!result.ok) {
        // A failing search provider must not take the run down; the crawler
        // still runs and will cover the same ground more slowly.
        notes.push(`Search for ${category.label} failed: ${result.error}`);
        continue;
      }

      for (const hit of result.value) {
        const classification = classifyUrl({
          url: hit.url,
          title: hit.title,
          text: hit.description,
        });
        if (classification.sourceType === "UNKNOWN") continue;

        const existing = candidates.get(hit.url);
        if (existing && existing.confidence >= classification.confidence) continue;

        candidates.set(hit.url, {
          url: hit.url,
          label: hit.title,
          sourceType: classification.sourceType,
          confidence: classification.confidence,
          discoveryMethod: "SEARCH_API",
          notes: `Found by search for "${query}". ${classification.notes}`,
        });
      }
    }

    await report(`Ran ${queries} site-scoped searches and found ${candidates.size} candidate pages.`);

    const foundTypes = new Set<SourceType>([...candidates.values()].map((c) => c.sourceType));
    return {
      urls: [...candidates.values()],
      categoriesNotFound: DISCOVERY_CATEGORIES.map((c) => c.sourceType).filter(
        (t) => !foundTypes.has(t),
      ),
      pagesFetched: 0,
      notes,
    };
  },
};
