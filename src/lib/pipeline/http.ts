import { env, liveNetworkEnabled } from "@/lib/env";
import { createLogger } from "@/lib/util/logger";
import { err, ok, type Result } from "@/lib/util/result";

const log = createLogger("http");

/**
 * The only outbound HTTP client in the application.
 *
 * Everything that touches a real website goes through here, so the politeness
 * rules live in exactly one place and cannot be bypassed by a new adapter:
 *
 *   * a live network switch that is OFF by default, so a fresh checkout can
 *     never contact a real university until someone deliberately enables it
 *   * robots.txt fetched, cached and honoured per host
 *   * a minimum delay between two requests to the same host, serialized so
 *     that concurrency cannot defeat it
 *   * an honest, contactable User-Agent
 *   * a response size cap and a request timeout
 *
 * There is deliberately no support for solving CAPTCHAs, for authenticating,
 * or for retrying past a 403. If a source cannot be fetched legitimately, the
 * pipeline records it as unavailable and moves on.
 */

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  bytes: number;
  fetchedAt: Date;
}

export type FetchFailure =
  | { kind: "network_disabled"; message: string }
  | { kind: "robots_disallowed"; message: string }
  | { kind: "http_error"; status: number; message: string }
  | { kind: "unsupported_content_type"; contentType: string; message: string }
  | { kind: "too_large"; message: string }
  | { kind: "timeout"; message: string }
  | { kind: "network_error"; message: string };

// --- Per-host politeness ---------------------------------------------------

const hostQueues = new Map<string, Promise<void>>();

/**
 * Serializes requests per host and spaces them apart.
 *
 * Chaining onto a per-host promise means the delay holds even when many
 * sources on one host are collected concurrently -- a plain "sleep before
 * fetch" would not.
 */
async function withHostDelay<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const delay = env.HTTP_PER_HOST_DELAY_MS;
  const previous = hostQueues.get(host) ?? Promise.resolve();

  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  hostQueues.set(
    host,
    previous.then(() => current),
  );

  await previous;
  try {
    return await fn();
  } finally {
    if (delay > 0) {
      setTimeout(release, delay);
    } else {
      release();
    }
  }
}

// --- robots.txt ------------------------------------------------------------

interface RobotsRules {
  disallow: string[];
  allow: string[];
  crawlDelayMs: number | null;
}

const robotsCache = new Map<string, RobotsRules | null>();

/**
 * A deliberately conservative robots.txt parser.
 *
 * It reads the `*` group plus any group naming our agent, and on any parse
 * difficulty it errs toward *not* fetching. It does not implement the full
 * specification; where behaviour is ambiguous it treats the stricter reading
 * as correct.
 */
function parseRobots(text: string, agent: string): RobotsRules {
  const rules: RobotsRules = { disallow: [], allow: [], crawlDelayMs: null };
  const agentLower = agent.toLowerCase();

  let applies = false;
  let sawAnyGroup = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]!.trim();
    if (!line) continue;

    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === "user-agent") {
      const ua = value.toLowerCase();
      const matches = ua === "*" || agentLower.includes(ua);
      if (!sawAnyGroup || !applies) applies = matches;
      else if (matches) applies = true;
      else applies = false;
      sawAnyGroup = true;
      continue;
    }

    if (!applies) continue;

    if (field === "disallow" && value) rules.disallow.push(value);
    else if (field === "allow" && value) rules.allow.push(value);
    else if (field === "crawl-delay") {
      const seconds = Number.parseFloat(value);
      if (Number.isFinite(seconds) && seconds >= 0) rules.crawlDelayMs = seconds * 1000;
    }
  }

  return rules;
}

function pathMatches(pattern: string, path: string): boolean {
  // robots.txt patterns support '*' and a trailing '$'.
  const anchoredEnd = pattern.endsWith("$");
  const body = anchoredEnd ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const re = new RegExp(`^${escaped}${anchoredEnd ? "$" : ""}`);
  return re.test(path);
}

async function getRobots(origin: string): Promise<RobotsRules | null> {
  if (robotsCache.has(origin)) return robotsCache.get(origin) ?? null;

  let rules: RobotsRules | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(env.HTTP_TIMEOUT_MS, 10_000));
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": env.HTTP_USER_AGENT, Accept: "text/plain" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);

    if (res.ok) {
      const text = (await res.text()).slice(0, 512 * 1024);
      rules = parseRobots(text, env.HTTP_USER_AGENT);
    } else {
      // No robots.txt, or it is not readable. Standard practice is to treat
      // that as "no restrictions stated".
      rules = { disallow: [], allow: [], crawlDelayMs: null };
    }
  } catch (e) {
    log.warn("Could not read robots.txt; treating the host as disallowed", {
      origin,
      error: e instanceof Error ? e.message : String(e),
    });
    // Failing closed: if we cannot read the rules, we do not crawl.
    rules = null;
  }

  robotsCache.set(origin, rules);
  return rules;
}

export async function isAllowedByRobots(url: string): Promise<boolean> {
  if (!env.RESPECT_ROBOTS_TXT) return true;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const rules = await getRobots(parsed.origin);
  if (!rules) return false;

  const path = parsed.pathname + parsed.search;

  // Longest matching rule wins; Allow beats Disallow at equal length.
  let bestDisallow = -1;
  let bestAllow = -1;
  for (const p of rules.disallow) if (pathMatches(p, path)) bestDisallow = Math.max(bestDisallow, p.length);
  for (const p of rules.allow) if (pathMatches(p, path)) bestAllow = Math.max(bestAllow, p.length);

  if (bestDisallow === -1) return true;
  return bestAllow >= bestDisallow;
}

/** Extra delay a host asked for via Crawl-delay, if any. */
export async function robotsCrawlDelay(url: string): Promise<number | null> {
  try {
    const rules = await getRobots(new URL(url).origin);
    return rules?.crawlDelayMs ?? null;
  } catch {
    return null;
  }
}

/** Test and reseed helper. */
export function clearRobotsCache(): void {
  robotsCache.clear();
}

// --- Fetch -----------------------------------------------------------------

export interface FetchOptions {
  accept?: string;
  /** Skip the robots check. Only ever used for robots.txt itself. */
  skipRobots?: boolean;
}

export async function politeFetch(
  url: string,
  options: FetchOptions = {},
): Promise<Result<FetchResult, FetchFailure>> {
  if (!liveNetworkEnabled) {
    return err({
      kind: "network_disabled",
      message:
        "Live network access is disabled. Set ENABLE_LIVE_NETWORK=true in .env to allow this application to contact real websites, and make sure you are entitled to fetch the source you are pointing it at.",
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return err({ kind: "network_error", message: `${url} is not a valid URL.` });
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return err({ kind: "network_error", message: `Unsupported URL scheme ${parsed.protocol}.` });
  }

  if (!options.skipRobots && !(await isAllowedByRobots(url))) {
    return err({
      kind: "robots_disallowed",
      message: `robots.txt on ${parsed.host} disallows fetching ${parsed.pathname}. The source has been left unavailable rather than fetched.`,
    });
  }

  const extraDelay = await robotsCrawlDelay(url);

  return withHostDelay(parsed.host, async () => {
    if (extraDelay && extraDelay > env.HTTP_PER_HOST_DELAY_MS) {
      await new Promise((r) => setTimeout(r, extraDelay - env.HTTP_PER_HOST_DELAY_MS));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.HTTP_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": env.HTTP_USER_AGENT,
          Accept: options.accept ?? "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      if (!res.ok) {
        return err({
          kind: "http_error",
          status: res.status,
          message: `${parsed.host} returned HTTP ${res.status} for ${parsed.pathname}.`,
        } as FetchFailure);
      }

      const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();

      const declaredLength = Number.parseInt(res.headers.get("content-length") ?? "", 10);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        return err({
          kind: "too_large",
          message: `${parsed.host} returned ${Math.round(declaredLength / 1024)} KB, above the ${MAX_RESPONSE_BYTES / 1024 / 1024} MB limit.`,
        } as FetchFailure);
      }

      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > MAX_RESPONSE_BYTES) {
        return err({
          kind: "too_large",
          message: `Response from ${parsed.host} exceeded the ${MAX_RESPONSE_BYTES / 1024 / 1024} MB limit.`,
        } as FetchFailure);
      }

      const body = new TextDecoder("utf-8", { fatal: false }).decode(buffer);

      return ok({
        url,
        finalUrl: res.url || url,
        status: res.status,
        contentType,
        body,
        bytes: buffer.byteLength,
        fetchedAt: new Date(),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof Error && e.name === "AbortError") {
        return err({
          kind: "timeout",
          message: `${parsed.host} did not respond within ${env.HTTP_TIMEOUT_MS} ms.`,
        } as FetchFailure);
      }
      return err({ kind: "network_error", message } as FetchFailure);
    } finally {
      clearTimeout(timer);
    }
  });
}

export { MAX_REDIRECTS };
