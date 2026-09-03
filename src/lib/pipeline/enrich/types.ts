import type { ResolvableRecord } from "@/lib/pipeline/resolve/types";

/** Fields the directory may contribute. Deliberately narrow. */
export interface EnrichmentFields {
  email?: string;
  major?: string;
  graduationYear?: number;
}

export type EnrichmentOutcomeKind =
  | "MATCHED"
  | "NO_MATCH"
  | "AMBIGUOUS"
  | "SOURCE_UNAVAILABLE"
  | "ERROR";

export interface EnrichmentAttempt {
  outcome: EnrichmentOutcomeKind;
  matchConfidence: number | null;
  matchedName: string | null;
  fields: EnrichmentFields;
  matchingFactors: Array<{ label: string; detail?: string }>;
  conflictingFactors: Array<{ label: string; detail?: string }>;
  sourceUrl: string | null;
  message: string;
}

/** A directory entry, in the shape entity resolution compares. */
export interface DirectoryEntry extends ResolvableRecord {
  email: string | null;
  major: string | null;
  graduationYear: number | null;
}

export interface DirectoryIndex {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  entries: DirectoryEntry[];
  /** Entries keyed by phonetic surname, for fast lookup. */
  byPhonetic: Map<string, DirectoryEntry[]>;
}
