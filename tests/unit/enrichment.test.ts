import { describe, it, expect } from "vitest";
import {
  AMBIGUITY_MARGIN,
  DIRECTORY_MATCH_THRESHOLD,
  enrichCandidate,
  type EnrichableCandidate,
} from "@/lib/pipeline/enrich/match";
import type { DirectoryIndex } from "@/lib/pipeline/enrich/types";
import { phoneticKey } from "@/lib/util/text";
import type { ResolvableRecord } from "@/lib/pipeline/resolve/types";

interface Entry extends ResolvableRecord {
  major: string | null;
}

function entry(
  id: string,
  first: string,
  last: string,
  extras: Partial<Entry> = {},
): Entry {
  return {
    id,
    normalizedName: `${first} ${last}`,
    firstName: first,
    middleInitial: null,
    lastName: last,
    suffix: null,
    nameKey: `${first.toLowerCase()} ${last.toLowerCase()}`,
    lastNamePhonetic: phoneticKey(last),
    organizationCanonical: null,
    sportCanonical: null,
    majorCanonical: null,
    graduationYear: null,
    email: null,
    sourceId: "directory-1",
    major: null,
    ...extras,
  };
}

function directory(entries: Entry[]): DirectoryIndex {
  const byPhonetic = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = e.lastNamePhonetic ?? "";
    const list = byPhonetic.get(key);
    if (list) list.push(e);
    else byPhonetic.set(key, [e]);
  }
  return {
    sourceId: "directory-1",
    sourceName: "Public student directory",
    sourceUrl: "https://esu.example.edu/directory/students",
    entries,
    byPhonetic,
  };
}

function candidate(overrides: Partial<EnrichableCandidate> = {}): EnrichableCandidate {
  return {
    id: "cand-1",
    canonicalName: "Michael Johnson",
    firstName: "Michael",
    middleInitial: null,
    lastName: "Johnson",
    major: null,
    graduationYear: null,
    email: null,
    ...overrides,
  };
}

describe("enrichCandidate — successful matches", () => {
  it("matches a confident directory entry and returns only published fields", () => {
    const dir = directory([
      entry("d1", "Michael", "Johnson", {
        middleInitial: "A",
        graduationYear: 2027,
        majorCanonical: "Economics",
        major: "Economics",
        email: "mjohnson7@students.example.edu",
      }),
      entry("d2", "Priyanka", "Rao"),
    ]);

    const result = enrichCandidate(
      candidate({ graduationYear: 2027, major: "Economics" }),
      dir,
    );

    expect(result.outcome).toBe("MATCHED");
    expect(result.matchConfidence).toBeGreaterThanOrEqual(DIRECTORY_MATCH_THRESHOLD);
    expect(result.fields.email).toBe("mjohnson7@students.example.edu");
    expect(result.fields.major).toBe("Economics");
    expect(result.fields.graduationYear).toBe(2027);
    expect(result.matchingFactors.length).toBeGreaterThan(0);
  });

  it("matches through a nickname", () => {
    const dir = directory([
      entry("d1", "Michael", "Johnson", {
        graduationYear: 2027,
        majorCanonical: "Economics",
        email: "mjohnson7@students.example.edu",
      }),
    ]);

    const result = enrichCandidate(
      candidate({ firstName: "Mike", canonicalName: "Mike Johnson", graduationYear: 2027, major: "Economics" }),
      dir,
    );

    expect(result.outcome).toBe("MATCHED");
  });
});

describe("enrichCandidate — refusing to guess", () => {
  it("reports no match when the directory has nobody with that surname", () => {
    const dir = directory([entry("d1", "Priyanka", "Rao"), entry("d2", "Diego", "Torres")]);

    const result = enrichCandidate(candidate(), dir);

    expect(result.outcome).toBe("NO_MATCH");
    expect(result.fields).toEqual({});
    expect(result.message).toContain("comparable surname");
  });

  it("calls two equally good matches ambiguous instead of picking one", () => {
    // Two directory entries for the same name with no distinguishing detail.
    // Guessing here would attach the wrong person's contact details.
    const dir = directory([
      entry("d1", "Michael", "Johnson", { email: "mjohnson1@students.example.edu" }),
      entry("d2", "Michael", "Johnson", { email: "mjohnson2@students.example.edu" }),
    ]);

    const result = enrichCandidate(candidate(), dir);

    expect(result.outcome).toBe("AMBIGUOUS");
    expect(result.fields).toEqual({});
    expect(result.message).toMatch(/ambiguous|manual review|below the/i);
  });

  it("does not accept a weak match", () => {
    // Same surname, and nothing else agrees.
    const dir = directory([
      entry("d1", "Michael", "Johnson", { graduationYear: 2021, majorCanonical: "Biology" }),
    ]);

    const result = enrichCandidate(
      candidate({ graduationYear: 2028, major: "Economics" }),
      dir,
    );

    expect(result.outcome).not.toBe("MATCHED");
    expect(result.fields).toEqual({});
  });

  it("never returns fields for a non-match", () => {
    const dir = directory([entry("d1", "Priyanka", "Rao")]);
    const result = enrichCandidate(candidate(), dir);
    expect(Object.keys(result.fields)).toHaveLength(0);
  });

  it("always names the source it consulted", () => {
    const dir = directory([entry("d1", "Priyanka", "Rao")]);
    expect(enrichCandidate(candidate(), dir).sourceUrl).toContain("esu.example.edu");
  });
});

describe("enrichment thresholds", () => {
  it("keeps the acceptance bar meaningfully high", () => {
    expect(DIRECTORY_MATCH_THRESHOLD).toBeGreaterThanOrEqual(0.8);
    expect(AMBIGUITY_MARGIN).toBeGreaterThan(0);
  });
});
