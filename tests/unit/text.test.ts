import { describe, it, expect } from "vitest";
import {
  jaroWinkler,
  levenshtein,
  levenshteinSimilarity,
  phoneticKey,
  slugify,
  stripDiacritics,
  titleCase,
  tokenOverlap,
  tokenize,
} from "@/lib/util/text";

describe("stripDiacritics", () => {
  it("removes accents but keeps the letters", () => {
    expect(stripDiacritics("José Núñez")).toBe("Jose Nunez");
    expect(stripDiacritics("Chloé")).toBe("Chloe");
  });
});

describe("jaroWinkler", () => {
  it("returns 1 for identical strings", () => {
    expect(jaroWinkler("michael", "michael")).toBe(1);
  });

  it("scores shared-prefix variants highly", () => {
    expect(jaroWinkler("michael", "micheal")).toBeGreaterThan(0.9);
    expect(jaroWinkler("katherine", "kathryn")).toBeGreaterThan(0.85);
  });

  it("scores unrelated names well below name variants", () => {
    // Jaro-Winkler on two short unrelated strings still lands near 0.5,
    // because the transposition term is 1 whenever the few matches are in
    // order. What matters for entity resolution is the gap: a real variant
    // must score far above an unrelated name.
    const unrelated = jaroWinkler("michael", "priyanka");
    const variant = jaroWinkler("michael", "micheal");
    expect(unrelated).toBeLessThan(0.6);
    expect(variant - unrelated).toBeGreaterThan(0.3);
  });

  it("returns 0 when either string is empty", () => {
    expect(jaroWinkler("", "michael")).toBe(0);
    expect(jaroWinkler("michael", "")).toBe(0);
  });

  it("is case insensitive", () => {
    expect(jaroWinkler("Michael", "michael")).toBe(1);
  });
});

describe("levenshtein", () => {
  it("counts single edits", () => {
    expect(levenshtein("johnson", "johnsen")).toBe(1);
    expect(levenshtein("smith", "smyth")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("", "")).toBe(0);
  });

  it("expresses similarity in [0,1]", () => {
    expect(levenshteinSimilarity("smith", "smith")).toBe(1);
    expect(levenshteinSimilarity("smith", "smyth")).toBeCloseTo(0.8, 5);
  });
});

describe("phoneticKey", () => {
  it("gives homophone surnames the same key", () => {
    expect(phoneticKey("Smith")).toBe(phoneticKey("Smyth"));
    expect(phoneticKey("Johnson")).toBe(phoneticKey("Jonson"));
  });

  it("gives clearly different surnames different keys", () => {
    expect(phoneticKey("Johnson")).not.toBe(phoneticKey("Patel"));
  });

  it("is stable and bounded", () => {
    const key = phoneticKey("Wroblewski");
    expect(key.length).toBeGreaterThan(0);
    expect(key.length).toBeLessThanOrEqual(8);
  });

  it("returns an empty key for non-alphabetic input", () => {
    expect(phoneticKey("1234")).toBe("");
  });
});

describe("tokenize and tokenOverlap", () => {
  it("splits on non-alphanumerics", () => {
    expect(tokenize("Sigma Chi -- Alpha Chapter")).toEqual(["sigma", "chi", "alpha", "chapter"]);
  });

  it("measures set overlap", () => {
    expect(tokenOverlap(["sigma", "chi"], ["sigma", "chi"])).toBe(1);
    expect(tokenOverlap(["sigma"], ["delta"])).toBe(0);
    expect(tokenOverlap(["sigma", "chi"], ["sigma", "nu"])).toBeCloseTo(1 / 3, 5);
  });

  it("returns 0 for two empty token lists", () => {
    expect(tokenOverlap([], [])).toBe(0);
  });
});

describe("slugify and titleCase", () => {
  it("slugifies", () => {
    expect(slugify("University of Illinois Urbana-Champaign")).toBe(
      "university-of-illinois-urbana-champaign",
    );
  });

  it("title-cases, including Mc and O' names", () => {
    expect(titleCase("MICHAEL JOHNSON")).toBe("Michael Johnson");
    expect(titleCase("sean mcdonald")).toBe("Sean McDonald");
    expect(titleCase("erin o'brien")).toBe("Erin O'Brien");
  });
});
