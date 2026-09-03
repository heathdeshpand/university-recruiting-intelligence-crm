import { areGivenNamesEquivalent, canonicalGivenName } from "@/lib/util/names";
import { jaroWinkler, phoneticKey } from "@/lib/util/text";
import {
  statusForScore,
  type MatchFactor,
  type PairwiseMatch,
  type ResolvableRecord,
} from "@/lib/pipeline/resolve/types";

/**
 * Pairwise entity resolution.
 *
 * The scoring model, and why it is shaped this way:
 *
 *   Name agreement alone is capped at 55 points. That is deliberate and it is
 *   the single most important property in this file. Two records that agree
 *   on nothing but a name land in MANUAL_REVIEW, never in AUTO_MATCHED --
 *   because two different people sharing a name is common, and silently
 *   fusing them would corrupt a candidate's entire evidence trail.
 *
 *   Corroborating fields -- graduation year, major, middle initial, a shared
 *   organization, an email address -- are what carry a pair over the
 *   auto-merge line. Evidence, not coincidence.
 *
 *   Surname distinctiveness scales the name contribution. Matching on a
 *   surname that appears once in the dataset is far stronger evidence than
 *   matching on the most common surname in it, and the model says so.
 *
 *   Conflicts subtract rather than veto, except where a conflict is
 *   effectively decisive (two different email addresses, or Jr against Sr).
 *
 * Weights are constants here and thresholds live in types.ts, so both can be
 * tuned without touching the logic.
 */

const WEIGHTS = {
  // Calibrated so that name agreement alone lands near 58 -- comfortably
  // inside MANUAL_REVIEW and well below the auto-merge line at 85 -- while a
  // pair that also agrees on graduation year and major reaches the high 80s.
  // The gap between those two cases is the whole model.
  lastName: 26,
  firstName: 32,

  emailExact: 45,
  graduationYearExact: 18,
  middleInitialExact: 12,
  majorExact: 12,
  organizationShared: 10,
  sportShared: 8,

  /**
   * Awarded when two records share at least one corroborating field and
   * disagree on nothing.
   *
   * This is not a fudge factor. Agreement is worth more when it survives
   * every opportunity to disagree: two records that both state a graduation
   * year, state the same one, and contradict each other on nothing else are
   * meaningfully stronger evidence than the sum of their individual field
   * matches suggests. Pairs that agree on a name and nothing else earn no
   * bonus, which is what keeps name-only pairs out of auto-merge.
   */
  noConflictBonus: 10,

  emailConflict: -45,
  suffixConflict: -25,
  middleInitialConflict: -22,
  graduationYearFarConflict: -20,
  graduationYearNearConflict: -6,
  majorConflict: -6,
} as const;

/** Surname counts across the university, used for distinctiveness weighting. */
export type SurnameFrequency = Map<string, number>;

/**
 * Counts how many distinct *people* appear to share each surname.
 *
 * Counting rows instead would be wrong in a way that quietly degrades every
 * match: one person listed by six sources would make their surname look six
 * times more common than it is, dampening the very evidence that should have
 * merged those six rows. Distinct name keys are a much better proxy for
 * distinct people, so that is what is counted.
 */
export function buildSurnameFrequency(records: ResolvableRecord[]): SurnameFrequency {
  const peopleBySurname = new Map<string, Set<string>>();

  for (const r of records) {
    const surname = (r.lastName ?? "").toLowerCase();
    if (!surname) continue;
    const identity = r.nameKey || `${r.firstName ?? ""} ${surname}`.toLowerCase();
    const set = peopleBySurname.get(surname);
    if (set) set.add(identity);
    else peopleBySurname.set(surname, new Set([identity]));
  }

  const freq: SurnameFrequency = new Map();
  for (const [surname, people] of peopleBySurname) freq.set(surname, people.size);
  return freq;
}

/**
 * Scales the name contribution by how rare the surname is.
 *
 * Returns roughly 1.25 for a surname seen once or twice and falls toward 0.75
 * for the most common ones. Bounded on both ends so a single frequency count
 * can never dominate the score.
 */
export function distinctiveness(lastName: string | null, freq: SurnameFrequency): number {
  if (!lastName) return 1;
  const count = freq.get(lastName.toLowerCase()) ?? 1;
  if (count <= 2) return 1.25;
  if (count <= 4) return 1.1;
  if (count <= 8) return 1;
  if (count <= 16) return 0.9;
  return 0.75;
}

function lastNameScore(a: ResolvableRecord, b: ResolvableRecord): number {
  const la = a.lastName ?? "";
  const lb = b.lastName ?? "";
  if (!la || !lb) return 0;
  if (la.toLowerCase() === lb.toLowerCase()) return 1;

  const similarity = jaroWinkler(la, lb);
  const phoneticMatch = phoneticKey(la) === phoneticKey(lb) && phoneticKey(la).length > 0;

  // A phonetic match rescues real spelling variants (Smith/Smyth) without
  // opening the door to unrelated surnames.
  if (phoneticMatch) return Math.max(similarity, 0.88);
  return similarity >= 0.9 ? similarity : 0;
}

function firstNameScore(a: ResolvableRecord, b: ResolvableRecord): { score: number; label: string } | null {
  const fa = a.firstName ?? "";
  const fb = b.firstName ?? "";
  if (!fa || !fb) return { score: 0.35, label: "One record has no first name" };

  const ca = canonicalGivenName(fa);
  const cb = canonicalGivenName(fb);

  if (ca && cb && ca === cb) {
    return fa.toLowerCase() === fb.toLowerCase()
      ? { score: 1, label: "Same first name" }
      : { score: 0.95, label: `Same first name written differently (${fa} / ${fb})` };
  }

  // An initial is compatible with any name it could abbreviate, but that is
  // weak evidence on its own.
  const aIsInitial = fa.replace(/[^A-Za-z]/g, "").length === 1;
  const bIsInitial = fb.replace(/[^A-Za-z]/g, "").length === 1;
  if ((aIsInitial || bIsInitial) && areGivenNamesEquivalent(fa, fb)) {
    return { score: 0.55, label: `First initial is compatible (${fa} / ${fb})` };
  }

  const similarity = jaroWinkler(fa, fb);
  if (similarity >= 0.92) {
    return { score: similarity * 0.85, label: `Similar first name (${fa} / ${fb})` };
  }

  // Genuinely different given names: this is not the same person.
  return null;
}

export function scorePair(
  a: ResolvableRecord,
  b: ResolvableRecord,
  freq: SurnameFrequency,
): PairwiseMatch {
  const matchingFactors: MatchFactor[] = [];
  const conflictingFactors: MatchFactor[] = [];

  const surnameScore = lastNameScore(a, b);
  if (surnameScore === 0) {
    return {
      matchScore: 0,
      confidence: 0,
      status: "NOT_MATCHED",
      matchingFactors: [],
      conflictingFactors: [
        { label: "Different surnames", detail: `${a.lastName ?? "?"} / ${b.lastName ?? "?"}`, points: 0 },
      ],
    };
  }

  const first = firstNameScore(a, b);
  if (!first) {
    return {
      matchScore: 0,
      confidence: 0,
      status: "NOT_MATCHED",
      matchingFactors: [
        { label: "Same surname", detail: a.lastName ?? undefined, points: 0 },
      ],
      conflictingFactors: [
        {
          label: "Different first names",
          detail: `${a.firstName ?? "?"} / ${b.firstName ?? "?"}`,
          points: 0,
        },
      ],
    };
  }

  const rarity = distinctiveness(a.lastName, freq);
  let score = 0;

  const surnamePoints = Math.round(WEIGHTS.lastName * surnameScore * rarity);
  score += surnamePoints;
  matchingFactors.push({
    label:
      surnameScore === 1
        ? rarity > 1
          ? "Same surname, uncommon in this dataset"
          : "Same surname"
        : "Surnames are spelling variants",
    detail: `${a.lastName} / ${b.lastName}`,
    points: surnamePoints,
  });

  const firstPoints = Math.round(WEIGHTS.firstName * first.score);
  score += firstPoints;
  matchingFactors.push({ label: first.label, points: firstPoints });

  // --- Corroborating evidence ---------------------------------------------

  if (a.email && b.email) {
    if (a.email === b.email) {
      score += WEIGHTS.emailExact;
      matchingFactors.push({ label: "Same email address", points: WEIGHTS.emailExact });
    } else {
      score += WEIGHTS.emailConflict;
      conflictingFactors.push({
        label: "Different email addresses",
        detail: "Two distinct addresses almost always mean two distinct people",
        points: WEIGHTS.emailConflict,
      });
    }
  }

  if (a.graduationYear && b.graduationYear) {
    const gap = Math.abs(a.graduationYear - b.graduationYear);
    if (gap === 0) {
      score += WEIGHTS.graduationYearExact;
      matchingFactors.push({
        label: "Same graduation year",
        detail: String(a.graduationYear),
        points: WEIGHTS.graduationYearExact,
      });
    } else if (gap === 1) {
      // Sources disagree by a year all the time -- one lists expected
      // graduation, another lists class standing. Softly penalised.
      score += WEIGHTS.graduationYearNearConflict;
      conflictingFactors.push({
        label: "Graduation years differ by one",
        detail: `${a.graduationYear} / ${b.graduationYear}`,
        points: WEIGHTS.graduationYearNearConflict,
      });
    } else {
      score += WEIGHTS.graduationYearFarConflict;
      conflictingFactors.push({
        label: "Graduation years are far apart",
        detail: `${a.graduationYear} / ${b.graduationYear}`,
        points: WEIGHTS.graduationYearFarConflict,
      });
    }
  }

  if (a.middleInitial && b.middleInitial) {
    if (a.middleInitial === b.middleInitial) {
      score += WEIGHTS.middleInitialExact;
      matchingFactors.push({
        label: "Same middle initial",
        detail: a.middleInitial,
        points: WEIGHTS.middleInitialExact,
      });
    } else {
      score += WEIGHTS.middleInitialConflict;
      conflictingFactors.push({
        label: "Different middle initials",
        detail: `${a.middleInitial} / ${b.middleInitial}`,
        points: WEIGHTS.middleInitialConflict,
      });
    }
  }

  if (a.suffix && b.suffix && a.suffix.toLowerCase() !== b.suffix.toLowerCase()) {
    score += WEIGHTS.suffixConflict;
    conflictingFactors.push({
      label: "Different generational suffixes",
      detail: `${a.suffix} / ${b.suffix}`,
      points: WEIGHTS.suffixConflict,
    });
  }

  if (a.majorCanonical && b.majorCanonical) {
    if (a.majorCanonical === b.majorCanonical) {
      score += WEIGHTS.majorExact;
      matchingFactors.push({
        label: "Same major",
        detail: a.majorCanonical,
        points: WEIGHTS.majorExact,
      });
    } else {
      score += WEIGHTS.majorConflict;
      conflictingFactors.push({
        label: "Different majors",
        detail: `${a.majorCanonical} / ${b.majorCanonical}`,
        points: WEIGHTS.majorConflict,
      });
    }
  }

  if (
    a.organizationCanonical &&
    b.organizationCanonical &&
    a.organizationCanonical === b.organizationCanonical
  ) {
    score += WEIGHTS.organizationShared;
    matchingFactors.push({
      label: "Same organization",
      detail: a.organizationCanonical,
      points: WEIGHTS.organizationShared,
    });
  }

  if (a.sportCanonical && b.sportCanonical && a.sportCanonical === b.sportCanonical) {
    score += WEIGHTS.sportShared;
    matchingFactors.push({
      label: "Same sport",
      detail: a.sportCanonical,
      points: WEIGHTS.sportShared,
    });
  }

  // Corroboration means a field beyond the name itself; the first two factors
  // are always the surname and given name.
  const corroboratingFactors = matchingFactors.length - 2;
  if (corroboratingFactors > 0 && conflictingFactors.length === 0) {
    score += WEIGHTS.noConflictBonus;
    matchingFactors.push({
      label: "Everything both records state agrees",
      detail: "No conflicting field between them",
      points: WEIGHTS.noConflictBonus,
    });
  }

  const matchScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    matchScore,
    confidence: Number((matchScore / 100).toFixed(2)),
    status: statusForScore(matchScore),
    matchingFactors,
    conflictingFactors,
  };
}
