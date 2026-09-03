import type { ParserType, SourceType } from "@prisma/client";

/**
 * The extractor contract.
 *
 * Adding support for a new kind of page means writing one module that
 * implements `Extractor` and registering it. Nothing else in the pipeline
 * changes -- which is the whole point of not writing one giant scraper.
 */

export interface ExtractedRecord {
  /** The person's name exactly as the page wrote it. Required. */
  name: string;
  organization?: string;
  role?: string;
  major?: string;
  year?: string;
  sport?: string;
  email?: string;
  /** Free text the source published about this person, kept verbatim. */
  note?: string;
  profileUrl?: string;
  /**
   * Everything the extractor saw for this record, including fields that do
   * not fit the canonical shape. Preserved so a university's unusual data is
   * never silently discarded.
   */
  raw: Record<string, unknown>;
}

export interface ExtractorInput {
  url: string;
  body: string;
  contentType: string;
  /** What discovery believes this page is. Some extractors use it as a hint. */
  sourceType: SourceType;
}

export interface ExtractionOutcome {
  records: ExtractedRecord[];
  /** Fingerprint of the page's shape, for detecting structural drift. */
  structureHash: string;
  parserUsed: ParserType;
  /** Non-fatal problems worth surfacing in the source's status panel. */
  warnings: string[];
}

export interface Extractor {
  type: ParserType;
  label: string;
  description: string;
  /**
   * How well this extractor fits the page, in [0, 1]. The registry picks the
   * highest scorer. Returning 0 means "not applicable".
   */
  detect(input: ExtractorInput): number;
  extract(input: ExtractorInput): ExtractionOutcome;
}
