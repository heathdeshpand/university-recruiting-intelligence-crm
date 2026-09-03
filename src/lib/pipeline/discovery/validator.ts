import type { ParserType, SourceType } from "@prisma/client";
import { loadHtml, looksJavaScriptRendered, pageTitle, visibleText } from "@/lib/pipeline/extract/dom";
import { selectExtractor } from "@/lib/pipeline/extract/registry";
import type { TransportResponse } from "@/lib/pipeline/transport";

/**
 * Source validation: does this page actually contain records?
 *
 * This is the step that separates a page *about* club sports from a page
 * *listing* club sport members, and it is the single most important guard
 * against a source registry full of plausible-looking rubbish.
 *
 * The method is a dry run of extraction. Rather than guessing from keywords,
 * validation asks the extractor registry to actually parse the page and
 * counts what comes out. A page that yields records is usable by definition;
 * a page that yields none is not, whatever its title says.
 */

export interface ValidationOutcome {
  usable: boolean;
  /** Extractor that should be used when collecting this source. */
  parserType: ParserType;
  /** How many records the trial extraction produced. */
  recordEstimate: number;
  /** 0..1, combining extractor fit with how much it actually found. */
  confidence: number;
  /** Sentences shown in the source's status panel. */
  reasons: string[];
  pageTitle: string;
  structureHash: string;
  /** Set when the page is real but cannot be read by this version. */
  needsDifferentAdapter: boolean;
}

/** Below this many records, a page is treated as descriptive, not a roster. */
const MIN_RECORDS_FOR_USABLE = 3;

export function validateSource(
  response: TransportResponse,
  sourceType: SourceType,
): ValidationOutcome {
  const input = {
    url: response.finalUrl,
    body: response.body,
    contentType: response.contentType,
    sourceType,
  };

  const isHtml = response.contentType.includes("html");
  const $ = isHtml ? loadHtml(response.body) : null;
  const title = $ ? pageTitle($) : response.finalUrl;

  const selection = selectExtractor(input);

  if (!selection) {
    return {
      usable: false,
      parserType: "NONE",
      recordEstimate: 0,
      confidence: 0,
      reasons: [
        "No extractor recognised this page's structure, so it cannot be collected automatically.",
      ],
      pageTitle: title,
      structureHash: "",
      needsDifferentAdapter: false,
    };
  }

  // Pages that need an adapter this version does not have are recorded as
  // such: not usable, but not a parser failure either.
  if (selection.extractor.type === "PDF_UNSUPPORTED" || selection.extractor.type === "RENDERED_UNSUPPORTED") {
    const outcome = selection.extractor.extract(input);
    return {
      usable: false,
      parserType: selection.extractor.type,
      recordEstimate: 0,
      confidence: 0,
      reasons: outcome.warnings,
      pageTitle: title,
      structureHash: outcome.structureHash,
      needsDifferentAdapter: true,
    };
  }

  let outcome;
  try {
    outcome = selection.extractor.extract(input);
  } catch (e) {
    return {
      usable: false,
      parserType: selection.extractor.type,
      recordEstimate: 0,
      confidence: 0,
      reasons: [
        `The ${selection.extractor.label} extractor failed on this page: ${
          e instanceof Error ? e.message : String(e)
        }`,
      ],
      pageTitle: title,
      structureHash: "",
      needsDifferentAdapter: false,
    };
  }

  const recordCount = outcome.records.length;
  const reasons: string[] = [];

  if (recordCount === 0) {
    const bodyText = $ ? visibleText($, 4000) : "";
    if ($ && looksJavaScriptRendered($, response.body)) {
      reasons.push(
        "The page appears to render its content in the browser, so a static fetch returns no records.",
      );
    } else if (bodyText.length > 0) {
      reasons.push(
        "The page was readable but contained no extractable person records. It most likely describes a programme rather than listing its members.",
      );
    } else {
      reasons.push("The page returned no readable content.");
    }

    return {
      usable: false,
      parserType: selection.extractor.type,
      recordEstimate: 0,
      confidence: 0,
      reasons: [...reasons, ...outcome.warnings],
      pageTitle: title,
      structureHash: outcome.structureHash,
      needsDifferentAdapter: false,
    };
  }

  const usable = recordCount >= MIN_RECORDS_FOR_USABLE;

  reasons.push(
    `A trial extraction with the ${selection.extractor.label} extractor produced ${recordCount} record${recordCount === 1 ? "" : "s"}.`,
  );
  if (!usable) {
    reasons.push(
      `That is below the threshold of ${MIN_RECORDS_FOR_USABLE} records, so the page has been flagged for review rather than activated. It may be a partial listing or a false positive.`,
    );
  }

  // Confidence blends how well the extractor fit with how much it found, so a
  // page yielding three records does not look as certain as one yielding two
  // hundred.
  const volumeFactor = Math.min(1, Math.log10(recordCount + 1) / 2);
  const confidence = Number((selection.score * 0.6 + volumeFactor * 0.4).toFixed(2));

  return {
    usable,
    parserType: selection.extractor.type,
    recordEstimate: recordCount,
    confidence,
    reasons: [...reasons, ...outcome.warnings],
    pageTitle: title,
    structureHash: outcome.structureHash,
    needsDifferentAdapter: false,
  };
}

export { MIN_RECORDS_FOR_USABLE };
