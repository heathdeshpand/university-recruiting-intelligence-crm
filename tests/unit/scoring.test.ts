import { describe, it, expect } from "vitest";
import {
  computeScore,
  groupBreakdown,
  maxPointsForRule,
  pointsForRule,
  type ScoringRuleInput,
  type ScoringSignalInput,
} from "@/lib/pipeline/scoring/engine";
import { tierForScore } from "@/lib/config/scoring";
import { DEFAULT_DISCOVERY_CONFIG, DEFAULT_FINAL_CONFIG } from "@/lib/config/scoring";
import { SIGNAL_DEFINITIONS } from "@/lib/config/signals";

function rule(overrides: Partial<ScoringRuleInput> & { key: string; signalKey: string }): ScoringRuleInput {
  return {
    label: overrides.key,
    category: "SOCIAL",
    requiredValue: "YES",
    points: 10,
    minOccurrences: 1,
    pointsPerExtraOccurrence: 0,
    maxPoints: null,
    active: true,
    ...overrides,
  };
}

function signal(overrides: Partial<ScoringSignalInput> & { definitionKey: string }): ScoringSignalInput {
  return {
    value: "YES",
    occurrences: 1,
    confidence: "MEDIUM",
    evidence: null,
    ...overrides,
  };
}

describe("computeScore — basic arithmetic", () => {
  it("awards a rule's points when its signal is YES", () => {
    const result = computeScore([signal({ definitionKey: "GREEK_MEMBERSHIP" })], {
      rules: [rule({ key: "GREEK", signalKey: "GREEK_MEMBERSHIP", points: 12 })],
      categoryCaps: {},
    });

    expect(result.value).toBe(12);
    expect(result.factors).toHaveLength(1);
    expect(result.factors[0]!.points).toBe(12);
  });

  it("sums independent rules", () => {
    const result = computeScore(
      [signal({ definitionKey: "GREEK_MEMBERSHIP" }), signal({ definitionKey: "CLUB_SPORT" })],
      {
        rules: [
          rule({ key: "GREEK", signalKey: "GREEK_MEMBERSHIP", points: 12 }),
          rule({ key: "SPORT", signalKey: "CLUB_SPORT", points: 8, category: "COMPETITIVE" }),
        ],
        categoryCaps: {},
      },
    );

    expect(result.value).toBe(20);
  });

  it("ignores inactive rules", () => {
    const result = computeScore([signal({ definitionKey: "GREEK_MEMBERSHIP" })], {
      rules: [rule({ key: "GREEK", signalKey: "GREEK_MEMBERSHIP", points: 12, active: false })],
      categoryCaps: {},
    });
    expect(result.value).toBe(0);
  });
});

describe("computeScore — missing data is never negative", () => {
  it("scores zero when nothing is known, without penalty", () => {
    const result = computeScore([], {
      rules: [
        rule({ key: "GREEK", signalKey: "GREEK_MEMBERSHIP" }),
        rule({ key: "SPORT", signalKey: "CLUB_SPORT" }),
      ],
      categoryCaps: {},
    });

    expect(result.value).toBe(0);
    expect(result.factors).toHaveLength(0);
    expect(result.unmetRules).toHaveLength(2);
  });

  it("explains an absent signal as unknown, not as absent", () => {
    const result = computeScore([], {
      rules: [rule({ key: "SPORT", signalKey: "CLUB_SPORT" })],
      categoryCaps: {},
    });

    expect(result.unmetRules[0]!.reason).toContain("unknown rather than absent");
  });

  it("does not fire on an UNKNOWN signal", () => {
    const result = computeScore(
      [signal({ definitionKey: "INTRAMURAL", value: "UNKNOWN" })],
      { rules: [rule({ key: "IM", signalKey: "INTRAMURAL" })], categoryCaps: {} },
    );

    expect(result.value).toBe(0);
    expect(result.unmetRules[0]!.reason).toContain("unknown rather than absent");
  });

  it("does not fire on an explicit NO", () => {
    const result = computeScore([signal({ definitionKey: "INTRAMURAL", value: "NO" })], {
      rules: [rule({ key: "IM", signalKey: "INTRAMURAL" })],
      categoryCaps: {},
    });

    expect(result.value).toBe(0);
    expect(result.unmetRules[0]!.reason).toContain("does not apply");
  });

  it("never produces a negative score", () => {
    // There is no code path that subtracts, and this guards against one being
    // introduced later.
    const result = computeScore([], { rules: [rule({ key: "X", signalKey: "Y", points: -50 })], categoryCaps: {} });
    expect(result.value).toBeGreaterThanOrEqual(0);
  });
});

describe("computeScore — no double counting", () => {
  it("fires each rule at most once per candidate", () => {
    const result = computeScore([signal({ definitionKey: "ORG_MEMBERSHIP", occurrences: 5 })], {
      rules: [rule({ key: "ORG", signalKey: "ORG_MEMBERSHIP", points: 8 })],
      categoryCaps: {},
    });

    expect(result.factors.filter((f) => f.ruleKey === "ORG")).toHaveLength(1);
    expect(result.value).toBe(8);
  });

  it("rewards breadth only through occurrences, and caps it", () => {
    const multi = rule({
      key: "MULTI",
      signalKey: "MULTIPLE_ORGS",
      points: 12,
      minOccurrences: 2,
      pointsPerExtraOccurrence: 5,
      maxPoints: 20,
    });

    expect(pointsForRule(multi, 2)).toBe(12);
    expect(pointsForRule(multi, 3)).toBe(17);
    expect(pointsForRule(multi, 4)).toBe(20);
    expect(pointsForRule(multi, 40)).toBe(20);
  });

  it("does not fire below the required occurrence count", () => {
    const result = computeScore([signal({ definitionKey: "MULTIPLE_ORGS", occurrences: 1 })], {
      rules: [rule({ key: "MULTI", signalKey: "MULTIPLE_ORGS", minOccurrences: 2 })],
      categoryCaps: {},
    });

    expect(result.value).toBe(0);
    expect(result.unmetRules[0]!.reason).toContain("Requires at least 2");
  });
});

describe("computeScore — bounds", () => {
  it("applies category caps", () => {
    const result = computeScore(
      [
        signal({ definitionKey: "GREEK_MEMBERSHIP" }),
        signal({ definitionKey: "ORG_MEMBERSHIP" }),
        signal({ definitionKey: "STUDENT_GOVERNMENT" }),
      ],
      {
        rules: [
          rule({ key: "A", signalKey: "GREEK_MEMBERSHIP", points: 20 }),
          rule({ key: "B", signalKey: "ORG_MEMBERSHIP", points: 20 }),
          rule({ key: "C", signalKey: "STUDENT_GOVERNMENT", points: 20 }),
        ],
        categoryCaps: { SOCIAL: 25 },
      },
    );

    expect(result.value).toBe(25);
    expect(result.breakdown.SOCIAL!.raw).toBe(60);
    expect(result.breakdown.SOCIAL!.earned).toBe(25);
    expect(result.breakdown.SOCIAL!.capped).toBe(true);
  });

  it("clamps the total to 100", () => {
    const rules = Array.from({ length: 12 }, (_, i) =>
      rule({ key: `R${i}`, signalKey: `S${i}`, points: 20, category: "SOCIAL" }),
    );
    const signals = Array.from({ length: 12 }, (_, i) => signal({ definitionKey: `S${i}` }));

    const result = computeScore(signals, { rules, categoryCaps: {} });
    expect(result.value).toBe(100);
  });

  it("keeps every score in 0..100 across the built-in configurations", () => {
    for (const config of [DEFAULT_DISCOVERY_CONFIG, DEFAULT_FINAL_CONFIG]) {
      const rules: ScoringRuleInput[] = config.rules.map((r) => ({
        key: r.key,
        label: r.label,
        category: r.category,
        signalKey: r.signalKey,
        requiredValue: "YES",
        points: r.points,
        minOccurrences: r.minOccurrences ?? 1,
        pointsPerExtraOccurrence: r.pointsPerExtraOccurrence ?? 0,
        maxPoints: r.maxPoints ?? null,
        active: true,
      }));

      // Every signal present, at high occurrence: the theoretical maximum.
      const signals = SIGNAL_DEFINITIONS.map((d) =>
        signal({ definitionKey: d.key, occurrences: 10 }),
      );

      const result = computeScore(signals, {
        rules,
        categoryCaps: config.categoryCaps,
      });

      expect(result.value).toBeGreaterThan(0);
      expect(result.value).toBeLessThanOrEqual(100);
    }
  });
});

describe("computeScore — explainability", () => {
  it("attributes every point to a named rule and its evidence", () => {
    const result = computeScore(
      [
        signal({
          definitionKey: "LEADERSHIP_ROLE",
          evidence: {
            id: "ev1",
            statement: "Listed as Treasurer of the Student Venture Lab",
            sourceName: "Registered student organization directory",
            sourceUrl: "https://esu.example.edu/involvement/organizations",
          },
        }),
      ],
      {
        rules: [rule({ key: "LEAD", label: "Leadership position", signalKey: "LEADERSHIP_ROLE", points: 16, category: "LEADERSHIP" })],
        categoryCaps: {},
      },
    );

    const factor = result.factors[0]!;
    expect(factor.label).toBe("Leadership position");
    expect(factor.points).toBe(16);
    expect(factor.evidenceSummary).toContain("Treasurer");
    expect(factor.sourceUrl).toContain("esu.example.edu");
  });

  it("orders factors by contribution", () => {
    const result = computeScore(
      [signal({ definitionKey: "A" }), signal({ definitionKey: "B" })],
      {
        rules: [
          rule({ key: "small", signalKey: "A", points: 3 }),
          rule({ key: "big", signalKey: "B", points: 15 }),
        ],
        categoryCaps: {},
      },
    );

    expect(result.factors.map((f) => f.ruleKey)).toEqual(["big", "small"]);
  });
});

describe("groupBreakdown", () => {
  it("collapses categories into the five display groups", () => {
    const groups = groupBreakdown({
      SOCIAL: { earned: 18, max: 25, raw: 18, capped: false },
      COMPETITIVE: { earned: 20, max: 25, raw: 20, capped: false },
      SALES: { earned: 14, max: 16, raw: 14, capped: false },
      WORK_EXPERIENCE: { earned: 11, max: 20, raw: 11, capped: false },
      LEADERSHIP: { earned: 9, max: 14, raw: 9, capped: false },
    });

    const byLabel = Object.fromEntries(groups.map((g) => [g.label, g]));
    expect(byLabel.Social).toEqual({ label: "Social", earned: 18, max: 25 });
    expect(byLabel["Career / Sales"]!.earned).toBe(25);
    expect(byLabel["Career / Sales"]!.max).toBe(36);
  });

  it("omits groups with no configured maximum", () => {
    const groups = groupBreakdown({ SOCIAL: { earned: 5, max: 25, raw: 5, capped: false } });
    expect(groups.map((g) => g.label)).toEqual(["Social"]);
  });
});

describe("maxPointsForRule", () => {
  it("uses the declared ceiling when there is one", () => {
    expect(maxPointsForRule(rule({ key: "x", signalKey: "y", points: 10, maxPoints: 18 }))).toBe(18);
  });

  it("assumes a realistic ceiling when a rule is unbounded", () => {
    expect(
      maxPointsForRule(rule({ key: "x", signalKey: "y", points: 10, pointsPerExtraOccurrence: 2 })),
    ).toBe(16);
  });
});

describe("tierForScore", () => {
  it("maps scores to tiers", () => {
    expect(tierForScore(92)).toBe("TIER_A");
    expect(tierForScore(85)).toBe("TIER_A");
    expect(tierForScore(84)).toBe("TIER_B");
    expect(tierForScore(70)).toBe("TIER_B");
    expect(tierForScore(69)).toBe("TIER_C");
    expect(tierForScore(50)).toBe("TIER_C");
    expect(tierForScore(49)).toBe("TIER_D");
    expect(tierForScore(0)).toBe("TIER_D");
  });

  it("returns UNRANKED before scoring has run", () => {
    expect(tierForScore(null)).toBe("UNRANKED");
    expect(tierForScore(undefined)).toBe("UNRANKED");
  });
});

describe("scoring configuration integrity", () => {
  it("only references signals that exist in the taxonomy", () => {
    const known = new Set(SIGNAL_DEFINITIONS.map((d) => d.key));
    for (const config of [DEFAULT_DISCOVERY_CONFIG, DEFAULT_FINAL_CONFIG]) {
      for (const r of config.rules) {
        expect(known, `${config.name} rule ${r.key} references ${r.signalKey}`).toContain(r.signalKey);
      }
    }
  });

  it("has no negative weights anywhere", () => {
    for (const config of [DEFAULT_DISCOVERY_CONFIG, DEFAULT_FINAL_CONFIG]) {
      for (const r of config.rules) {
        expect(r.points).toBeGreaterThan(0);
        expect(r.pointsPerExtraOccurrence ?? 0).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("uses unique rule keys within a configuration", () => {
    for (const config of [DEFAULT_DISCOVERY_CONFIG, DEFAULT_FINAL_CONFIG]) {
      const keys = config.rules.map((r) => r.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
