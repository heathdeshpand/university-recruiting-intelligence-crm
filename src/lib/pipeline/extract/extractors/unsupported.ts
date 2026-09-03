import { structureHash } from "@/lib/util/hash";
import { loadHtml, looksJavaScriptRendered } from "@/lib/pipeline/extract/dom";
import type { Extractor, ExtractionOutcome } from "@/lib/pipeline/extract/types";

/**
 * Honest failures.
 *
 * Two shapes of page cannot be read by a static fetch: PDFs, and pages that
 * build their content in the browser. Rather than returning zero records and
 * letting that look like a parser bug, these extractors claim the page and
 * explain exactly why it cannot be used and what would be needed.
 *
 * They are the reason the Sources panel can say "this needs a different
 * adapter" instead of "0 records found".
 */

export const pdfUnsupportedExtractor: Extractor = {
  type: "PDF_UNSUPPORTED",
  label: "PDF (not supported)",
  description:
    "Recognises PDF sources. PDF text extraction is not implemented; the source is marked as needing review rather than silently failing.",

  detect(input) {
    if (input.contentType.includes("pdf")) return 1;
    if (input.url.toLowerCase().endsWith(".pdf")) return 0.9;
    return 0;
  },

  extract(): ExtractionOutcome {
    return {
      records: [],
      structureHash: structureHash(["pdf"]),
      parserUsed: "PDF_UNSUPPORTED",
      warnings: [
        "This source is a PDF. PDF extraction is not implemented in this version, so no records were collected. The source has been left registered so it is visible, and can be handled by importing a CSV instead.",
      ],
    };
  },
};

export const renderedUnsupportedExtractor: Extractor = {
  type: "RENDERED_UNSUPPORTED",
  label: "Browser-rendered (not supported)",
  description:
    "Recognises pages that build their content with JavaScript, which a static fetch cannot read.",

  detect(input) {
    if (!input.contentType.includes("html")) return 0;
    const $ = loadHtml(input.body);
    // Scored just above the generic fallback: a JS-rendered page should be
    // reported as such rather than scraped for the handful of names that
    // happen to be in the server-rendered shell.
    return looksJavaScriptRendered($, input.body) ? 0.5 : 0;
  },

  extract(): ExtractionOutcome {
    return {
      records: [],
      structureHash: structureHash(["rendered"]),
      parserUsed: "RENDERED_UNSUPPORTED",
      warnings: [
        "This page builds its content in the browser, so fetching the HTML returns an empty shell. Reading it would need a browser-rendering adapter, which this version does not include. No records were collected.",
      ],
    };
  },
};
