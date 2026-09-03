import { structureHash } from "@/lib/util/hash";
import { looksLikePersonName } from "@/lib/util/names";
import type { ExtractedRecord, Extractor, ExtractionOutcome, ExtractorInput } from "@/lib/pipeline/extract/types";

/**
 * JSON endpoints.
 *
 * Preferred over HTML wherever a university offers one: the data is already
 * structured, so nothing has to be inferred from markup. This extractor
 * hunts for the array of records inside whatever envelope the endpoint uses.
 */

const NAME_KEYS = ["name", "fullname", "full_name", "displayname", "display_name", "studentname", "membername", "athlete"];
const FIRST_KEYS = ["first", "firstname", "first_name", "givenname", "given_name"];
const LAST_KEYS = ["last", "lastname", "last_name", "surname", "familyname", "family_name"];
const ORG_KEYS = ["organization", "org", "chapter", "club", "team", "group", "society", "affiliation"];
const ROLE_KEYS = ["role", "position", "title", "office"];
const MAJOR_KEYS = ["major", "program", "programme", "field", "concentration", "study"];
const YEAR_KEYS = ["year", "gradyear", "grad_year", "graduationyear", "graduation_year", "class", "classyear"];
const EMAIL_KEYS = ["email", "emailaddress", "email_address", "mail"];
const SPORT_KEYS = ["sport", "discipline", "event"];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z_]/g, "");
}

function pick(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const [rawKey, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value !== "string" && typeof value !== "number") continue;
    if (keys.includes(normalizeKey(rawKey))) {
      const str = String(value).trim();
      if (str.length > 0) return str;
    }
  }
  return undefined;
}

/** Finds the deepest array of objects that look like people. */
function findRecordArray(value: unknown, depth = 0): Record<string, unknown>[] | null {
  if (depth > 6) return null;

  if (Array.isArray(value)) {
    const objects = value.filter(
      (v): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v),
    );
    if (objects.length === 0) return null;

    const named = objects.filter((o) => {
      const name = pick(o, NAME_KEYS) ?? [pick(o, FIRST_KEYS), pick(o, LAST_KEYS)].filter(Boolean).join(" ");
      return name.length > 0;
    });
    return named.length >= Math.max(1, objects.length * 0.5) ? objects : null;
  }

  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const found = findRecordArray(nested, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function parseBody(input: ExtractorInput): Record<string, unknown>[] | null {
  try {
    return findRecordArray(JSON.parse(input.body));
  } catch {
    return null;
  }
}

export const jsonEndpointExtractor: Extractor = {
  type: "JSON_ENDPOINT",
  label: "JSON endpoint",
  description:
    "Reads structured JSON responses, locating the array of person records inside whatever envelope the endpoint uses.",

  detect(input) {
    const looksJson =
      input.contentType.includes("json") || input.body.trimStart().startsWith("{") || input.body.trimStart().startsWith("[");
    if (!looksJson) return 0;
    const records = parseBody(input);
    if (!records || records.length === 0) return 0;
    // Structured data is preferred over every HTML strategy when available.
    return 1;
  },

  extract(input): ExtractionOutcome {
    const objects = parseBody(input) ?? [];
    const records: ExtractedRecord[] = [];
    const keySet = new Set<string>();

    for (const obj of objects) {
      Object.keys(obj).forEach((k) => keySet.add(normalizeKey(k)));

      const explicit = pick(obj, NAME_KEYS);
      const composed = [pick(obj, FIRST_KEYS), pick(obj, LAST_KEYS)].filter(Boolean).join(" ").trim();
      const name = explicit ?? (composed.length > 0 ? composed : undefined);

      if (!name || !looksLikePersonName(name)) continue;

      records.push({
        name,
        organization: pick(obj, ORG_KEYS),
        role: pick(obj, ROLE_KEYS),
        major: pick(obj, MAJOR_KEYS),
        year: pick(obj, YEAR_KEYS),
        email: pick(obj, EMAIL_KEYS),
        sport: pick(obj, SPORT_KEYS),
        raw: obj,
      });
    }

    const warnings: string[] = [];
    if (objects.length > 0 && records.length === 0) {
      warnings.push("The endpoint returned objects but none of them had a field that reads as a person's name.");
    }

    return {
      records,
      structureHash: structureHash([...keySet]),
      parserUsed: "JSON_ENDPOINT",
      warnings,
    };
  },
};
