/**
 * Signal intersection patterns.
 *
 * These name *combinations* of signals. The language is deliberately factual:
 * a pattern says which signals co-occur, and never draws a conclusion about
 * the person's character, drive, or state of mind. "Four independent campus
 * involvement signals" is a description. "Extremely ambitious" would not be,
 * and is exactly what this product refuses to output.
 *
 * Patterns are descriptive only -- they carry no points of their own. Their
 * value is in the CRM, where they let a recruiter see the shape of a profile
 * at a glance.
 */

export interface SignalPatternDefinition {
  key: string;
  label: string;
  /** All of these signals must be present with value YES. */
  requires: string[];
  /** Optional: at least `minOf` of these must be present. */
  anyOf?: string[];
  minOf?: number;
  description: string;
}

export const SIGNAL_PATTERNS: SignalPatternDefinition[] = [
  {
    key: "GREEK_AND_CLUB_SPORT",
    label: "Greek life + club sport",
    requires: ["GREEK_MEMBERSHIP", "CLUB_SPORT"],
    description: "Appears in both a Greek organization and a club sport roster.",
  },
  {
    key: "SPORT_AND_LEADERSHIP",
    label: "Club sport + leadership",
    requires: ["CLUB_SPORT", "LEADERSHIP_ROLE"],
    description: "Holds a leadership title and appears on a club sport roster.",
  },
  {
    key: "ENTREPRENEURSHIP_AND_LEADERSHIP",
    label: "Entrepreneurship + leadership",
    requires: ["ENTREPRENEURSHIP_ORG", "LEADERSHIP_ROLE"],
    description: "Holds a leadership title in or alongside an entrepreneurship organization.",
  },
  {
    key: "BUSINESS_AND_SALES",
    label: "Business organization + sales organization",
    requires: ["BUSINESS_ORG", "SALES_ORG"],
    description: "Member of both a general business organization and a sales-specific one.",
  },
  {
    key: "SALES_EXPERIENCE_AND_JOB_SEARCH",
    label: "Sales experience + stated job search",
    requires: ["SALES_EXPERIENCE", "JOB_SEEKING"],
    description:
      "Has publicly stated prior sales experience and has publicly stated they are seeking a role.",
  },
  {
    key: "GREEK_SPORT_LEADERSHIP",
    label: "Greek life + club sport + leadership",
    requires: ["GREEK_MEMBERSHIP", "CLUB_SPORT", "LEADERSHIP_ROLE"],
    description: "Three independent involvement signals across distinct organizations.",
  },
  {
    key: "COMPETITIVE_AND_CAREER",
    label: "Competitive activity + career organization",
    requires: ["COMPETITIVE_ORG"],
    anyOf: ["BUSINESS_ORG", "SALES_ORG", "ENTREPRENEURSHIP_ORG", "PROFESSIONAL_ORG"],
    minOf: 1,
    description: "Competes in an organized setting and belongs to a career-oriented organization.",
  },
  {
    key: "BROAD_INVOLVEMENT",
    label: "Four or more independent involvement signals",
    requires: [],
    anyOf: [
      "ORG_MEMBERSHIP", "GREEK_MEMBERSHIP", "CLUB_SPORT", "VARSITY_ATHLETICS",
      "COMPETITIVE_ORG", "STUDENT_GOVERNMENT", "ENTREPRENEURSHIP_ORG",
      "BUSINESS_ORG", "SALES_ORG", "PROFESSIONAL_ORG", "HONOR_SOCIETY",
    ],
    minOf: 4,
    description:
      "Four or more distinct kinds of public campus involvement. A count of signals, not a judgement about the person.",
  },
  {
    key: "LEADERSHIP_ACROSS_ORGS",
    label: "Leadership across multiple organizations",
    requires: ["MULTIPLE_LEADERSHIP"],
    description: "Holds named leadership titles in two or more distinct organizations.",
  },
  {
    key: "NEAR_GRAD_WITH_SALES_AFFINITY",
    label: "Near graduation + sales affinity",
    requires: ["NEAR_GRADUATION"],
    anyOf: ["SALES_ORG", "SALES_EXPERIENCE", "CUSTOMER_FACING_EXPERIENCE"],
    minOf: 1,
    description:
      "Graduating soon and shows at least one publicly documented sales or customer-facing signal.",
  },
];
