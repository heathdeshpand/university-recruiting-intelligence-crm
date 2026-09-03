import type { DiscoveryMethod, SourceType } from "@prisma/client";

/**
 * The discovery provider contract.
 *
 * A provider's only job is to propose URLs that might contain records. It
 * does not classify them beyond a first guess and it never decides whether
 * they are usable -- validation does that, by trying to extract from them.
 *
 * Keeping providers this thin is what lets the crawler, an optional search
 * API and the demo fixture set all feed the same downstream machinery.
 */

export interface DiscoveredUrl {
  url: string;
  /** Link text or search-result title that led us here. */
  label?: string;
  sourceType: SourceType;
  confidence: number;
  discoveryMethod: DiscoveryMethod;
  notes: string;
}

export interface DiscoveryTarget {
  universityId: string;
  universitySlug: string;
  name: string;
  shortName: string | null;
  athleticName: string | null;
  aliases: string[];
  domains: string[];
  isDemo: boolean;
}

export interface DiscoveryProgress {
  (message: string, meta?: Record<string, unknown>): Promise<void>;
}

export interface DiscoveryProviderResult {
  urls: DiscoveredUrl[];
  /** Categories the provider searched for and did not find. */
  categoriesNotFound: SourceType[];
  pagesFetched: number;
  notes: string[];
}

export interface DiscoveryProvider {
  name: string;
  description: string;
  /** Whether this provider can run given the current configuration. */
  isAvailable(target: DiscoveryTarget): boolean;
  discover(
    target: DiscoveryTarget,
    report: DiscoveryProgress,
    shouldStop: () => Promise<boolean>,
  ): Promise<DiscoveryProviderResult>;
}
