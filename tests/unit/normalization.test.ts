import { describe, it, expect } from "vitest";
import {
  canonicalizeMajor,
  canonicalizeOrganization,
  canonicalizeRole,
  canonicalizeSport,
  categorizeOrganization,
  normalizeRecord,
  parseGraduationYear,
} from "@/lib/pipeline/normalize";

describe("canonicalizeOrganization", () => {
  it("collapses decorative words so variants compare equal", () => {
    expect(canonicalizeOrganization("The Sigma Chi Delta Chapter")).toBe(
      canonicalizeOrganization("Sigma Chi Delta"),
    );
    expect(canonicalizeOrganization("Undergraduate Sales Club")).toBe(
      canonicalizeOrganization("Undergraduate Sales"),
    );
  });

  it("is punctuation and case insensitive", () => {
    expect(canonicalizeOrganization("Mock-Trial Association!")).toBe(
      canonicalizeOrganization("mock trial association"),
    );
  });
});

describe("categorizeOrganization", () => {
  it("recognises sales organizations", () => {
    expect(categorizeOrganization("Undergraduate Sales Club")).toBe("SALES_ORGANIZATION");
    expect(categorizeOrganization("Professional Selling Society")).toBe("SALES_ORGANIZATION");
  });

  it("recognises entrepreneurship organizations", () => {
    expect(categorizeOrganization("Student Venture Lab")).toBe("ENTREPRENEURSHIP");
    expect(categorizeOrganization("Founders and Builders Collective")).toBe("ENTREPRENEURSHIP");
  });

  it("recognises competitive organizations", () => {
    expect(categorizeOrganization("Debate Union")).toBe("COMPETITIVE_ORGANIZATION");
    expect(categorizeOrganization("Mock Trial Association")).toBe("COMPETITIVE_ORGANIZATION");
  });

  it("recognises an all-Greek-letter chapter name", () => {
    expect(categorizeOrganization("Sigma Chi Delta")).toBe("GREEK_LIFE");
    expect(categorizeOrganization("Alpha Tau Rho")).toBe("GREEK_LIFE");
  });

  it("does not classify an ordinary club as Greek just for one Greek word", () => {
    // Honor societies and professional fraternities use Greek letters too, so
    // a single letter must not be enough to infer Greek life membership.
    expect(categorizeOrganization("Alpha Photography Society")).not.toBe("GREEK_LIFE");
  });

  it("returns undefined for an unrecognised organization", () => {
    expect(categorizeOrganization("Outdoor Adventure Club")).toBeUndefined();
  });
});

describe("canonicalizeRole", () => {
  it("recognises leadership titles", () => {
    expect(canonicalizeRole("President").isLeadership).toBe(true);
    expect(canonicalizeRole("Treasurer").isLeadership).toBe(true);
    expect(canonicalizeRole("Team Captain").isLeadership).toBe(true);
  });

  it("prefers the more specific title", () => {
    // "Vice President" contains "president" and must not collapse into it.
    expect(canonicalizeRole("Vice President").canonical).toBe("Vice President");
  });

  it("marks a founder", () => {
    const role = canonicalizeRole("Co-Founder");
    expect(role.canonical).toBe("Founder");
    expect(role.isLeadership).toBe(true);
  });

  it("does not treat an ordinary role as leadership", () => {
    expect(canonicalizeRole("Member").isLeadership).toBe(false);
  });
});

describe("canonicalizeSport", () => {
  it("folds club and varsity variants of one sport together", () => {
    expect(canonicalizeSport("Club Soccer")).toBe("Soccer");
    expect(canonicalizeSport("Men's Soccer")).toBe("Soccer");
    expect(canonicalizeSport("Soccer")).toBe("Soccer");
  });

  it("normalizes known aliases", () => {
    expect(canonicalizeSport("Crew")).toBe("Rowing");
    expect(canonicalizeSport("Ultimate Frisbee")).toBe("Ultimate");
  });

  it("title-cases an unknown sport rather than discarding it", () => {
    expect(canonicalizeSport("underwater hockey")).toBe("Underwater Hockey");
  });
});

describe("canonicalizeMajor", () => {
  it("strips degree noise", () => {
    expect(canonicalizeMajor("B.S. Economics")).toBe("Economics");
    expect(canonicalizeMajor("Economics major")).toBe("Economics");
  });

  it("returns undefined for unusable input", () => {
    expect(canonicalizeMajor("-")).toBeUndefined();
  });
});

describe("parseGraduationYear", () => {
  const now = new Date("2026-09-03T00:00:00Z");

  it("reads a full year", () => {
    expect(parseGraduationYear("2027", now)).toBe(2027);
    expect(parseGraduationYear("Class of 2028", now)).toBe(2028);
  });

  it("reads an apostrophe year", () => {
    expect(parseGraduationYear("'27", now)).toBe(2027);
  });

  it("rejects a year far outside a plausible window", () => {
    // A stray four-digit number in a roster cell is far more often a founding
    // year or an extension than a graduation year.
    expect(parseGraduationYear("1890", now)).toBeUndefined();
    expect(parseGraduationYear("2099", now)).toBeUndefined();
  });

  it("returns undefined when there is no year at all", () => {
    expect(parseGraduationYear("Economics", now)).toBeUndefined();
    expect(parseGraduationYear("", now)).toBeUndefined();
  });
});

describe("normalizeRecord", () => {
  it("produces comparable fields while keeping the originals available", () => {
    const result = normalizeRecord({
      rawName: "JOHNSON, MICHAEL A.",
      rawOrganization: "The Sigma Chi Delta Chapter",
      rawRole: "Treasurer",
      rawMajor: "B.S. Economics",
      rawYear: "Class of 2027",
      rawSport: null,
    });

    expect(result).not.toBeNull();
    expect(result!.firstName).toBe("Michael");
    expect(result!.lastName).toBe("Johnson");
    expect(result!.middleInitial).toBe("A");
    expect(result!.nameKey).toBe("michael johnson");
    expect(result!.organizationCategory).toBe("GREEK_LIFE");
    expect(result!.roleCanonical).toBe("Treasurer");
    expect(result!.isLeadershipRole).toBe(true);
    expect(result!.majorCanonical).toBe("Economics");
    expect(result!.graduationYear).toBe(2027);
    // The original strings survive alongside the canonical ones.
    expect(result!.organization).toBe("The Sigma Chi Delta Chapter");
    expect(result!.major).toBe("B.S. Economics");
  });

  it("gives a nickname and a full name the same blocking key", () => {
    const a = normalizeRecord({
      rawName: "Mike Johnson", rawOrganization: null, rawRole: null,
      rawMajor: null, rawYear: null, rawSport: null,
    });
    const b = normalizeRecord({
      rawName: "Michael Johnson", rawOrganization: null, rawRole: null,
      rawMajor: null, rawYear: null, rawSport: null,
    });

    expect(a!.nameKey).toBe(b!.nameKey);
    expect(a!.lastNamePhonetic).toBe(b!.lastNamePhonetic);
  });

  it("rejects a record with no parseable person name", () => {
    expect(
      normalizeRecord({
        rawName: "Click here for more", rawOrganization: null, rawRole: null,
        rawMajor: null, rawYear: null, rawSport: null,
      }),
    ).toBeNull();

    expect(
      normalizeRecord({
        rawName: null, rawOrganization: "Debate Union", rawRole: null,
        rawMajor: null, rawYear: null, rawSport: null,
      }),
    ).toBeNull();
  });

  it("leaves unknown fields unset rather than guessing", () => {
    const result = normalizeRecord({
      rawName: "Priyanka Rao", rawOrganization: null, rawRole: null,
      rawMajor: null, rawYear: null, rawSport: null,
    });

    expect(result!.graduationYear).toBeUndefined();
    expect(result!.majorCanonical).toBeUndefined();
    expect(result!.isLeadershipRole).toBe(false);
  });
});
