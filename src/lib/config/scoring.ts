import type { ScoreKind, SignalCategory } from "@prisma/client";

/**
 * Default scoring rules.
 *
 * Two independent configurations exist, and the separation is the point:
 *
 *   DISCOVERY  answers "is this person worth investigating further?" using
 *              only signals available *before* any contact-information
 *              lookup. It gates the enrichment funnel.
 *
 *   FINAL      answers "how should this candidate rank?" and may use
 *              everything, including what enrichment returned.
 *
 * A rule only ever fires on a signal whose value is YES. A signal that is
 * UNKNOWN -- because the university does not publish that kind of data --
 * contributes nothing and is never treated as a negative. There are no
 * negative-point rules anywhere in this file, by design.
 */

export interface ScoringRuleSeed {
  key: string;
  label: string;
  category: SignalCategory;
  signalKey: string;
  points: number;
  /** Signal.occurrences must be at least this for the rule to fire. */
  minOccurrences?: number;
  /** Extra points for each occurrence beyond `minOccurrences`. */
  pointsPerExtraOccurrence?: number;
  /** Ceiling on this single rule's contribution, including extras. */
  maxPoints?: number;
  order: number;
}

export interface ScoringConfigSeed {
  name: string;
  kind: ScoreKind;
  description: string;
  discoveryThreshold: number;
  /** Per-category ceilings applied after summing that category's rules. */
  categoryCaps: Partial<Record<SignalCategory, number>>;
  rules: ScoringRuleSeed[];
}

/**
 * Discovery scoring.
 *
 * Weights follow the brief's starting values. They are a defensible opening
 * position, not a validated model -- section "Limitations" of the README says
 * so plainly, and the Settings page lets a recruiter retune them.
 */
export const DEFAULT_DISCOVERY_CONFIG: ScoringConfigSeed = {
  name: "Default discovery scoring",
  kind: "DISCOVERY",
  description:
    "Decides which candidates are interesting enough to enrich. Uses only pre-enrichment signals.",
  discoveryThreshold: 60,
  categoryCaps: {
    SOCIAL: 30,
    COMPETITIVE: 25,
    LEADERSHIP: 25,
    ENTREPRENEURSHIP: 10,
    BUSINESS: 10,
    SALES: 15,
    WORK_EXPERIENCE: 20,
    CUSTOMER_FACING: 10,
    CAREER: 10,
    JOB_SEARCH: 15,
    TIMING: 15,
  },
  rules: [
    // Social
    { key: "ORG_MEMBER", label: "Student organization membership", category: "SOCIAL", signalKey: "ORG_MEMBERSHIP", points: 5, order: 10 },
    { key: "MULTI_ORG", label: "Member of multiple organizations", category: "SOCIAL", signalKey: "MULTIPLE_ORGS", points: 10, minOccurrences: 2, pointsPerExtraOccurrence: 3, maxPoints: 16, order: 20 },
    { key: "GREEK", label: "Greek organization membership", category: "SOCIAL", signalKey: "GREEK_MEMBERSHIP", points: 8, order: 30 },
    { key: "STUGOV", label: "Student government", category: "SOCIAL", signalKey: "STUDENT_GOVERNMENT", points: 6, order: 40 },

    // Competitive
    { key: "CLUB_SPORT", label: "Club sport participation", category: "COMPETITIVE", signalKey: "CLUB_SPORT", points: 8, order: 50 },
    { key: "VARSITY", label: "Varsity athletics", category: "COMPETITIVE", signalKey: "VARSITY_ATHLETICS", points: 10, order: 60 },
    { key: "COMPETITIVE_ORG", label: "Competitive organization", category: "COMPETITIVE", signalKey: "COMPETITIVE_ORG", points: 6, order: 70 },

    // Leadership
    { key: "LEADERSHIP", label: "Leadership position", category: "LEADERSHIP", signalKey: "LEADERSHIP_ROLE", points: 10, pointsPerExtraOccurrence: 4, maxPoints: 18, order: 80 },
    { key: "FOUNDER", label: "Founder or creator", category: "LEADERSHIP", signalKey: "FOUNDER", points: 10, order: 90 },

    // Career affinity
    { key: "ENTREPRENEURSHIP", label: "Entrepreneurship organization", category: "ENTREPRENEURSHIP", signalKey: "ENTREPRENEURSHIP_ORG", points: 8, order: 100 },
    { key: "BUSINESS_ORG", label: "Business organization", category: "BUSINESS", signalKey: "BUSINESS_ORG", points: 5, order: 110 },
    { key: "SALES_ORG", label: "Sales organization", category: "SALES", signalKey: "SALES_ORG", points: 10, order: 120 },
    { key: "SALES_EXPERIENCE", label: "Prior sales experience", category: "WORK_EXPERIENCE", signalKey: "SALES_EXPERIENCE", points: 15, order: 130 },
    { key: "RECRUITING_EXP", label: "Recruiting experience", category: "WORK_EXPERIENCE", signalKey: "RECRUITING_EXPERIENCE", points: 5, order: 140 },
    { key: "FUNDRAISING_EXP", label: "Fundraising experience", category: "WORK_EXPERIENCE", signalKey: "FUNDRAISING_EXPERIENCE", points: 5, order: 150 },

    // Timing
    { key: "JOB_SEEKING", label: "Explicit job-seeking signal", category: "JOB_SEARCH", signalKey: "JOB_SEEKING", points: 10, order: 160 },
    { key: "NEAR_GRAD", label: "Near graduation", category: "TIMING", signalKey: "NEAR_GRADUATION", points: 8, order: 170 },
  ],
};

/**
 * Final scoring.
 *
 * Category caps here are chosen so the five headline buckets read as a clean
 * breakdown in the UI: Social 25, Competitive 25, Career/Sales 30,
 * Leadership 10, Timing 10.
 */
export const DEFAULT_FINAL_CONFIG: ScoringConfigSeed = {
  name: "Default final scoring",
  kind: "FINAL",
  description:
    "Ranks candidates after enrichment. Categories are capped so no single kind of evidence can dominate.",
  discoveryThreshold: 60,
  categoryCaps: {
    SOCIAL: 25,
    COMPETITIVE: 25,
    ENTREPRENEURSHIP: 10,
    BUSINESS: 8,
    SALES: 14,
    WORK_EXPERIENCE: 16,
    CUSTOMER_FACING: 6,
    CAREER: 6,
    LEADERSHIP: 10,
    TIMING: 6,
    JOB_SEARCH: 6,
  },
  rules: [
    // Social -- capped at 25
    { key: "ORG_MEMBER", label: "Student organization membership", category: "SOCIAL", signalKey: "ORG_MEMBERSHIP", points: 6, order: 10 },
    { key: "MULTI_ORG", label: "Member of multiple organizations", category: "SOCIAL", signalKey: "MULTIPLE_ORGS", points: 8, minOccurrences: 2, pointsPerExtraOccurrence: 3, maxPoints: 14, order: 20 },
    { key: "GREEK", label: "Greek organization membership", category: "SOCIAL", signalKey: "GREEK_MEMBERSHIP", points: 8, order: 30 },
    { key: "STUGOV", label: "Student government", category: "SOCIAL", signalKey: "STUDENT_GOVERNMENT", points: 6, order: 40 },
    { key: "HONOR_SOCIETY", label: "Honor society", category: "SOCIAL", signalKey: "HONOR_SOCIETY", points: 3, order: 50 },

    // Competitive -- capped at 25
    { key: "VARSITY", label: "Varsity athletics", category: "COMPETITIVE", signalKey: "VARSITY_ATHLETICS", points: 12, order: 60 },
    { key: "CLUB_SPORT", label: "Club sport participation", category: "COMPETITIVE", signalKey: "CLUB_SPORT", points: 9, pointsPerExtraOccurrence: 3, maxPoints: 14, order: 70 },
    { key: "COMPETITIVE_ORG", label: "Competitive organization", category: "COMPETITIVE", signalKey: "COMPETITIVE_ORG", points: 7, order: 80 },
    { key: "INTRAMURAL", label: "Intramural participation", category: "COMPETITIVE", signalKey: "INTRAMURAL", points: 4, order: 90 },

    // Career / sales affinity -- caps sum to 30 across these categories
    { key: "SALES_ORG", label: "Sales organization", category: "SALES", signalKey: "SALES_ORG", points: 10, order: 100 },
    { key: "SALES_EXPERIENCE", label: "Prior sales experience", category: "WORK_EXPERIENCE", signalKey: "SALES_EXPERIENCE", points: 12, order: 110 },
    { key: "ENTREPRENEURSHIP", label: "Entrepreneurship organization", category: "ENTREPRENEURSHIP", signalKey: "ENTREPRENEURSHIP_ORG", points: 8, order: 120 },
    { key: "BUSINESS_ORG", label: "Business organization", category: "BUSINESS", signalKey: "BUSINESS_ORG", points: 5, order: 130 },
    { key: "REAL_ESTATE", label: "Real estate organization", category: "BUSINESS", signalKey: "REAL_ESTATE_ORG", points: 4, order: 140 },
    { key: "CUSTOMER_FACING", label: "Customer-facing experience", category: "CUSTOMER_FACING", signalKey: "CUSTOMER_FACING_EXPERIENCE", points: 6, order: 150 },
    { key: "RECRUITING_EXP", label: "Recruiting experience", category: "WORK_EXPERIENCE", signalKey: "RECRUITING_EXPERIENCE", points: 5, order: 160 },
    { key: "FUNDRAISING_EXP", label: "Fundraising experience", category: "WORK_EXPERIENCE", signalKey: "FUNDRAISING_EXPERIENCE", points: 4, order: 170 },
    { key: "PROFESSIONAL_ORG", label: "Professional organization", category: "CAREER", signalKey: "PROFESSIONAL_ORG", points: 5, order: 180 },

    // Leadership -- capped at 10
    { key: "LEADERSHIP", label: "Leadership position", category: "LEADERSHIP", signalKey: "LEADERSHIP_ROLE", points: 7, pointsPerExtraOccurrence: 2, maxPoints: 10, order: 190 },
    { key: "FOUNDER", label: "Founder or creator", category: "LEADERSHIP", signalKey: "FOUNDER", points: 6, order: 200 },
    { key: "MULTI_LEADERSHIP", label: "Leadership in multiple organizations", category: "LEADERSHIP", signalKey: "MULTIPLE_LEADERSHIP", points: 5, minOccurrences: 2, order: 210 },

    // Timing -- capped at 10 across TIMING + JOB_SEARCH
    { key: "NEAR_GRAD", label: "Near graduation", category: "TIMING", signalKey: "NEAR_GRADUATION", points: 6, order: 220 },
    { key: "RECENT_GRAD", label: "Recent graduate", category: "TIMING", signalKey: "RECENT_GRADUATE", points: 4, order: 230 },
    { key: "JOB_SEEKING", label: "Explicit job-seeking signal", category: "JOB_SEARCH", signalKey: "JOB_SEEKING", points: 6, order: 240 },
    { key: "CAREER_TRANSITION", label: "Stated career transition", category: "JOB_SEARCH", signalKey: "CAREER_TRANSITION", points: 3, order: 250 },
  ],
};

export const DEFAULT_SCORING_CONFIGS = [DEFAULT_DISCOVERY_CONFIG, DEFAULT_FINAL_CONFIG];

/** Tier boundaries applied to the final score. */
export const TIER_THRESHOLDS = [
  { tier: "TIER_A" as const, min: 85 },
  { tier: "TIER_B" as const, min: 70 },
  { tier: "TIER_C" as const, min: 50 },
  { tier: "TIER_D" as const, min: 0 },
];

export function tierForScore(score: number | null | undefined) {
  if (score === null || score === undefined) return "UNRANKED" as const;
  for (const t of TIER_THRESHOLDS) {
    if (score >= t.min) return t.tier;
  }
  return "TIER_D" as const;
}
