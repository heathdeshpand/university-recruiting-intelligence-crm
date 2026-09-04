import { z } from "zod";

/**
 * Request schemas.
 *
 * Every mutating endpoint parses its body through one of these before doing
 * anything. Validation lives here rather than inline so the same shape can be
 * reused by the API route, a form, and a test.
 */

/** Accepts "esu.example.edu", "https://esu.example.edu/path" or "ESU.Example.EDU". */
/**
 * Normalizes the many shapes a person reasonably writes a domain in.
 *
 * People do not type bare hostnames. They paste a URL, they copy an email
 * address, they write "@illinois.edu" because that is how a domain looks in
 * everyday use. All of those mean the same thing, and rejecting them teaches
 * nothing except that the form is fussy.
 */
export function normalizeDomain(raw: string): string {
  let value = raw.trim().toLowerCase();

  // A pasted URL.
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  // An email address, or a domain written with a leading "@".
  value = value.slice(value.lastIndexOf("@") + 1);
  // Path, query, fragment, port.
  value = value.split(/[/?#]/)[0] ?? value;
  value = value.split(":")[0] ?? value;
  // Cosmetic prefixes and a trailing root dot.
  value = value.replace(/^www\./, "").replace(/\.+$/, "");

  return value;
}

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export const domainSchema = z
  .string()
  .trim()
  .min(3, "Enter a domain, for example illinois.edu")
  .max(253)
  .transform(normalizeDomain)
  .refine((v) => v.length > 0 && DOMAIN_PATTERN.test(v), {
    // Say what is wrong and what a good value looks like. "Invalid" on its
    // own leaves someone guessing at which of a dozen rules they broke.
    message:
      "Enter the university's domain on its own, like illinois.edu. A full URL, an email address or a leading @ are all fine — anything else, check for a typo or a stray space.",
  });

export const createUniversitySchema = z.object({
  name: z.string().trim().min(2, "Enter the university's name.").max(200),
  shortName: z.string().trim().max(60).optional().or(z.literal("")),
  primaryDomain: domainSchema,
  additionalDomains: z.array(domainSchema).max(10).default([]),
  athleticName: z.string().trim().max(120).optional().or(z.literal("")),
  aliases: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  state: z.string().trim().max(60).optional().or(z.literal("")),
  country: z.string().trim().min(2).max(60).default("US"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type CreateUniversityInput = z.infer<typeof createUniversitySchema>;

export const updateUniversitySchema = createUniversitySchema.partial().extend({
  discoveryThreshold: z.number().int().min(0).max(100).optional(),
});

export const sourceStatusSchema = z.enum([
  "DISCOVERED", "VALIDATED", "ACTIVE", "FAILED", "UNAVAILABLE", "REQUIRES_REVIEW", "DISABLED",
]);

export const sourceTypeSchema = z.enum([
  "GREEK_LIFE", "FRATERNITY", "SORORITY", "STUDENT_ORGANIZATION", "CLUB_SPORT",
  "INTRAMURAL", "ATHLETICS", "STUDENT_LEADERSHIP", "STUDENT_GOVERNMENT",
  "ENTREPRENEURSHIP", "BUSINESS_ORGANIZATION", "SALES_ORGANIZATION",
  "PROFESSIONAL_ORGANIZATION", "COMPETITIVE_ORGANIZATION", "HONOR_SOCIETY",
  "STUDENT_DIRECTORY", "NEWS_OR_AWARDS", "OTHER", "UNKNOWN",
]);

export const parserTypeSchema = z.enum([
  "HTML_TABLE", "HTML_LIST", "HTML_CARD_GRID", "JSON_ENDPOINT", "CSV",
  "ATHLETICS_ROSTER", "ORG_DIRECTORY", "GENERIC_HTML", "DEMO_FIXTURE",
  "PDF_UNSUPPORTED", "RENDERED_UNSUPPORTED", "NONE",
]);

/** Manual source registration, and manual correction of a discovered source. */
export const createSourceSchema = z.object({
  url: z.string().trim().url("Enter a full URL, including https://"),
  name: z.string().trim().min(2).max(200),
  sourceType: sourceTypeSchema,
  parserType: parserTypeSchema.default("GENERIC_HTML"),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const updateSourceSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  sourceType: sourceTypeSchema.optional(),
  parserType: parserTypeSchema.optional(),
  status: sourceStatusSchema.optional(),
  active: z.boolean().optional(),
  description: z.string().trim().max(1000).optional(),
});

export const jobTypeSchema = z.enum([
  "SOURCE_DISCOVERY", "SOURCE_VALIDATION", "DATA_COLLECTION", "NORMALIZATION",
  "ENTITY_RESOLUTION", "SIGNAL_EXTRACTION", "DISCOVERY_SCORING", "ENRICHMENT",
  "FINAL_SCORING", "EXPORT", "FULL_PIPELINE",
]);

export const runStageSchema = z.object({
  type: jobTypeSchema,
  /** Restrict a collection run to specific sources. */
  sourceIds: z.array(z.string().cuid()).max(200).optional(),
});

export const matchDecisionSchema = z.object({
  decision: z.enum(["CONFIRMED", "REJECTED", "REVIEW"]),
  note: z.string().trim().max(500).optional(),
});

export const candidateStatusSchema = z.enum([
  "NEW", "DISCOVERED", "QUALIFIED", "ENRICHED", "REVIEWED", "ARCHIVED",
]);

export const updateCandidateSchema = z.object({
  canonicalName: z.string().trim().min(2).max(200).optional(),
  firstName: z.string().trim().max(100).optional().nullable(),
  lastName: z.string().trim().max(100).optional().nullable(),
  major: z.string().trim().max(150).optional().nullable(),
  graduationYear: z.number().int().min(1900).max(2100).optional().nullable(),
  status: candidateStatusSchema.optional(),
});

export const mergeCandidatesSchema = z.object({
  /** The candidate that survives. */
  targetId: z.string().cuid(),
  /** Candidates whose source records move into the target. */
  sourceIds: z.array(z.string().cuid()).min(1).max(20),
});

export const splitCandidateSchema = z.object({
  /** Normalized record ids to detach into a new candidate. */
  normalizedRecordIds: z.array(z.string().cuid()).min(1).max(100),
});

export const scoringConfigUpdateSchema = z.object({
  discoveryThreshold: z.number().int().min(0).max(100).optional(),
  rules: z
    .array(
      z.object({
        id: z.string().cuid(),
        points: z.number().int().min(0).max(100),
        active: z.boolean(),
      }),
    )
    .max(200)
    .optional(),
});

/** Formats a ZodError into a single readable sentence for the UI. */
export function formatZodError(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return "Invalid request.";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}
