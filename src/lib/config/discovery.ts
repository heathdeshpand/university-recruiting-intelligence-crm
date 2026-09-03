import type { ParserType, SourceType } from "@prisma/client";

/**
 * Source discovery configuration.
 *
 * The categories below are SEARCH TARGETS, not an assumption that a given
 * university publishes any of them. A university that exposes only athletics
 * and student organizations is completely normal; discovery records the rest
 * as "not found" and the pipeline carries on.
 */

export interface DiscoveryCategory {
  sourceType: SourceType;
  label: string;
  /** URL path fragments commonly used by universities for this category. */
  pathHints: string[];
  /** Words that, in a page title or link text, suggest this category. */
  titleKeywords: string[];
  /** Words that suggest a *roster* rather than a description of a programme. */
  rosterKeywords: string[];
  /** Common subdomains that host this kind of content. */
  subdomainHints: string[];
  /** Default extractor to try when a page of this category validates. */
  preferredParser: ParserType;
}

export const DISCOVERY_CATEGORIES: DiscoveryCategory[] = [
  {
    sourceType: "GREEK_LIFE",
    label: "Greek Life",
    pathHints: ["greek", "fraternity", "fraternities", "sorority", "sororities", "fsl", "greeklife", "panhellenic", "interfraternity"],
    titleKeywords: ["greek life", "fraternity", "sorority", "panhellenic", "interfraternity", "chapters"],
    rosterKeywords: ["chapter", "member", "roster", "officers", "executive board", "directory"],
    subdomainHints: ["greek", "studentlife", "studentaffairs"],
    preferredParser: "ORG_DIRECTORY",
  },
  {
    sourceType: "STUDENT_ORGANIZATION",
    label: "Student Organizations",
    pathHints: ["organizations", "student-organizations", "studentorgs", "orgs", "clubs", "rso", "involvement", "getinvolved", "student-life"],
    titleKeywords: ["student organization", "registered organization", "student clubs", "get involved", "organization directory"],
    rosterKeywords: ["officer", "president", "roster", "members", "leadership", "contact"],
    subdomainHints: ["involvement", "studentlife", "orgs", "campuslife"],
    preferredParser: "ORG_DIRECTORY",
  },
  {
    sourceType: "CLUB_SPORT",
    label: "Club Sports",
    pathHints: ["clubsports", "club-sports", "sportclubs", "sport-clubs", "recreation", "campusrec", "recsports"],
    titleKeywords: ["club sport", "sport club", "competitive sports"],
    rosterKeywords: ["roster", "team", "members", "officers", "captain"],
    subdomainHints: ["rec", "campusrec", "recsports", "imleagues"],
    preferredParser: "HTML_TABLE",
  },
  {
    sourceType: "INTRAMURAL",
    label: "Intramurals",
    pathHints: ["intramural", "intramurals", "im-sports", "imsports"],
    titleKeywords: ["intramural"],
    rosterKeywords: ["team", "roster", "league", "standings", "participants"],
    subdomainHints: ["rec", "campusrec", "imleagues"],
    preferredParser: "HTML_TABLE",
  },
  {
    sourceType: "ATHLETICS",
    label: "Athletics",
    pathHints: ["sports", "roster", "athletics", "teams"],
    titleKeywords: ["roster", "athletics", "varsity", "team"],
    rosterKeywords: ["roster", "position", "class", "hometown", "height", "weight"],
    subdomainHints: ["athletics", "sports", "gostudents"],
    preferredParser: "ATHLETICS_ROSTER",
  },
  {
    sourceType: "STUDENT_GOVERNMENT",
    label: "Student Government",
    pathHints: ["student-government", "studentgovernment", "sga", "asg", "senate", "student-senate"],
    titleKeywords: ["student government", "student senate", "student body"],
    rosterKeywords: ["senator", "president", "officers", "executive", "cabinet", "members"],
    subdomainHints: ["sg", "sga", "studentgov"],
    preferredParser: "ORG_DIRECTORY",
  },
  {
    sourceType: "ENTREPRENEURSHIP",
    label: "Entrepreneurship",
    pathHints: ["entrepreneurship", "entrepreneur", "innovation", "startup", "venture", "incubator"],
    titleKeywords: ["entrepreneurship", "startup", "venture", "innovation", "founders"],
    rosterKeywords: ["team", "members", "founders", "cohort", "fellows", "leadership"],
    subdomainHints: ["entrepreneurship", "innovation", "startup"],
    preferredParser: "ORG_DIRECTORY",
  },
  {
    sourceType: "BUSINESS_ORGANIZATION",
    label: "Business Organizations",
    pathHints: ["business", "commerce", "finance", "marketing", "consulting"],
    titleKeywords: ["business club", "finance club", "consulting club", "marketing association", "investment club"],
    rosterKeywords: ["officers", "board", "members", "leadership", "team"],
    subdomainHints: ["business", "bus"],
    preferredParser: "ORG_DIRECTORY",
  },
  {
    sourceType: "SALES_ORGANIZATION",
    label: "Sales Organizations",
    pathHints: ["sales", "selling", "sales-club", "sales-institute"],
    titleKeywords: ["sales club", "professional selling", "sales institute", "sales program"],
    rosterKeywords: ["officers", "members", "team", "board", "roster"],
    subdomainHints: ["sales", "business"],
    preferredParser: "ORG_DIRECTORY",
  },
  {
    sourceType: "COMPETITIVE_ORGANIZATION",
    label: "Competitive Organizations",
    pathHints: ["debate", "mocktrial", "mock-trial", "modelun", "esports", "robotics", "hackathon"],
    titleKeywords: ["debate", "mock trial", "model united nations", "esports", "robotics"],
    rosterKeywords: ["team", "roster", "members", "competitors", "squad"],
    subdomainHints: ["debate", "esports"],
    preferredParser: "ORG_DIRECTORY",
  },
  {
    sourceType: "STUDENT_DIRECTORY",
    label: "Public Student Directory",
    pathHints: ["directory", "people", "people-search", "lookup", "find-people", "phonebook"],
    titleKeywords: ["directory", "people search", "find a person", "campus directory"],
    rosterKeywords: ["name", "email", "department", "major", "class year"],
    subdomainHints: ["directory", "people", "search"],
    preferredParser: "GENERIC_HTML",
  },
];

export function categoryFor(sourceType: SourceType): DiscoveryCategory | undefined {
  return DISCOVERY_CATEGORIES.find((c) => c.sourceType === sourceType);
}

/**
 * Paths worth trying directly on a university's own domain before crawling.
 *
 * This is a cheap first pass: a handful of well-formed guesses costs far
 * fewer requests than a broad crawl, and the ones that 404 cost nothing.
 */
export const SEED_PATHS = [
  "/", "/students", "/student-life", "/campus-life", "/involvement",
  "/organizations", "/student-organizations", "/clubs", "/greek-life",
  "/athletics", "/recreation", "/campus-recreation", "/directory",
  "/sitemap.xml",
];

/**
 * Link text and URL fragments that are never worth following during
 * discovery. Filtering these early keeps the crawl budget on pages that could
 * plausibly hold records.
 */
export const CRAWL_EXCLUDE_PATTERNS = [
  "/login", "/signin", "/sign-in", "/auth", "/account", "/apply", "/admissions",
  "/give", "/donate", "/privacy", "/terms", "/accessibility", "/copyright",
  "/calendar", "/events/", "/news/", "/blog/", "/search?", "/cart", "/shop",
  "/covid", "/emergency", ".pdf", ".doc", ".docx", ".zip", ".jpg", ".png",
  ".gif", ".mp4", ".css", ".js", "mailto:", "tel:", "javascript:", "#",
];

/** File extensions we can meaningfully parse today. */
export const SUPPORTED_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "application/json",
  "text/csv",
];

/**
 * Source types reserved for enrichment.
 *
 * These are deliberately excluded from the general collection stage. A public
 * student directory covers the entire student body, so collecting it up front
 * would invert the whole product: instead of finding interesting people
 * through their public involvement and then looking up the few that qualify,
 * the pipeline would start by ingesting everyone.
 *
 * Directories are therefore only ever read during enrichment, and only for
 * candidates that passed the discovery threshold.
 */
export const ENRICHMENT_ONLY_SOURCE_TYPES = ["STUDENT_DIRECTORY"] as const;

export function isEnrichmentOnlySource(sourceType: SourceType): boolean {
  return (ENRICHMENT_ONLY_SOURCE_TYPES as readonly SourceType[]).includes(sourceType);
}
