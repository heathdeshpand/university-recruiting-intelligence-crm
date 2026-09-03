import type { SourceType } from "@prisma/client";

/**
 * Lexicons used to classify organizations, roles and sports.
 *
 * These are keyword rules, deliberately readable and editable. They are the
 * deterministic path; an optional AI classifier can be layered on top for
 * names the keywords do not cover, but the keyword rules always run first and
 * always win when they match, so behaviour stays reproducible.
 */

export interface OrgCategoryRule {
  /** Signal keys emitted when an organization matches. */
  signals: string[];
  sourceType: SourceType;
  /** Lowercase substrings. A match on any one of them fires the rule. */
  keywords: string[];
}

export const ORGANIZATION_RULES: OrgCategoryRule[] = [
  {
    signals: ["SALES_ORG"],
    sourceType: "SALES_ORGANIZATION",
    keywords: [
      "sales club", "sales society", "professional selling", "sales team",
      "pi sigma epsilon", "national collegiate sales", "sales leadership",
      "sales institute", "sales association",
    ],
  },
  {
    signals: ["ENTREPRENEURSHIP_ORG"],
    sourceType: "ENTREPRENEURSHIP",
    keywords: [
      "entrepreneur", "entrepreneurship", "startup", "start-up", "founders",
      "venture", "innovation lab", "incubator", "accelerator", "e-club",
      "collegiate entrepreneurs",
    ],
  },
  {
    signals: ["REAL_ESTATE_ORG", "BUSINESS_ORG"],
    sourceType: "BUSINESS_ORGANIZATION",
    keywords: ["real estate", "property club", "realty"],
  },
  {
    signals: ["BUSINESS_ORG"],
    sourceType: "BUSINESS_ORGANIZATION",
    keywords: [
      "business club", "business association", "finance club", "investment club",
      "consulting", "marketing club", "marketing association", "american marketing",
      "supply chain", "accounting", "beta alpha psi", "delta sigma pi",
      "alpha kappa psi", "business school", "commerce club", "trading club",
      "economics club", "banking",
    ],
  },
  {
    signals: ["COMPETITIVE_ORG"],
    sourceType: "COMPETITIVE_ORGANIZATION",
    keywords: [
      "debate", "mock trial", "moot court", "model united nations", "model un",
      "case competition", "hackathon", "esports", "e-sports", "chess",
      "robotics", "quiz bowl", "math team", "programming team", "competitive",
      "rocketry", "formula sae", "design team",
    ],
  },
  {
    signals: ["PROFESSIONAL_ORG"],
    sourceType: "PROFESSIONAL_ORGANIZATION",
    keywords: [
      "pre-law", "pre-med", "pre-professional", "society of women engineers",
      "national society of black engineers", "ieee", "acm", "society of hispanic",
      "professional development", "career society", "engineers without borders",
    ],
  },
  {
    signals: ["HONOR_SOCIETY"],
    sourceType: "HONOR_SOCIETY",
    keywords: [
      "honor society", "honors society", "phi beta kappa", "golden key",
      "tau beta pi", "phi kappa phi", "omicron delta kappa", "mortar board",
    ],
  },
  {
    signals: ["STUDENT_GOVERNMENT"],
    sourceType: "STUDENT_GOVERNMENT",
    keywords: [
      "student government", "student senate", "student council", "undergraduate senate",
      "student body", "sga", "asg", "student assembly",
    ],
  },
  {
    signals: ["GREEK_MEMBERSHIP"],
    sourceType: "GREEK_LIFE",
    keywords: [
      "fraternity", "sorority", "chapter of", "interfraternity", "panhellenic",
      "greek life", "greek council", "nphc", "mgc",
    ],
  },
  {
    signals: ["CLUB_SPORT"],
    sourceType: "CLUB_SPORT",
    keywords: ["club sport", "club team", "sport club"],
  },
];

/**
 * Greek-letter organization names.
 *
 * Chapter names are almost always Greek letters, and a two- or three-letter
 * Greek name is a strong indicator on a page already classified as Greek life.
 * Matching Greek letters *alone* is not enough -- plenty of honor societies
 * and professional fraternities use them too -- so this is combined with the
 * page's own classification rather than used on its own.
 */
export const GREEK_LETTERS = [
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota",
  "kappa", "lambda", "mu", "nu", "xi", "omicron", "pi", "rho", "sigma", "tau",
  "upsilon", "phi", "chi", "psi", "omega",
];

/** Leadership titles, longest-first so "vice president" beats "president". */
export const LEADERSHIP_ROLES: Array<{ canonical: string; keywords: string[]; isFounder?: boolean }> = [
  { canonical: "Founder", keywords: ["founder", "co-founder", "cofounder", "founding member"], isFounder: true },
  { canonical: "President", keywords: ["president", "chapter president", "chair", "chairman", "chairwoman", "chairperson"] },
  { canonical: "Vice President", keywords: ["vice president", "vice-president", "vp ", "vice chair"] },
  { canonical: "Treasurer", keywords: ["treasurer", "finance chair", "cfo"] },
  { canonical: "Secretary", keywords: ["secretary", "recording secretary"] },
  { canonical: "Captain", keywords: ["captain", "co-captain", "team captain"] },
  { canonical: "Director", keywords: ["director", "executive director", "managing director"] },
  { canonical: "Recruitment Chair", keywords: ["recruitment", "rush chair", "membership chair", "new member educator"] },
  { canonical: "Philanthropy Chair", keywords: ["philanthropy", "fundraising", "development chair"] },
  { canonical: "Committee Lead", keywords: ["committee chair", "lead", "head of", "coordinator", "organizer"] },
];

/** Roles that specifically indicate recruiting or fundraising experience. */
export const ROLE_SIGNAL_MAP: Array<{ keywords: string[]; signals: string[] }> = [
  { keywords: ["recruitment", "rush chair", "membership chair", "new member"], signals: ["RECRUITING_EXPERIENCE"] },
  { keywords: ["philanthropy", "fundraising", "development chair"], signals: ["FUNDRAISING_EXPERIENCE"] },
];

/**
 * Job titles that count as explicit prior sales or customer-facing work.
 *
 * Only used against text a source published verbatim, never inferred from an
 * organization name.
 */
export const WORK_EXPERIENCE_RULES: Array<{ signals: string[]; keywords: string[] }> = [
  {
    signals: ["SALES_EXPERIENCE"],
    keywords: [
      "sales associate", "sales representative", "sales rep", "account executive",
      "business development", "inside sales", "outside sales", "sales intern",
      "sdr", "bdr", "commission", "quota",
    ],
  },
  {
    signals: ["CUSTOMER_FACING_EXPERIENCE"],
    keywords: [
      "server", "barista", "bartender", "host", "hostess", "retail associate",
      "customer service", "front desk", "concierge", "cashier", "brand ambassador",
      "tour guide", "orientation leader", "resident advisor", "resident assistant",
    ],
  },
];

/**
 * Phrases that count as an explicit, public job-search statement.
 *
 * The bar is deliberately high: the source must actually say it. Nothing here
 * infers job-seeking from year of study, major, or any indication of
 * difficulty or hardship.
 */
export const JOB_SEARCH_PHRASES = [
  "seeking full-time", "seeking a full-time", "looking for full-time",
  "seeking an internship", "seeking internship", "looking for an internship",
  "open to work", "open to opportunities", "actively seeking",
  "seeking employment", "available for hire", "job seeking",
];

export const CAREER_TRANSITION_PHRASES = [
  "career change", "career transition", "changing careers",
  "pivoting to", "exploring a new career", "gap year",
];

/** Canonicalizes common sport name variants. */
export const SPORT_ALIASES: Record<string, string> = {
  "mens soccer": "Soccer", "womens soccer": "Soccer", "soccer": "Soccer", "football club": "Soccer",
  "mens basketball": "Basketball", "womens basketball": "Basketball", "basketball": "Basketball",
  "mens lacrosse": "Lacrosse", "womens lacrosse": "Lacrosse", "lacrosse": "Lacrosse",
  "mens volleyball": "Volleyball", "womens volleyball": "Volleyball", "volleyball": "Volleyball",
  "mens rugby": "Rugby", "womens rugby": "Rugby", "rugby": "Rugby",
  "ice hockey": "Ice Hockey", "hockey": "Ice Hockey", "field hockey": "Field Hockey",
  "track and field": "Track and Field", "track & field": "Track and Field", "track": "Track and Field",
  "cross country": "Cross Country", "swimming and diving": "Swimming", "swimming": "Swimming",
  "ultimate frisbee": "Ultimate", "ultimate": "Ultimate",
  "baseball": "Baseball", "softball": "Softball", "tennis": "Tennis", "golf": "Golf",
  "wrestling": "Wrestling", "rowing": "Rowing", "crew": "Rowing", "sailing": "Sailing",
  "water polo": "Water Polo", "cycling": "Cycling", "triathlon": "Triathlon",
  "climbing": "Climbing", "ski": "Skiing", "skiing": "Skiing", "running": "Running",
};
