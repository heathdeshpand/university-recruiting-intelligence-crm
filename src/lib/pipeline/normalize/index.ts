import type { SourceType } from "@prisma/client";
import { parseName } from "@/lib/util/names";
import {
  containsPhrase,
  longestMatchingPhrase,
  normalizeWhitespace,
  phoneticKey,
  stripDiacritics,
  titleCase,
} from "@/lib/util/text";
import { looksLikePersonName } from "@/lib/util/names";
import {
  GREEK_LETTERS,
  LEADERSHIP_ROLES,
  ORGANIZATION_RULES,
  SPORT_ALIASES,
} from "@/lib/config/organizations";

/**
 * Normalization.
 *
 * Turns a raw record into a comparable one without ever destroying what the
 * source actually said. Every function here returns a canonical form; the
 * original value is stored alongside it on the NormalizedRecord row, and the
 * untouched original stays on the RawRecord below that.
 *
 * The reason to keep both is not tidiness. When entity resolution decides two
 * records describe the same person, a recruiter needs to see the two original
 * strings to judge whether it got that right.
 */

export interface NormalizedFields {
  normalizedName: string;
  firstName?: string;
  middleInitial?: string;
  lastName?: string;
  suffix?: string;
  nameKey: string;
  lastNamePhonetic?: string;

  organization?: string;
  organizationCanonical?: string;
  organizationCategory?: SourceType;
  role?: string;
  roleCanonical?: string;
  isLeadershipRole: boolean;
  sport?: string;
  sportCanonical?: string;
  major?: string;
  majorCanonical?: string;
  graduationYear?: number;
  email?: string;
}

/**
 * Canonicalizes an organization name.
 *
 * Chapter suffixes, "the", and punctuation vary between every page that
 * mentions the same organization, so they are stripped for comparison while
 * the display form keeps its original capitalisation.
 */
export function canonicalizeOrganization(raw: string): string {
  return stripDiacritics(raw)
    .toLowerCase()
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\b(chapter|colony|club|society|association|organization|organisation|team|at|of)\b/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Which discovery category an organization name belongs to, if any. */
export function categorizeOrganization(raw: string): SourceType | undefined {
  const lower = raw.toLowerCase();

  for (const rule of ORGANIZATION_RULES) {
    if (rule.keywords.some((k) => containsPhrase(lower, k))) return rule.sourceType;
  }

  // Greek letters alone are ambiguous -- honor societies and professional
  // fraternities use them too -- so this only fires on a name that is
  // *entirely* Greek letters, which chapter names typically are.
  const words = canonicalizeOrganization(raw).split(" ").filter(Boolean);
  if (words.length >= 2 && words.every((w) => GREEK_LETTERS.includes(w))) {
    return "GREEK_LIFE";
  }

  return undefined;
}

/** Maps a free-text role onto a canonical leadership title, if it is one. */
export function canonicalizeRole(raw: string): { canonical?: string; isLeadership: boolean } {
  const lower = normalizeWhitespace(raw).toLowerCase();
  if (!lower) return { isLeadership: false };

  // The longest *matched* keyword wins, not the longest keyword in a group.
  // "Vice President" matches both "president" and "vice president"; ranking by
  // what actually matched is what stops it collapsing into "President".
  let best: { canonical: string; matched: string } | undefined;

  for (const role of LEADERSHIP_ROLES) {
    const matched = longestMatchingPhrase(lower, role.keywords);
    if (!matched) continue;
    if (!best || matched.length > best.matched.length) {
      best = { canonical: role.canonical, matched };
    }
  }

  if (best) return { canonical: best.canonical, isLeadership: true };

  return { canonical: titleCase(raw), isLeadership: false };
}

export function canonicalizeSport(raw: string): string | undefined {
  const key = stripDiacritics(raw)
    .toLowerCase()
    // Apostrophes are deleted rather than spaced, so "men's" does not become
    // the two tokens "men" and "s".
    .replace(/['\u2019]/g, "")
    .replace(/\b(club|varsity|intramural|team|roster|mens|womens|men|women|coed)\b/g, " ")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!key) return undefined;
  return SPORT_ALIASES[key] ?? titleCase(key);
}

export function canonicalizeMajor(raw: string): string | undefined {
  const clean = normalizeWhitespace(raw)
    .replace(/\b(major|minor|b\.?[as]\.?|bs|ba|degree|program(me)?)\b/gi, " ")
    .replace(/[^A-Za-z& ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length >= 2 ? titleCase(clean) : undefined;
}

/**
 * Parses a graduation year from whatever the source wrote.
 *
 * Accepts "2027", "'27", "Class of 2027". Rejects anything outside a
 * plausible window, because a stray four-digit number in a roster cell is far
 * more often a phone extension or a founding year than a graduation year.
 */
export function parseGraduationYear(raw: string, now = new Date()): number | undefined {
  const text = normalizeWhitespace(raw);
  if (!text) return undefined;

  const currentYear = now.getFullYear();
  const min = currentYear - 10;
  const max = currentYear + 8;

  const full = text.match(/\b(19|20)\d{2}\b/);
  if (full) {
    const year = Number.parseInt(full[0], 10);
    return year >= min && year <= max ? year : undefined;
  }

  const short = text.match(/['’]?(\d{2})\b/);
  if (short?.[1]) {
    const n = Number.parseInt(short[1], 10);
    const year = n > 50 ? 1900 + n : 2000 + n;
    return year >= min && year <= max ? year : undefined;
  }

  return undefined;
}

export function normalizeEmail(raw: string): string | undefined {
  const match = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match?.[0]?.toLowerCase();
}

export interface RawRecordInput {
  rawName: string | null;
  rawOrganization: string | null;
  rawRole: string | null;
  rawMajor: string | null;
  rawYear: string | null;
  rawSport: string | null;
  rawPayload?: unknown;
}

/** Normalizes one raw record. Returns null when it has no usable name. */
export function normalizeRecord(raw: RawRecordInput, now = new Date()): NormalizedFields | null {
  if (!raw.rawName) return null;

  // Page furniture that an extractor mistook for a name must not become a
  // person. Rejecting it here keeps it out of entity resolution entirely,
  // while the raw record survives as evidence of what the extractor saw.
  if (!looksLikePersonName(raw.rawName)) return null;

  const parsed = parseName(raw.rawName);
  if (!parsed.last || !parsed.key) return null;

  const organization = raw.rawOrganization ? normalizeWhitespace(raw.rawOrganization) : undefined;
  const role = raw.rawRole ? normalizeWhitespace(raw.rawRole) : undefined;
  const roleInfo = role ? canonicalizeRole(role) : { isLeadership: false };
  const sport = raw.rawSport ? normalizeWhitespace(raw.rawSport) : undefined;
  const major = raw.rawMajor ? normalizeWhitespace(raw.rawMajor) : undefined;

  return {
    normalizedName: parsed.display,
    firstName: parsed.first,
    middleInitial: parsed.middleInitial,
    lastName: parsed.last,
    suffix: parsed.suffix,
    nameKey: parsed.key,
    lastNamePhonetic: phoneticKey(parsed.last),

    organization,
    organizationCanonical: organization ? canonicalizeOrganization(organization) : undefined,
    organizationCategory: organization ? categorizeOrganization(organization) : undefined,
    role,
    roleCanonical: roleInfo.canonical,
    isLeadershipRole: roleInfo.isLeadership,
    sport,
    sportCanonical: sport ? canonicalizeSport(sport) : undefined,
    major,
    majorCanonical: major ? canonicalizeMajor(major) : undefined,
    graduationYear: raw.rawYear ? parseGraduationYear(raw.rawYear, now) : undefined,
  };
}
