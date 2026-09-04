import * as cheerio from "cheerio";
import type { SourceType } from "@prisma/client";
import { env } from "@/lib/env";
import { politeFetch } from "@/lib/pipeline/http";
import { normalizeWhitespace } from "@/lib/util/text";
import {
  CRAWL_EXCLUDE_PATTERNS,
  DISCOVERY_CATEGORIES,
  SEED_PATHS,
} from "@/lib/config/discovery";
import { classifyUrl, crawlPriority, isPlausibleDiscoveryTarget } from "@/lib/pipeline/discovery/classifier";
import { contentFingerprint, loadHtml } from "@/lib/pipeline/extract/dom";
import type {
  DiscoveredUrl,
  DiscoveryProvider,
  DiscoveryProviderResult,
  DiscoveryTarget,
} from "@/lib/pipeline/discovery/providers/types";

/**
 * Crawl-based source discovery.
 *
 * The default provider, and the one that needs no API key. It works in three
 * passes, cheapest first:
 *
 *   1. Seed paths      -- a short list of well-formed guesses like
 *                         /greek-life and /clubsports. A 404 costs almost
 *                         nothing and a hit saves a whole crawl.
 *   2. Sitemaps        -- if the university publishes one, it is by far the
 *                         highest-quality source of URLs available.
 *   3. Priority crawl  -- a bounded breadth-first crawl whose frontier is
 *                         ordered by how much a link looks like it leads to
 *                         records.
 *
 * Hard limits: it never leaves the university's own domains, never exceeds
 * DISCOVERY_MAX_PAGES fetches, and never goes deeper than DISCOVERY_MAX_DEPTH
 * from a seed. Every request goes through the polite HTTP client, so
 * robots.txt and per-host delays apply throughout.
 */

interface FrontierEntry {
  url: string;
  depth: number;
  label: string;
  priority: number;
}

/** True when `host` is one of the university's domains or a subdomain of one. */
function isOwnDomain(host: string, domains: string[]): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return domains.some((d) => h === d || h.endsWith(`.${d}`));
}

function normalizeUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    url.hash = "";
    // Trailing slashes and index pages are the same page; collapsing them
    // stops the crawler spending its budget on duplicates.
    url.pathname = url.pathname.replace(/\/index\.(html?|php|aspx)$/i, "/").replace(/\/{2,}/g, "/");
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchSitemapUrls(origin: string, limit: number): Promise<string[]> {
  const found: string[] = [];
  const queue = [`${origin}/sitemap.xml`];
  const seen = new Set<string>();

  while (queue.length > 0 && found.length < limit) {
    const sitemapUrl = queue.shift()!;
    if (seen.has(sitemapUrl)) continue;
    seen.add(sitemapUrl);

    const result = await politeFetch(sitemapUrl, { accept: "application/xml,text/xml" });
    if (!result.ok) continue;

    const $ = cheerio.load(result.value.body, { xmlMode: true });

    // A sitemap index points at further sitemaps; follow a couple of them.
    $("sitemap > loc").each((_, el) => {
      const loc = normalizeWhitespace($(el).text());
      if (loc && seen.size + queue.length < 5) queue.push(loc);
    });

    $("url > loc").each((_, el) => {
      const loc = normalizeWhitespace($(el).text());
      if (loc && found.length < limit) found.push(loc);
    });
  }

  return found;
}

export const crawlDiscoveryProvider: DiscoveryProvider = {
  name: "Domain crawler",
  description:
    "Tries common paths, reads the sitemap, then runs a bounded, robots-aware crawl of the university's own domains, ranking links by how likely they are to lead to records.",

  isAvailable(target: DiscoveryTarget) {
    return !target.isDemo && target.domains.length > 0 && env.ENABLE_LIVE_NETWORK;
  },

  async discover(target, report, shouldStop): Promise<DiscoveryProviderResult> {
    const maxPages = env.DISCOVERY_MAX_PAGES;
    const maxDepth = env.DISCOVERY_MAX_DEPTH;

    const visited = new Set<string>();
    const candidates = new Map<string, DiscoveredUrl>();
    const notes: string[] = [];
    let pagesFetched = 0;

    // Content fingerprints already seen, so the same page reached by several
    // URLs is registered once.
    const seenContent = new Map<string, string>();

    /**
     * Fingerprints of each domain's soft 404.
     *
     * Many university sites answer any unknown path with their homepage and a
     * 200 status. Without this, every guessed path "succeeds", and the same
     * navigation menu is discovered as a dozen separate sources. Probing one
     * deliberately absent URL per domain gives us the shape to ignore.
     */
    const softNotFound = new Map<string, string>();

    for (const domain of target.domains) {
      const probe = `https://${domain}/__does-not-exist-${Date.now().toString(36)}`;
      const result = await politeFetch(probe);
      if (result.ok && result.value.contentType.includes("html")) {
        softNotFound.set(domain, contentFingerprint(loadHtml(result.value.body)));
        await report(
          `${domain} answers unknown paths with a page instead of a 404, so identical pages will be ignored.`,
        );
      }
    }

    const frontier: FrontierEntry[] = [];

    const enqueue = (rawUrl: string, depth: number, label: string) => {
      const normalized = normalizeUrl(rawUrl, `https://${target.domains[0]}`);
      if (!normalized) return;
      if (visited.has(normalized)) return;
      if (frontier.some((f) => f.url === normalized)) return;

      let parsed: URL;
      try {
        parsed = new URL(normalized);
      } catch {
        return;
      }

      if (!isOwnDomain(parsed.host, target.domains)) return;
      if (!isPlausibleDiscoveryTarget(normalized, CRAWL_EXCLUDE_PATTERNS)) return;

      frontier.push({ url: normalized, depth, label, priority: crawlPriority(normalized, label) });
    };

    // --- Pass 1: seed paths -------------------------------------------------
    for (const domain of target.domains) {
      for (const path of SEED_PATHS) {
        if (path === "/sitemap.xml") continue;
        enqueue(`https://${domain}${path}`, 0, "");
      }
      for (const category of DISCOVERY_CATEGORIES) {
        for (const hint of category.pathHints.slice(0, 3)) {
          enqueue(`https://${domain}/${hint}`, 0, category.label);
        }
      }
    }
    await report(`Queued ${frontier.length} seed paths across ${target.domains.length} domain(s).`);

    // --- Pass 2: sitemaps ---------------------------------------------------
    for (const domain of target.domains) {
      if (await shouldStop()) break;
      const sitemapUrls = await fetchSitemapUrls(`https://${domain}`, 400);
      if (sitemapUrls.length > 0) {
        await report(`Read ${sitemapUrls.length} URLs from ${domain}'s sitemap.`);
        notes.push(`${domain} publishes a sitemap; ${sitemapUrls.length} URLs were considered.`);
        for (const url of sitemapUrls) enqueue(url, 0, "");
      }
    }

    // --- Pass 3: bounded priority crawl ------------------------------------
    while (frontier.length > 0 && pagesFetched < maxPages) {
      if (await shouldStop()) {
        notes.push("Discovery stopped early because the job was cancelled.");
        break;
      }

      // Highest-priority link first; ties broken by shallower depth.
      frontier.sort((a, b) => b.priority - a.priority || a.depth - b.depth);
      const entry = frontier.shift()!;
      if (visited.has(entry.url)) continue;
      visited.add(entry.url);

      const result = await politeFetch(entry.url);
      pagesFetched += 1;

      if (!result.ok) {
        // A dead link, a redirect loop or a robots refusal is ordinary during
        // discovery. Record it only if it is interesting, and carry on.
        if (result.error.kind === "robots_disallowed") {
          notes.push(result.error.message);
        }
        continue;
      }

      const page = result.value;
      if (!page.contentType.includes("html") && !page.contentType.includes("json")) continue;

      const $ = cheerio.load(page.body);
      const title = normalizeWhitespace($("title").first().text());
      const bodyText = normalizeWhitespace($("body").text()).slice(0, 20_000);

      const fingerprint = contentFingerprint($);

      // A soft 404: the path does not exist, whatever the status code said.
      const host = new URL(page.finalUrl).host.replace(/^www\./, "");
      const softFingerprint =
        softNotFound.get(host) ?? softNotFound.get(host.split(".").slice(-2).join("."));
      if (softFingerprint && softFingerprint === fingerprint) continue;

      // The same page reached by a different URL.
      const firstSeenAt = seenContent.get(fingerprint);
      if (firstSeenAt && firstSeenAt !== page.finalUrl) continue;
      seenContent.set(fingerprint, page.finalUrl);

      const classification = classifyUrl({
        url: page.finalUrl,
        linkText: entry.label,
        title,
        text: bodyText,
      });

      if (classification.sourceType !== "UNKNOWN" && classification.confidence >= 0.3) {
        const existing = candidates.get(page.finalUrl);
        if (!existing || existing.confidence < classification.confidence) {
          candidates.set(page.finalUrl, {
            url: page.finalUrl,
            label: title || entry.label,
            sourceType: classification.sourceType,
            confidence: classification.confidence,
            discoveryMethod: entry.depth === 0 ? "PATH_HEURISTIC" : "LINK_CRAWL",
            notes: classification.notes,
          });
        }
      }

      if (entry.depth < maxDepth) {
        $("a[href]").each((_, el) => {
          const href = $(el).attr("href");
          if (!href) return;
          enqueue(href, entry.depth + 1, normalizeWhitespace($(el).text()).slice(0, 120));
        });
      }

      if (pagesFetched % 10 === 0) {
        await report(
          `Fetched ${pagesFetched}/${maxPages} pages; ${candidates.size} candidate sources so far.`,
        );
      }
    }

    if (pagesFetched >= maxPages) {
      notes.push(
        `Discovery stopped at its budget of ${maxPages} pages. Raise DISCOVERY_MAX_PAGES to search further.`,
      );
    }

    const foundTypes = new Set<SourceType>([...candidates.values()].map((c) => c.sourceType));
    const categoriesNotFound = DISCOVERY_CATEGORIES.map((c) => c.sourceType).filter(
      (t) => !foundTypes.has(t),
    );

    return {
      urls: [...candidates.values()],
      categoriesNotFound,
      pagesFetched,
      notes,
    };
  },
};
