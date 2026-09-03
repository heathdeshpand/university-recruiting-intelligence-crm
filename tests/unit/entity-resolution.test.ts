import { describe, it, expect } from "vitest";
import { buildSurnameFrequency, distinctiveness, scorePair } from "@/lib/pipeline/resolve/score";
import { MATCH_THRESHOLDS, statusForScore, type ResolvableRecord } from "@/lib/pipeline/resolve/types";
import { buildBlocks, iteratePairs, pairKey } from "@/lib/pipeline/resolve/blocking";
import { clusterRecords } from "@/lib/pipeline/resolve/cluster";
import { careerStageFor } from "@/lib/pipeline/resolve";
import { phoneticKey } from "@/lib/util/text";

/**
 * Builds a record with sensible defaults.
 *
 * `nameKey` and `lastNamePhonetic` are derived from the name unless they are
 * overridden explicitly, so that a test which changes only the surname gets a
 * coherent record rather than one whose derived fields still describe the
 * default name.
 */
function record(overrides: Partial<ResolvableRecord> & { id: string }): ResolvableRecord {
  const base: ResolvableRecord = {
    normalizedName: "Michael Johnson",
    firstName: "Michael",
    middleInitial: null,
    lastName: "Johnson",
    suffix: null,
    nameKey: "michael johnson",
    lastNamePhonetic: "JNSN",
    organizationCanonical: null,
    sportCanonical: null,
    majorCanonical: null,
    graduationYear: null,
    email: null,
    sourceId: "source-1",
    ...overrides,
  };

  if (overrides.nameKey === undefined) {
    base.nameKey = `${(base.firstName ?? "").toLowerCase()} ${(base.lastName ?? "").toLowerCase()}`.trim();
  }
  if (overrides.lastNamePhonetic === undefined && base.lastName) {
    base.lastNamePhonetic = phoneticKey(base.lastName);
  }

  return base;
}

const noFreq = new Map<string, number>();

describe("scorePair — the same person written differently", () => {
  it("auto-matches a well-corroborated pair", () => {
    // "Michael Johnson" (Sigma Chi) against "Michael A. Johnson" (Economics),
    // agreeing on graduation year and major.
    const a = record({
      id: "a",
      graduationYear: 2027,
      majorCanonical: "Economics",
      organizationCanonical: "sigma chi delta",
    });
    const b = record({
      id: "b",
      normalizedName: "Michael A. Johnson",
      middleInitial: "A",
      graduationYear: 2027,
      majorCanonical: "Economics",
      organizationCanonical: "sigma chi delta",
    });

    const result = scorePair(a, b, noFreq);
    expect(result.status).toBe("AUTO_MATCHED");
    expect(result.matchScore).toBeGreaterThanOrEqual(MATCH_THRESHOLDS.AUTO);
    expect(result.matchingFactors.map((f) => f.label)).toContain("Same graduation year");
    expect(result.matchingFactors.map((f) => f.label)).toContain("Same major");
    expect(result.conflictingFactors).toHaveLength(0);
  });

  it("treats a nickname as the same first name", () => {
    const a = record({ id: "a", firstName: "Michael", graduationYear: 2027, majorCanonical: "Economics" });
    const b = record({
      id: "b",
      firstName: "Mike",
      normalizedName: "Mike Johnson",
      graduationYear: 2027,
      majorCanonical: "Economics",
    });

    const result = scorePair(a, b, noFreq);
    expect(result.matchScore).toBeGreaterThanOrEqual(MATCH_THRESHOLDS.PROBABLE);
    expect(result.matchingFactors.some((f) => f.label.includes("Same first name"))).toBe(true);
  });

  it("matches surnames that are spelling variants", () => {
    const a = record({ id: "a", lastName: "Smith", nameKey: "michael smith", lastNamePhonetic: "SM0" });
    const b = record({
      id: "b",
      lastName: "Smyth",
      normalizedName: "Michael Smyth",
      nameKey: "michael smyth",
      lastNamePhonetic: "SM0",
    });

    const result = scorePair(a, b, noFreq);
    expect(result.matchingFactors.some((f) => f.label.includes("spelling variants"))).toBe(true);
    expect(result.matchScore).toBeGreaterThan(0);
  });

  it("treats a shared email address as decisive", () => {
    const a = record({ id: "a", email: "mjohnson7@students.example.edu" });
    const b = record({ id: "b", firstName: "Mike", email: "mjohnson7@students.example.edu" });

    const result = scorePair(a, b, noFreq);
    expect(result.status).toBe("AUTO_MATCHED");
  });
});

describe("scorePair — protecting against false merges", () => {
  it("does NOT auto-match two records that agree on nothing but the name", () => {
    // The single most important property in the model: two different people
    // sharing a name must never be silently fused.
    const a = record({ id: "a" });
    const b = record({ id: "b" });

    const result = scorePair(a, b, noFreq);
    expect(result.status).not.toBe("AUTO_MATCHED");
    expect(result.status).toBe("MANUAL_REVIEW");
    expect(result.matchScore).toBeLessThan(MATCH_THRESHOLDS.AUTO);
    expect(result.matchScore).toBeGreaterThanOrEqual(MATCH_THRESHOLDS.REVIEW);
  });

  it("rejects records with conflicting middle initials", () => {
    const a = record({ id: "a", middleInitial: "A", graduationYear: 2027 });
    const b = record({ id: "b", middleInitial: "R", graduationYear: 2027 });

    const result = scorePair(a, b, noFreq);
    expect(result.status).not.toBe("AUTO_MATCHED");
    expect(result.conflictingFactors.map((f) => f.label)).toContain("Different middle initials");
  });

  it("rejects records with different email addresses", () => {
    const a = record({ id: "a", email: "mjohnson1@students.example.edu", graduationYear: 2027, majorCanonical: "Economics" });
    const b = record({ id: "b", email: "mjohnson2@students.example.edu", graduationYear: 2027, majorCanonical: "Economics" });

    const result = scorePair(a, b, noFreq);
    expect(result.status).not.toBe("AUTO_MATCHED");
    expect(result.conflictingFactors.map((f) => f.label)).toContain("Different email addresses");
  });

  it("rejects records whose graduation years are far apart", () => {
    const a = record({ id: "a", graduationYear: 2024 });
    const b = record({ id: "b", graduationYear: 2028 });

    const result = scorePair(a, b, noFreq);
    expect(result.status).not.toBe("AUTO_MATCHED");
    expect(result.conflictingFactors.map((f) => f.label)).toContain("Graduation years are far apart");
  });

  it("forgives a one-year discrepancy", () => {
    // Sources routinely disagree by a year; this should be a soft penalty.
    const a = record({ id: "a", graduationYear: 2027, majorCanonical: "Economics", middleInitial: "A" });
    const b = record({ id: "b", graduationYear: 2028, majorCanonical: "Economics", middleInitial: "A" });

    const result = scorePair(a, b, noFreq);
    const far = result.conflictingFactors.find((f) => f.label === "Graduation years are far apart");
    expect(far).toBeUndefined();
    expect(result.matchScore).toBeGreaterThanOrEqual(MATCH_THRESHOLDS.REVIEW);
  });

  it("refuses different given names outright", () => {
    const a = record({ id: "a", firstName: "Michael" });
    const b = record({ id: "b", firstName: "Matthew", normalizedName: "Matthew Johnson" });

    const result = scorePair(a, b, noFreq);
    expect(result.status).toBe("NOT_MATCHED");
    expect(result.matchScore).toBe(0);
  });

  it("refuses different surnames outright", () => {
    const a = record({ id: "a", lastName: "Johnson", lastNamePhonetic: "JNSN" });
    const b = record({ id: "b", lastName: "Patel", normalizedName: "Michael Patel", lastNamePhonetic: "PTL" });

    const result = scorePair(a, b, noFreq);
    expect(result.status).toBe("NOT_MATCHED");
  });

  it("distinguishes Jr from Sr", () => {
    const a = record({ id: "a", suffix: "Jr", graduationYear: 2027 });
    const b = record({ id: "b", suffix: "Sr", graduationYear: 2027 });

    const result = scorePair(a, b, noFreq);
    expect(result.conflictingFactors.map((f) => f.label)).toContain(
      "Different generational suffixes",
    );
    expect(result.status).not.toBe("AUTO_MATCHED");
  });
});

describe("surname distinctiveness", () => {
  it("weights a rare surname above a common one", () => {
    // Thirty different people surnamed Smith, against two records for one
    // person surnamed Wroblewski.
    const freq = buildSurnameFrequency([
      ...Array.from({ length: 30 }, (_, i) =>
        record({ id: `s${i}`, firstName: `Person${i}`, lastName: "Smith" }),
      ),
      record({ id: "w1", lastName: "Wroblewski" }),
      record({ id: "w2", lastName: "Wroblewski" }),
    ]);

    expect(freq.get("smith")).toBe(30);
    expect(freq.get("wroblewski")).toBe(1);
    expect(distinctiveness("Wroblewski", freq)).toBeGreaterThan(distinctiveness("Smith", freq));
  });

  it("scores a rare-surname pair above an identical common-surname pair", () => {
    const freq = buildSurnameFrequency([
      ...Array.from({ length: 30 }, (_, i) =>
        record({ id: `s${i}`, firstName: `Person${i}`, lastName: "Smith" }),
      ),
      record({ id: "w1", lastName: "Wroblewski" }),
      record({ id: "w2", lastName: "Wroblewski" }),
    ]);

    const common = scorePair(
      record({ id: "a", lastName: "Smith" }),
      record({ id: "b", lastName: "Smith" }),
      freq,
    );
    const rare = scorePair(
      record({ id: "c", lastName: "Wroblewski" }),
      record({ id: "d", lastName: "Wroblewski" }),
      freq,
    );

    expect(rare.matchScore).toBeGreaterThan(common.matchScore);
  });
});

describe("statusForScore", () => {
  it("maps scores onto the documented bands", () => {
    expect(statusForScore(95)).toBe("AUTO_MATCHED");
    expect(statusForScore(85)).toBe("AUTO_MATCHED");
    expect(statusForScore(84)).toBe("PROBABLE_MATCH");
    expect(statusForScore(70)).toBe("PROBABLE_MATCH");
    expect(statusForScore(69)).toBe("MANUAL_REVIEW");
    expect(statusForScore(50)).toBe("MANUAL_REVIEW");
    expect(statusForScore(49)).toBe("NOT_MATCHED");
    expect(statusForScore(0)).toBe("NOT_MATCHED");
  });
});

describe("blocking", () => {
  it("groups records that could plausibly match", () => {
    const records = [
      record({ id: "a", firstName: "Michael", lastName: "Johnson" }),
      record({ id: "b", firstName: "Mike", lastName: "Johnson", nameKey: "michael johnson" }),
      record({
        id: "c",
        firstName: "Priyanka",
        lastName: "Rao",
        nameKey: "priyanka rao",
        lastNamePhonetic: "R",
      }),
    ];

    const { blocks } = buildBlocks(records);
    const pairs = [...iteratePairs(blocks)].map(([x, y]) => pairKey(x, y));

    expect(pairs).toContain(pairKey("a", "b"));
    expect(pairs).not.toContain(pairKey("a", "c"));
  });

  it("never yields the same pair twice", () => {
    const records = [
      record({ id: "a" }),
      record({ id: "b" }),
      record({ id: "c" }),
    ];
    const { blocks } = buildBlocks(records);
    const pairs = [...iteratePairs(blocks)].map(([x, y]) => pairKey(x, y));
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("produces no pairs for a single record", () => {
    const { blocks, pairCount } = buildBlocks([record({ id: "only" })]);
    expect(pairCount).toBe(0);
    expect([...iteratePairs(blocks)]).toHaveLength(0);
  });
});

describe("clustering", () => {
  it("merges transitively", () => {
    const result = clusterRecords(
      ["a", "b", "c", "d"],
      [
        { a: "a", b: "b", score: 95 },
        { a: "b", b: "c", score: 90 },
      ],
      new Set(),
    );

    expect(result.assignment.get("a")).toBe(result.assignment.get("c"));
    expect(result.assignment.get("d")).not.toBe(result.assignment.get("a"));
    expect(result.clusters.size).toBe(2);
  });

  it("refuses a merge that would violate a reviewer's rejection", () => {
    // A reviewer said a and c are different people. A chain through b must
    // not quietly reunite them.
    const result = clusterRecords(
      ["a", "b", "c"],
      [
        { a: "a", b: "b", score: 95 },
        { a: "b", b: "c", score: 90 },
      ],
      new Set([pairKey("a", "c")]),
    );

    expect(result.assignment.get("a")).not.toBe(result.assignment.get("c"));
    expect(result.blockedByRejection).toHaveLength(1);
  });

  it("honours a reviewer's confirmation over a low automatic score", () => {
    const result = clusterRecords(
      ["a", "b"],
      [],
      new Set(),
      [{ a: "a", b: "b", score: 100 }],
    );
    expect(result.assignment.get("a")).toBe(result.assignment.get("b"));
  });

  it("leaves unconnected records in their own clusters", () => {
    const result = clusterRecords(["a", "b", "c"], [], new Set());
    expect(result.clusters.size).toBe(3);
  });
});

describe("careerStageFor", () => {
  const now = new Date("2026-09-03T00:00:00Z");

  it("classifies by graduation year", () => {
    expect(careerStageFor(2029, now)).toBe("STUDENT");
    expect(careerStageFor(2027, now)).toBe("NEAR_GRADUATION");
    expect(careerStageFor(2026, now)).toBe("RECENT_GRADUATE");
    expect(careerStageFor(2025, now)).toBe("RECENT_GRADUATE");
    expect(careerStageFor(2020, now)).toBe("ALUMNI");
  });

  it("returns UNKNOWN when no year is available", () => {
    // Missing data must never be turned into a definite answer.
    expect(careerStageFor(null, now)).toBe("UNKNOWN");
  });
});
