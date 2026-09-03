import { createHash } from "node:crypto";

/**
 * Content fingerprints.
 *
 * Re-collecting a source must not create duplicate rows. Every raw record
 * gets a fingerprint over its meaningful content; that fingerprint is half of
 * a unique constraint with the source id, so a second collection of unchanged
 * data is a no-op rather than a duplicate.
 */

/** Normalizes a value so that trivial formatting differences hash alike. */
function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ").toLowerCase();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([k, v]) => [k, canonicalize(v)]));
  }
  return value;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Stable fingerprint for an arbitrary record shape. */
export function fingerprint(value: unknown): string {
  return sha256(JSON.stringify(canonicalize(value)));
}

/**
 * A hash of a page's *structure* rather than its content, used to detect when
 * a source's markup changes underneath an extractor. Comparing structure
 * hashes across runs is what powers the "this source changed shape, the
 * extractor may need review" warning.
 */
export function structureHash(parts: string[]): string {
  return sha256(parts.map((p) => p.trim().toLowerCase()).sort().join("|")).slice(0, 32);
}
