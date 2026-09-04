import { describe, it, expect } from "vitest";
import { domainSchema, normalizeDomain, createUniversitySchema } from "@/lib/api/validation";

/**
 * Input validation.
 *
 * The domain field is the one people actually get wrong, because nobody types
 * a bare hostname. They paste a URL, copy an email, or write "@illinois.edu"
 * because that is what a domain looks like in ordinary use. Rejecting those
 * teaches nothing except that the form is fussy.
 */

describe("normalizeDomain", () => {
  const equivalent = [
    "illinois.edu",
    "@illinois.edu",
    "ILLINOIS.EDU",
    "  illinois.edu  ",
    "www.illinois.edu",
    "http://illinois.edu",
    "https://illinois.edu",
    "https://www.illinois.edu",
    "https://illinois.edu/",
    "https://www.illinois.edu/admissions",
    "https://illinois.edu/search?q=greek+life",
    "https://illinois.edu/page#section",
    "illinois.edu:443",
    "illinois.edu.",
    "admissions@illinois.edu",
  ];

  it.each(equivalent)("normalizes %s to illinois.edu", (input) => {
    expect(normalizeDomain(input)).toBe("illinois.edu");
  });

  it("keeps a subdomain, which is often where the data lives", () => {
    // Athletics and student-involvement platforms are frequently on their own
    // subdomain, so stripping to the registrable domain would lose them.
    expect(normalizeDomain("https://involvement.illinois.edu/organizations")).toBe(
      "involvement.illinois.edu",
    );
    expect(normalizeDomain("fightingillini.com")).toBe("fightingillini.com");
  });
});

describe("domainSchema", () => {
  it("accepts every shape a person reasonably writes", () => {
    for (const input of ["illinois.edu", "@illinois.edu", "https://www.illinois.edu/x"]) {
      const parsed = domainSchema.safeParse(input);
      expect(parsed.success, input).toBe(true);
      if (parsed.success) expect(parsed.data).toBe("illinois.edu");
    }
  });

  it("rejects things that are not domains", () => {
    for (const input of ["not a domain", "@@@", "illinois", "...", "http://", "  "]) {
      expect(domainSchema.safeParse(input).success, input).toBe(false);
    }
  });

  it("explains what a good value looks like when it rejects one", () => {
    const parsed = domainSchema.safeParse("not a domain");
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      // An error that only says "invalid" leaves someone guessing which of a
      // dozen rules they broke.
      expect(parsed.error.issues[0]!.message).toContain("illinois.edu");
    }
  });
});

describe("createUniversitySchema", () => {
  it("accepts a realistic submission with mixed domain formats", () => {
    const parsed = createUniversitySchema.safeParse({
      name: "University of Illinois Urbana-Champaign",
      shortName: "UIUC",
      primaryDomain: "@illinois.edu",
      additionalDomains: ["https://fightingillini.com", "www.involvement.illinois.edu"],
      athleticName: "Fighting Illini",
      aliases: ["Illinois", "U of I"],
      city: "Urbana",
      state: "IL",
      country: "US",
      notes: "",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.primaryDomain).toBe("illinois.edu");
      expect(parsed.data.additionalDomains).toEqual([
        "fightingillini.com",
        "involvement.illinois.edu",
      ]);
    }
  });

  it("requires a name and a primary domain", () => {
    expect(createUniversitySchema.safeParse({ name: "", primaryDomain: "illinois.edu" }).success).toBe(false);
    expect(createUniversitySchema.safeParse({ name: "Somewhere", primaryDomain: "" }).success).toBe(false);
  });
});
