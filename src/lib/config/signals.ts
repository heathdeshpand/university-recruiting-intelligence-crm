import type { SignalCategory } from "@prisma/client";

/**
 * The built-in signal taxonomy.
 *
 * These are the *defaults*. They are seeded into the SignalDefinition table,
 * which is what the rest of the application reads, so a deployment can add,
 * disable or relabel signals without a code change or a migration.
 *
 * Every signal here is derived from something a university published about a
 * student's public campus involvement. None of them describe, infer, or proxy
 * for a protected or sensitive attribute -- see docs/privacy-and-ethics.md.
 */

export interface SignalDefinitionSeed {
  key: string;
  label: string;
  category: SignalCategory;
  description: string;
}

export const SIGNAL_DEFINITIONS: SignalDefinitionSeed[] = [
  // --- Social / campus involvement ---
  {
    key: "ORG_MEMBERSHIP",
    label: "Student organization member",
    category: "SOCIAL",
    description:
      "Appears on the roster or member list of at least one registered student organization.",
  },
  {
    key: "MULTIPLE_ORGS",
    label: "Member of multiple organizations",
    category: "SOCIAL",
    description:
      "Appears in two or more distinct organizations. Counted per distinct organization, not per record.",
  },
  {
    key: "GREEK_MEMBERSHIP",
    label: "Greek organization member",
    category: "SOCIAL",
    description:
      "Listed by a fraternity or sorority chapter, or by a university Greek life directory.",
  },
  {
    key: "STUDENT_GOVERNMENT",
    label: "Student government",
    category: "SOCIAL",
    description: "Listed in a student government or student senate roster.",
  },
  {
    key: "HONOR_SOCIETY",
    label: "Honor society member",
    category: "SOCIAL",
    description: "Listed by an academic honor society.",
  },

  // --- Competitive ---
  {
    key: "VARSITY_ATHLETICS",
    label: "Varsity athlete",
    category: "COMPETITIVE",
    description: "Appears on an official varsity athletics roster.",
  },
  {
    key: "CLUB_SPORT",
    label: "Club sport participant",
    category: "COMPETITIVE",
    description: "Appears on a club sport roster.",
  },
  {
    key: "INTRAMURAL",
    label: "Intramural participant",
    category: "COMPETITIVE",
    description:
      "Appears in intramural participation data. Many universities do not publish this at all, in which case the signal stays UNKNOWN rather than NO.",
  },
  {
    key: "COMPETITIVE_ORG",
    label: "Competitive organization",
    category: "COMPETITIVE",
    description:
      "Member of an organization whose purpose is competition: debate, mock trial, case competition, hackathon, esports, competitive academic teams.",
  },

  // --- Leadership ---
  {
    key: "LEADERSHIP_ROLE",
    label: "Leadership position",
    category: "LEADERSHIP",
    description:
      "Holds a named leadership title such as president, vice president, treasurer, captain or committee chair.",
  },
  {
    key: "FOUNDER",
    label: "Founder or creator",
    category: "LEADERSHIP",
    description: "Publicly credited as a founder or co-founder of an organization or venture.",
  },
  {
    key: "MULTIPLE_LEADERSHIP",
    label: "Leadership in multiple organizations",
    category: "LEADERSHIP",
    description: "Holds a leadership title in two or more distinct organizations.",
  },

  // --- Entrepreneurship / business / sales ---
  {
    key: "ENTREPRENEURSHIP_ORG",
    label: "Entrepreneurship organization",
    category: "ENTREPRENEURSHIP",
    description: "Member of an entrepreneurship, startup, venture or innovation organization.",
  },
  {
    key: "BUSINESS_ORG",
    label: "Business organization",
    category: "BUSINESS",
    description:
      "Member of a business, finance, consulting, marketing or professional business organization.",
  },
  {
    key: "SALES_ORG",
    label: "Sales organization",
    category: "SALES",
    description:
      "Member of an organization explicitly focused on sales or professional selling.",
  },
  {
    key: "REAL_ESTATE_ORG",
    label: "Real estate organization",
    category: "BUSINESS",
    description: "Member of a real estate club or organization.",
  },

  // --- Career and work experience ---
  {
    key: "SALES_EXPERIENCE",
    label: "Prior sales experience",
    category: "WORK_EXPERIENCE",
    description:
      "Public, explicitly stated prior experience in a sales role. Only recorded when a source states it in so many words.",
  },
  {
    key: "CUSTOMER_FACING_EXPERIENCE",
    label: "Customer-facing experience",
    category: "CUSTOMER_FACING",
    description:
      "Public, explicitly stated experience in a customer-facing role such as service, hospitality or front-desk work.",
  },
  {
    key: "RECRUITING_EXPERIENCE",
    label: "Recruiting experience",
    category: "WORK_EXPERIENCE",
    description:
      "Publicly stated experience recruiting members, students or staff -- for example a chapter recruitment chair.",
  },
  {
    key: "FUNDRAISING_EXPERIENCE",
    label: "Fundraising experience",
    category: "WORK_EXPERIENCE",
    description:
      "Publicly stated fundraising or philanthropy-chair experience.",
  },
  {
    key: "PROFESSIONAL_ORG",
    label: "Professional organization",
    category: "CAREER",
    description: "Member of a pre-professional or career-focused organization.",
  },

  // --- Timing ---
  {
    key: "NEAR_GRADUATION",
    label: "Near graduation",
    category: "TIMING",
    description:
      "Graduation year indicates the candidate graduates within roughly the next twelve months.",
  },
  {
    key: "RECENT_GRADUATE",
    label: "Recent graduate",
    category: "TIMING",
    description: "Graduation year has already passed within roughly the last twelve months.",
  },
  {
    key: "JOB_SEEKING",
    label: "Explicit job-seeking statement",
    category: "JOB_SEARCH",
    description:
      "The candidate has publicly and explicitly stated that they are seeking a job or internship. Never inferred -- a source must say it.",
  },
  {
    key: "CAREER_TRANSITION",
    label: "Stated career transition",
    category: "JOB_SEARCH",
    description:
      "The candidate has publicly and explicitly stated a career change or alternative career path. Never inferred, and never derived from any indication of hardship or academic difficulty.",
  },
];

export const SIGNAL_KEYS = SIGNAL_DEFINITIONS.map((s) => s.key);

export function signalDefinition(key: string): SignalDefinitionSeed | undefined {
  return SIGNAL_DEFINITIONS.find((s) => s.key === key);
}
