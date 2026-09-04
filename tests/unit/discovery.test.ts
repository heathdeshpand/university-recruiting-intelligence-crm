import { describe, it, expect } from "vitest";
import {
  classifyUrl,
  crawlPriority,
  isPlausibleDiscoveryTarget,
} from "@/lib/pipeline/discovery/classifier";
import { validateSource } from "@/lib/pipeline/discovery/validator";
import { CRAWL_EXCLUDE_PATTERNS, DISCOVERY_CATEGORIES, isEnrichmentOnlySource } from "@/lib/config/discovery";
import type { TransportResponse } from "@/lib/pipeline/transport";

function response(body: string, contentType = "text/html"): TransportResponse {
  return {
    url: "https://esu.example.edu/page",
    finalUrl: "https://esu.example.edu/page",
    status: 200,
    contentType,
    body,
    bytes: body.length,
    fetchedAt: new Date(),
    transport: "demo",
  };
}

function page(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
}

describe("classifyUrl", () => {
  it("classifies a Greek life directory", () => {
    const result = classifyUrl({
      url: "https://esu.example.edu/student-life/greek-life/chapters",
      title: "Fraternity and Sorority Life | Chapters",
    });
    expect(result.sourceType).toBe("GREEK_LIFE");
    expect(result.confidence).toBeGreaterThan(0.4);
  });

  it("classifies a club sports page", () => {
    const result = classifyUrl({
      url: "https://esu.example.edu/recreation/club-sports/rosters",
      title: "Club Sports Rosters",
    });
    expect(result.sourceType).toBe("CLUB_SPORT");
  });

  it("classifies a student organization directory", () => {
    const result = classifyUrl({
      url: "https://involvement.esu.example.edu/organizations",
      title: "Registered Student Organizations",
    });
    expect(result.sourceType).toBe("STUDENT_ORGANIZATION");
  });

  it("returns UNKNOWN with zero confidence for an unrelated page", () => {
    const result = classifyUrl({
      url: "https://esu.example.edu/parking/permits",
      title: "Parking Permits",
    });
    expect(result.sourceType).toBe("UNKNOWN");
    expect(result.confidence).toBe(0);
  });

  it("explains its reasoning", () => {
    const result = classifyUrl({
      url: "https://esu.example.edu/greek-life",
      title: "Greek Life",
    });
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.notes).toContain("Greek Life");
  });

  it("weights a title match above a link-text match", () => {
    const fromTitle = classifyUrl({ url: "https://esu.example.edu/a", title: "Club Sports" });
    const fromLink = classifyUrl({ url: "https://esu.example.edu/a", linkText: "Club Sports" });
    expect(fromTitle.confidence).toBeGreaterThan(fromLink.confidence);
  });

  it("tolerates a malformed URL", () => {
    expect(classifyUrl({ url: "not a url" }).sourceType).toBe("UNKNOWN");
  });
});

describe("isPlausibleDiscoveryTarget", () => {
  it("accepts an ordinary content path", () => {
    expect(
      isPlausibleDiscoveryTarget("https://esu.example.edu/greek-life", CRAWL_EXCLUDE_PATTERNS),
    ).toBe(true);
  });

  it("rejects logins, applications and assets", () => {
    for (const url of [
      "https://esu.example.edu/login",
      "https://esu.example.edu/apply",
      "https://esu.example.edu/news/2026/something",
      "https://esu.example.edu/files/roster.pdf",
      "https://esu.example.edu/assets/main.css",
      "mailto:someone@esu.example.edu",
    ]) {
      expect(isPlausibleDiscoveryTarget(url, CRAWL_EXCLUDE_PATTERNS), url).toBe(false);
    }
  });

  it("allows pagination but rejects arbitrary query strings", () => {
    expect(
      isPlausibleDiscoveryTarget("https://esu.example.edu/orgs?page=2", CRAWL_EXCLUDE_PATTERNS),
    ).toBe(true);
    expect(
      isPlausibleDiscoveryTarget("https://esu.example.edu/orgs?session=abc", CRAWL_EXCLUDE_PATTERNS),
    ).toBe(false);
  });

  it("rejects very deep paths, which are almost always individual articles", () => {
    expect(
      isPlausibleDiscoveryTarget("https://esu.example.edu/a/b/c/d/e/f/g/h", CRAWL_EXCLUDE_PATTERNS),
    ).toBe(false);
  });
});

describe("crawlPriority", () => {
  it("ranks a promising link above an unrelated one", () => {
    const promising = crawlPriority("https://esu.example.edu/greek-life", "Greek Life");
    const unrelated = crawlPriority("https://esu.example.edu/parking", "Parking");
    expect(promising).toBeGreaterThan(unrelated);
  });
});

describe("validateSource", () => {
  it("accepts a page that actually lists people", () => {
    const outcome = validateSource(
      response(
        page(
          "Club Sports Rosters",
          `<table>
            <thead><tr><th>Name</th><th>Team</th><th>Class Year</th></tr></thead>
            <tbody>
              <tr><td>Michael Johnson</td><td>Club Soccer</td><td>2027</td></tr>
              <tr><td>Priyanka Rao</td><td>Club Soccer</td><td>2028</td></tr>
              <tr><td>Diego Torres</td><td>Club Soccer</td><td>2026</td></tr>
              <tr><td>Fatima Haddad</td><td>Club Soccer</td><td>2027</td></tr>
            </tbody>
          </table>`,
        ),
      ),
      "CLUB_SPORT",
    );

    expect(outcome.usable).toBe(true);
    expect(outcome.recordEstimate).toBe(4);
    expect(outcome.parserType).toBe("HTML_TABLE");
    expect(outcome.confidence).toBeGreaterThan(0);
  });

  it("rejects a page that only describes a programme", () => {
    // The canonical false positive: the title says Club Sports, the page says
    // nothing about who is on any team.
    const outcome = validateSource(
      response(
        page(
          "Club Sports",
          `<p>The club sports programme offers competitive opportunities in more
           than twenty sports. Teams practise several times a week and travel to
           compete against other universities.</p>`,
        ),
      ),
      "CLUB_SPORT",
    );

    expect(outcome.usable).toBe(false);
    expect(outcome.recordEstimate).toBe(0);
    expect(outcome.reasons.join(" ")).toMatch(/no extractable person records|no extractor/i);
  });

  it("flags a page with too few records for review rather than activating it", () => {
    const outcome = validateSource(
      response(
        page(
          "Officers",
          `<table><thead><tr><th>Name</th><th>Role</th></tr></thead>
           <tbody><tr><td>Michael Johnson</td><td>President</td></tr>
           <tr><td>Priyanka Rao</td><td>Treasurer</td></tr></tbody></table>`,
        ),
      ),
      "STUDENT_ORGANIZATION",
    );

    expect(outcome.usable).toBe(false);
    expect(outcome.recordEstimate).toBe(2);
    expect(outcome.reasons.join(" ")).toContain("below the threshold");
  });

  it("marks a PDF as needing a different adapter, not as broken", () => {
    const outcome = validateSource(response("%PDF-1.7", "application/pdf"), "CLUB_SPORT");
    expect(outcome.usable).toBe(false);
    expect(outcome.needsDifferentAdapter).toBe(true);
    expect(outcome.parserType).toBe("PDF_UNSUPPORTED");
  });

  it("accepts a JSON endpoint", () => {
    const outcome = validateSource(
      response(
        JSON.stringify({
          results: [
            { fullName: "Michael Johnson", classYear: "2027" },
            { fullName: "Priyanka Rao", classYear: "2028" },
            { fullName: "Diego Torres", classYear: "2026" },
          ],
        }),
        "application/json",
      ),
      "STUDENT_DIRECTORY",
    );

    expect(outcome.usable).toBe(true);
    expect(outcome.parserType).toBe("JSON_ENDPOINT");
  });

  it("handles an empty response without throwing", () => {
    const outcome = validateSource(response(""), "STUDENT_ORGANIZATION");
    expect(outcome.usable).toBe(false);
    expect(outcome.recordEstimate).toBe(0);
  });
});

describe("discovery configuration", () => {
  it("gives every category a distinct source type", () => {
    const types = DISCOVERY_CATEGORIES.map((c) => c.sourceType);
    expect(new Set(types).size).toBe(types.length);
  });

  it("gives every category something to search on", () => {
    for (const category of DISCOVERY_CATEGORIES) {
      expect(category.pathHints.length, category.label).toBeGreaterThan(0);
      expect(category.titleKeywords.length, category.label).toBeGreaterThan(0);
      expect(category.rosterKeywords.length, category.label).toBeGreaterThan(0);
    }
  });

  it("reserves student directories for enrichment only", () => {
    // If this ever returns false, the pipeline would start by ingesting the
    // entire student body, inverting the product's core funnel.
    expect(isEnrichmentOnlySource("STUDENT_DIRECTORY")).toBe(true);
    expect(isEnrichmentOnlySource("CLUB_SPORT")).toBe(false);
    expect(isEnrichmentOnlySource("GREEK_LIFE")).toBe(false);
  });
});

describe("staff and faculty listings are refused", () => {
  // A staff directory looks identical to a student roster to every heuristic:
  // structured, full of real names, on a university domain. Left alone it
  // fills the CRM with employees. This is how a faculty senate staff page
  // became "student government" on a real run.
  const STAFF_PAGES: Array<[string, string]> = [
    ["https://www.senate.illinois.edu/senatestaff.asp", "Senate Staff"],
    ["https://example.edu/faculty-directory", "Faculty Directory"],
    ["https://example.edu/about/our-team", "Our Team"],
    ["https://example.edu/hr/employees", "Employee Directory"],
    ["https://example.edu/administration", "Administration"],
  ];

  it.each(STAFF_PAGES)("refuses %s", (url, title) => {
    const result = classifyUrl({ url, title });
    expect(result.sourceType).toBe("UNKNOWN");
    expect(result.confidence).toBe(0);
    expect(result.notes).toContain("staff or faculty");
  });

  it("still classifies genuine student sources", () => {
    expect(classifyUrl({ url: "https://example.edu/greek-life/chapters", title: "Fraternity and Sorority Life" }).sourceType).toBe("GREEK_LIFE");
    expect(classifyUrl({ url: "https://example.edu/recreation/club-sports/rosters", title: "Club Sports Rosters" }).sourceType).toBe("CLUB_SPORT");
  });

  it("does not crawl staff paths", () => {
    for (const url of [
      "https://example.edu/staff",
      "https://example.edu/faculty",
      "https://example.edu/administration",
    ]) {
      expect(isPlausibleDiscoveryTarget(url, CRAWL_EXCLUDE_PATTERNS), url).toBe(false);
    }
  });
});
