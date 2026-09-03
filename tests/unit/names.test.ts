import { describe, it, expect } from "vitest";
import {
  areGivenNamesEquivalent,
  canonicalGivenName,
  looksLikePersonName,
  parseName,
} from "@/lib/util/names";

describe("canonicalGivenName", () => {
  it("expands common nicknames", () => {
    expect(canonicalGivenName("Mike")).toBe("michael");
    expect(canonicalGivenName("Bob")).toBe("robert");
    expect(canonicalGivenName("Liz")).toBe("elizabeth");
  });

  it("folds spelling variants", () => {
    expect(canonicalGivenName("Kathryn")).toBe(canonicalGivenName("Catherine"));
    expect(canonicalGivenName("Stephen")).toBe(canonicalGivenName("Steven"));
  });

  it("leaves unknown names alone", () => {
    expect(canonicalGivenName("Priyanka")).toBe("priyanka");
  });

  it("returns empty string for non-alphabetic input", () => {
    expect(canonicalGivenName("123")).toBe("");
  });
});

describe("areGivenNamesEquivalent", () => {
  it("matches a nickname to its full form", () => {
    expect(areGivenNamesEquivalent("Mike", "Michael")).toBe(true);
  });

  it("matches an initial to a compatible name", () => {
    expect(areGivenNamesEquivalent("M", "Michael")).toBe(true);
  });

  it("rejects different names", () => {
    expect(areGivenNamesEquivalent("Michael", "Matthew")).toBe(false);
  });

  it("rejects an initial that does not fit", () => {
    expect(areGivenNamesEquivalent("J", "Michael")).toBe(false);
  });
});

describe("parseName", () => {
  it("parses a plain first/last name", () => {
    const n = parseName("Michael Johnson");
    expect(n.first).toBe("Michael");
    expect(n.last).toBe("Johnson");
    expect(n.middleInitial).toBeUndefined();
    expect(n.key).toBe("michael johnson");
  });

  it("extracts a middle initial", () => {
    const n = parseName("Michael A. Johnson");
    expect(n.first).toBe("Michael");
    expect(n.middleInitial).toBe("A");
    expect(n.last).toBe("Johnson");
    expect(n.display).toBe("Michael A. Johnson");
  });

  it("gives a nickname the same key as the full name", () => {
    expect(parseName("Mike Johnson").key).toBe(parseName("Michael Johnson").key);
  });

  it("handles 'Last, First' order", () => {
    const n = parseName("Johnson, Michael A.");
    expect(n.first).toBe("Michael");
    expect(n.last).toBe("Johnson");
    expect(n.middleInitial).toBe("A");
  });

  it("strips class-year annotations", () => {
    const n = parseName("Michael Johnson '27");
    expect(n.first).toBe("Michael");
    expect(n.last).toBe("Johnson");
  });

  it("strips parenthetical roles", () => {
    const n = parseName("Michael Johnson (President)");
    expect(n.last).toBe("Johnson");
    expect(n.display).toBe("Michael Johnson");
  });

  it("captures a generational suffix", () => {
    const n = parseName("Michael Johnson Jr.");
    expect(n.last).toBe("Johnson");
    expect(n.suffix).toBe("Jr");
  });

  it("drops honorifics", () => {
    const n = parseName("Dr. Michael Johnson");
    expect(n.first).toBe("Michael");
    expect(n.last).toBe("Johnson");
  });

  it("normalizes case and accents", () => {
    const n = parseName("JOSÉ NÚÑEZ");
    expect(n.first).toBe("Jose");
    expect(n.last).toBe("Nunez");
  });

  it("degrades gracefully on unusable input", () => {
    const n = parseName("   ");
    expect(n.key).toBe("");
  });
});

describe("looksLikePersonName", () => {
  it("accepts ordinary names", () => {
    expect(looksLikePersonName("Michael Johnson")).toBe(true);
    expect(looksLikePersonName("Priyanka Rao")).toBe(true);
    expect(looksLikePersonName("MICHAEL JOHNSON")).toBe(true);
  });

  it("rejects page furniture and navigation labels", () => {
    expect(looksLikePersonName("Click here")).toBe(false);
    expect(looksLikePersonName("Contact Us")).toBe(false);
    expect(looksLikePersonName("Read More")).toBe(false);
    expect(looksLikePersonName("Department of Economics")).toBe(false);
  });

  it("rejects single words and long sentences", () => {
    expect(looksLikePersonName("Johnson")).toBe(false);
    expect(
      looksLikePersonName("Our chapter was founded in eighteen ninety and has grown since"),
    ).toBe(false);
  });

  it("rejects URLs and email addresses", () => {
    expect(looksLikePersonName("mjohnson@example.edu")).toBe(false);
    expect(looksLikePersonName("https://example.edu/roster")).toBe(false);
  });
});
