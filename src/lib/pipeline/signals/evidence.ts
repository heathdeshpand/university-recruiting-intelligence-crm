import type { AssertionKind, Confidence, EvidenceType, SourceType } from "@prisma/client";
import { fingerprint } from "@/lib/util/hash";
import { containsAnyPhrase, containsPhrase, longestMatchingPhrase } from "@/lib/util/text";
import {
  CAREER_TRANSITION_PHRASES,
  JOB_SEARCH_PHRASES,
  ORGANIZATION_RULES,
  ROLE_SIGNAL_MAP,
  WORK_EXPERIENCE_RULES,
} from "@/lib/config/organizations";

/**
 * Evidence construction.
 *
 * Evidence is the bridge between "a page said this" and "this candidate has
 * that signal". Every evidence row carries the source it came from, the
 * original value, and whether the statement is a fact the source asserted or
 * an inference the system drew from it.
 *
 * The FACT / INFERENCE distinction is load-bearing. "Listed as treasurer of
 * the Entrepreneurship Club" is a fact -- the directory says so. "Has
 * leadership experience" is an inference from that fact. The product shows
 * both and never presents the second as the first.
 */

export interface EvidenceInput {
  normalizedRecordId: string;
  sourceId: string;
  sourceUrl: string | null;
  sourceType: SourceType;
  organization: string | null;
  organizationCanonical: string | null;
  organizationCategory: SourceType | null;
  role: string | null;
  roleCanonical: string | null;
  isLeadershipRole: boolean;
  sport: string | null;
  sportCanonical: string | null;
  major: string | null;
  majorCanonical: string | null;
  graduationYear: number | null;
  /** Free text the source published verbatim about this person. */
  note: string | null;
}

export interface BuiltEvidence {
  evidenceType: EvidenceType;
  assertionKind: AssertionKind;
  statement: string;
  originalValue: string | null;
  confidence: Confidence;
  sourceId: string;
  sourceUrl: string | null;
  normalizedRecordId: string;
  fingerprint: string;
  /** Signal keys this evidence supports, with the organization it relates to. */
  signals: Array<{ key: string; subject: string | null }>;
}

/** Source types whose rosters are, by themselves, strong evidence. */
const GREEK_TYPES: SourceType[] = ["GREEK_LIFE", "FRATERNITY", "SORORITY"];

function make(
  input: EvidenceInput,
  fields: {
    evidenceType: EvidenceType;
    statement: string;
    originalValue: string | null;
    confidence?: Confidence;
    assertionKind?: AssertionKind;
    signals: Array<{ key: string; subject: string | null }>;
  },
): BuiltEvidence {
  return {
    evidenceType: fields.evidenceType,
    assertionKind: fields.assertionKind ?? "FACT",
    statement: fields.statement,
    originalValue: fields.originalValue,
    confidence: fields.confidence ?? "MEDIUM",
    sourceId: input.sourceId,
    sourceUrl: input.sourceUrl,
    normalizedRecordId: input.normalizedRecordId,
    fingerprint: fingerprint({
      type: fields.evidenceType,
      statement: fields.statement,
      source: input.sourceId,
    }),
    signals: fields.signals,
  };
}

/**
 * Derives every piece of evidence a single normalized record supports.
 *
 * The category a signal comes from is decided by the *organization*, not the
 * page it was found on, wherever the organization name is informative. A
 * sales club listed in a general student-organization directory still yields
 * a sales signal.
 */
export function buildEvidence(input: EvidenceInput): BuiltEvidence[] {
  const evidence: BuiltEvidence[] = [];
  const org = input.organization?.trim() || null;
  const category = input.organizationCategory ?? input.sourceType;

  // --- Organization membership --------------------------------------------
  //
  // A news or awards page has no membership meaning: the heading above a
  // student profile is the name of the article series, not an organization
  // the student belongs to. Treating it as one would manufacture involvement
  // that the source never claimed.
  const orgIsMeaningful = input.sourceType !== "NEWS_OR_AWARDS";

  if (org && orgIsMeaningful) {
    const isGreek = GREEK_TYPES.includes(category);
    const isClubSport = category === "CLUB_SPORT";
    const isVarsity = category === "ATHLETICS";
    const isIntramural = category === "INTRAMURAL";

    if (isGreek) {
      evidence.push(
        make(input, {
          evidenceType: "GREEK_MEMBERSHIP",
          statement: `Listed as a member of ${org}`,
          originalValue: org,
          confidence: "HIGH",
          signals: [
            { key: "GREEK_MEMBERSHIP", subject: input.organizationCanonical },
            { key: "ORG_MEMBERSHIP", subject: input.organizationCanonical },
            { key: "MULTIPLE_ORGS", subject: input.organizationCanonical },
          ],
        }),
      );
    } else if (isVarsity) {
      evidence.push(
        make(input, {
          evidenceType: "VARSITY_ATHLETICS",
          statement: `Listed on the ${org} varsity roster`,
          originalValue: org,
          confidence: "HIGH",
          signals: [{ key: "VARSITY_ATHLETICS", subject: input.sportCanonical ?? input.organizationCanonical }],
        }),
      );
    } else if (isClubSport) {
      evidence.push(
        make(input, {
          evidenceType: "CLUB_SPORT_MEMBERSHIP",
          statement: `Listed on the ${org} roster`,
          originalValue: org,
          confidence: "HIGH",
          signals: [
            { key: "CLUB_SPORT", subject: input.sportCanonical ?? input.organizationCanonical },
            { key: "ORG_MEMBERSHIP", subject: input.organizationCanonical },
            { key: "MULTIPLE_ORGS", subject: input.organizationCanonical },
          ],
        }),
      );
    } else if (isIntramural) {
      evidence.push(
        make(input, {
          evidenceType: "INTRAMURAL_PARTICIPATION",
          statement: `Listed in intramural participation for ${org}`,
          originalValue: org,
          signals: [{ key: "INTRAMURAL", subject: input.organizationCanonical }],
        }),
      );
    } else {
      const categorySignals = signalsForOrganization(org, category);
      evidence.push(
        make(input, {
          evidenceType: "ORGANIZATION_MEMBERSHIP",
          statement: `Listed as a member of ${org}`,
          originalValue: org,
          signals: [
            { key: "ORG_MEMBERSHIP", subject: input.organizationCanonical },
            { key: "MULTIPLE_ORGS", subject: input.organizationCanonical },
            ...categorySignals.map((key) => ({ key, subject: input.organizationCanonical })),
          ],
        }),
      );
    }
  }

  // --- Leadership ----------------------------------------------------------
  if (input.role && input.isLeadershipRole) {
    const title = input.roleCanonical ?? input.role;
    const where = org ? ` of ${org}` : "";
    const isFounder = /founder/i.test(title);

    evidence.push(
      make(input, {
        evidenceType: "LEADERSHIP_ROLE",
        statement: `Listed as ${title}${where}`,
        originalValue: input.role,
        confidence: "HIGH",
        signals: [
          { key: "LEADERSHIP_ROLE", subject: input.organizationCanonical },
          { key: "MULTIPLE_LEADERSHIP", subject: input.organizationCanonical },
          ...(isFounder ? [{ key: "FOUNDER", subject: input.organizationCanonical }] : []),
        ],
      }),
    );

    // Some roles are themselves documented experience: a recruitment chair
    // has recruited, a philanthropy chair has fundraised.
    const roleLower = input.role.toLowerCase();
    for (const rule of ROLE_SIGNAL_MAP) {
      if (rule.keywords.some((k) => containsPhrase(roleLower, k))) {
        evidence.push(
          make(input, {
            evidenceType: "WORK_EXPERIENCE",
            statement: `Held the role of ${title}${where}`,
            originalValue: input.role,
            signals: rule.signals.map((key) => ({ key, subject: input.organizationCanonical })),
          }),
        );
      }
    }
  }

  // --- Academic ------------------------------------------------------------
  if (input.majorCanonical) {
    evidence.push(
      make(input, {
        evidenceType: "ACADEMIC_PROGRAM",
        statement: `Listed as a ${input.majorCanonical} major`,
        originalValue: input.major,
        signals: [],
      }),
    );
  }

  if (input.graduationYear) {
    evidence.push(
      make(input, {
        evidenceType: "GRADUATION_YEAR",
        statement: `Listed with a graduation year of ${input.graduationYear}`,
        originalValue: String(input.graduationYear),
        signals: [],
      }),
    );
  }

  // --- Published free text --------------------------------------------------
  // Work-experience and job-search signals come only from here, because they
  // must be things a source explicitly stated rather than things inferred
  // from a person's memberships.
  if (input.note) {
    const noteLower = input.note.toLowerCase();

    for (const rule of WORK_EXPERIENCE_RULES) {
      const hit = longestMatchingPhrase(noteLower, rule.keywords);
      if (!hit) continue;
      evidence.push(
        make(input, {
          evidenceType: "WORK_EXPERIENCE",
          statement: `Publicly described experience: "${truncate(input.note, 180)}"`,
          originalValue: input.note,
          confidence: "MEDIUM",
          signals: rule.signals.map((key) => ({ key, subject: hit })),
        }),
      );
    }

    if (containsAnyPhrase(noteLower, JOB_SEARCH_PHRASES)) {
      evidence.push(
        make(input, {
          evidenceType: "JOB_SEARCH_STATEMENT",
          statement: `Publicly stated they are seeking a role: "${truncate(input.note, 180)}"`,
          originalValue: input.note,
          confidence: "HIGH",
          signals: [{ key: "JOB_SEEKING", subject: null }],
        }),
      );
    }

    if (containsAnyPhrase(noteLower, CAREER_TRANSITION_PHRASES)) {
      evidence.push(
        make(input, {
          evidenceType: "JOB_SEARCH_STATEMENT",
          statement: `Publicly stated a career transition: "${truncate(input.note, 180)}"`,
          originalValue: input.note,
          confidence: "MEDIUM",
          signals: [{ key: "CAREER_TRANSITION", subject: null }],
        }),
      );
    }
  }

  return evidence;
}

/**
 * Signal keys implied by an organization.
 *
 * The organization's own name is consulted first, because it is more precise
 * than the category: a real estate club yields both a real-estate and a
 * business signal, which the coarser category alone would lose.
 */
function signalsForOrganization(organization: string, category: SourceType): string[] {
  const lower = organization.toLowerCase();
  const fromName = ORGANIZATION_RULES.filter((rule) =>
    rule.keywords.some((k) => containsPhrase(lower, k)),
  ).flatMap((rule) => rule.signals);

  const fromCategory = signalsForCategory(category);
  return [...new Set([...fromName, ...fromCategory])];
}

/** Fallback: signal keys implied by a source category alone. */
function signalsForCategory(category: SourceType): string[] {
  switch (category) {
    case "SALES_ORGANIZATION":
      return ["SALES_ORG"];
    case "ENTREPRENEURSHIP":
      return ["ENTREPRENEURSHIP_ORG"];
    case "BUSINESS_ORGANIZATION":
      return ["BUSINESS_ORG"];
    case "COMPETITIVE_ORGANIZATION":
      return ["COMPETITIVE_ORG"];
    case "PROFESSIONAL_ORGANIZATION":
      return ["PROFESSIONAL_ORG"];
    case "HONOR_SOCIETY":
      return ["HONOR_SOCIETY"];
    case "STUDENT_GOVERNMENT":
      return ["STUDENT_GOVERNMENT"];
    default:
      return [];
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
