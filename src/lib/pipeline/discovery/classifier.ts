import type { SourceType } from "@prisma/client";
import { DISCOVERY_CATEGORIES, type DiscoveryCategory } from "@/lib/config/discovery";
import { tokenize } from "@/lib/util/text";

/**
 * URL and page classification.
 *
 * Given a URL and whatever context we have about it -- link text, page title,
 * visible text -- decide which discovery category it belongs to and how
 * confident that is.
 *
 * This is deliberately a transparent scoring function rather than a model.
 * Every point it awards is attributable to a specific rule, which is what
 * lets the Sources UI explain why a page was classified the way it was, and
 * what lets a recruiter correct it sensibly.
 */

export interface ClassificationSignal {
  reason: string;
  weight: number;
}

export interface Classification {
  sourceType: SourceType;
  confidence: number;
  signals: ClassificationSignal[];
  /** Human-readable summary stored on the source row. */
  notes: string;
}

interface ClassifyInput {
  url: string;
  /** Text of the link that led here, if discovered by crawling. */
  linkText?: string;
  /** <title> of the page, if it has been fetched. */
  title?: string;
  /** Visible text of the page, if it has been fetched. */
  text?: string;
}

// Roughly the score a page matching on path, subdomain, title and roster
// vocabulary would reach; used to map raw scores onto a 0-1 confidence.
const MAX_SCORE = 11;

function scoreCategory(category: DiscoveryCategory, input: ClassifyInput): ClassificationSignal[] {
  const signals: ClassificationSignal[] = [];

  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return signals;
  }

  const path = url.pathname.toLowerCase();
  const host = url.host.toLowerCase();
  const subdomain = host.split(".")[0] ?? "";

  // The most specific matching hint wins, not the first one listed. Without
  // this, "/recreation/club-sports/rosters" matches athletics on "sports"
  // before it matches club sports on "club-sports", and a club sport roster
  // gets filed as varsity athletics.
  let bestHint: { hint: string; weight: number } | undefined;

  for (const hint of category.pathHints) {
    if (!path.includes(hint)) continue;

    // A hint delimited by path separators is a much stronger indicator than
    // one buried inside a longer word ("greek" in "greeknews").
    const delimited = new RegExp(`(?:^|[/\\-_.])${hint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[/\\-_.]|$)`).test(
      path,
    );
    // Longer hints are more specific and are weighted accordingly.
    const specificity = Math.min(1.5, hint.length / 10);
    const weight = (delimited ? 3 : 1.5) + specificity;

    if (!bestHint || weight > bestHint.weight) bestHint = { hint, weight };
  }

  if (bestHint) {
    signals.push({
      reason: `URL path contains "${bestHint.hint}"`,
      weight: bestHint.weight,
    });
  }

  for (const hint of category.subdomainHints) {
    if (subdomain === hint || host.startsWith(`${hint}.`)) {
      signals.push({ reason: `Hosted on the "${hint}" subdomain`, weight: 2 });
      break;
    }
  }

  const titleText = (input.title ?? "").toLowerCase();
  for (const keyword of category.titleKeywords) {
    if (titleText.includes(keyword)) {
      signals.push({ reason: `Page title mentions "${keyword}"`, weight: 3 });
      break;
    }
  }

  const linkText = (input.linkText ?? "").toLowerCase();
  for (const keyword of category.titleKeywords) {
    if (linkText.includes(keyword)) {
      signals.push({ reason: `Link text mentions "${keyword}"`, weight: 1.5 });
      break;
    }
  }

  // Roster vocabulary is what separates "a page about club sports" from "a
  // page listing club sport members". It is weighted modestly here because
  // validation, not classification, is what finally decides usability.
  const bodyText = (input.text ?? "").toLowerCase().slice(0, 20_000);
  if (bodyText) {
    const hits = category.rosterKeywords.filter((k) => bodyText.includes(k));
    if (hits.length > 0) {
      signals.push({
        reason: `Page uses roster vocabulary (${hits.slice(0, 3).join(", ")})`,
        weight: Math.min(2, hits.length * 0.7),
      });
    }
  }

  return signals;
}

/**
 * Words that mean a page lists employees rather than students.
 *
 * A staff directory looks exactly like a student roster to every heuristic
 * here -- structured, full of real names, on a university domain. The only
 * reliable difference is that it says so, so that is what gets checked.
 */
const STAFF_INDICATORS = [
  "staff", "faculty", "employee", "personnel", "human resources",
  "administration", "our team", "meet the team", "leadership team",
];

function looksLikeStaffListing(input: ClassifyInput): boolean {
  const haystack = `${input.url} ${input.title ?? ""} ${input.linkText ?? ""}`.toLowerCase();
  return STAFF_INDICATORS.some((word) => haystack.includes(word));
}

/**
 * Error pages that answer with a success status.
 *
 * Illinois returns a page titled "404 - Page not found" for any unknown path.
 * It renders the site's navigation, so it looks like a directory of links and
 * extracts as a list of "people" named Academic Catalog and Study Abroad.
 * Fingerprinting misses it because each one echoes the path that was asked
 * for, so the page has to be recognised by what it says.
 */
const NOT_FOUND_INDICATORS = [
  "404", "page not found", "page cannot be found", "page doesn't exist",
  "page does not exist", "not found", "410 gone", "403 forbidden",
  "access denied", "error occurred", "something went wrong",
];

function looksLikeErrorPage(input: ClassifyInput): boolean {
  const title = (input.title ?? "").toLowerCase().trim();
  if (!title) return false;
  // Matched against the title only. The phrase can appear innocently in body
  // text, but a page whose *title* announces an error is an error page.
  return NOT_FOUND_INDICATORS.some((phrase) => title.includes(phrase));
}

export function classifyUrl(input: ClassifyInput): Classification {
  if (looksLikeErrorPage(input)) {
    return {
      sourceType: "UNKNOWN",
      confidence: 0,
      signals: [],
      notes:
        "Skipped: the page's title says it is an error page. Some sites answer unknown paths with a rendered error page rather than a 404 status.",
    };
  }

  // Refused outright rather than scored down. A staff page that scrapes
  // cleanly would otherwise fill the CRM with employees.
  if (looksLikeStaffListing(input)) {
    return {
      sourceType: "UNKNOWN",
      confidence: 0,
      signals: [],
      notes:
        "Skipped: this page appears to list staff or faculty rather than students. Employee directories are out of scope.",
    };
  }

  let best: { category: DiscoveryCategory; signals: ClassificationSignal[]; score: number } | null =
    null;

  for (const category of DISCOVERY_CATEGORIES) {
    const signals = scoreCategory(category, input);
    const score = signals.reduce((sum, s) => sum + s.weight, 0);
    if (score > 0 && (!best || score > best.score)) {
      best = { category, signals, score };
    }
  }

  if (!best) {
    return {
      sourceType: "UNKNOWN",
      confidence: 0,
      signals: [],
      notes: "Nothing in the URL, title or link text matched a known discovery category.",
    };
  }

  const confidence = Math.min(1, best.score / MAX_SCORE);

  return {
    sourceType: best.category.sourceType,
    confidence: Number(confidence.toFixed(2)),
    signals: best.signals,
    notes: `Classified as ${best.category.label}: ${best.signals.map((s) => s.reason).join("; ")}.`,
  };
}

/**
 * True when a URL is worth fetching during a crawl.
 *
 * Discovery has a fixed page budget, so this is what keeps it spent on pages
 * that could plausibly hold records rather than on news archives and event
 * calendars.
 */
export function isPlausibleDiscoveryTarget(url: string, excludePatterns: string[]): boolean {
  const lower = url.toLowerCase();
  if (excludePatterns.some((p) => lower.includes(p))) return false;

  try {
    const parsed = new URL(url);
    // Very deep paths are almost always individual articles or events.
    if (parsed.pathname.split("/").filter(Boolean).length > 6) return false;
    // Query strings with pagination are fine; anything else usually is not.
    if (parsed.search && !/[?&](page|p|start|offset|letter)=/.test(parsed.search)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Any category keyword appearing in a string, used to rank crawl frontier. */
export function crawlPriority(url: string, linkText: string): number {
  const haystack = `${url} ${linkText}`.toLowerCase();
  const tokens = new Set(tokenize(haystack));

  let priority = 0;
  for (const category of DISCOVERY_CATEGORIES) {
    for (const hint of [...category.pathHints, ...category.titleKeywords]) {
      const parts = hint.split(/[\s-]/);
      if (parts.every((p) => tokens.has(p) || haystack.includes(p))) {
        priority += 2;
        break;
      }
    }
  }
  return priority;
}
