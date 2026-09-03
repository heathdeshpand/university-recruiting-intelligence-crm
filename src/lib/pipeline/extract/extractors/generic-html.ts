import { structureHash } from "@/lib/util/hash";
import { looksLikePersonName } from "@/lib/util/names";
import { normalizeWhitespace } from "@/lib/util/text";
import {
  findEmail,
  findYear,
  loadHtml,
  pageTitle,
  stripChrome,
} from "@/lib/pipeline/extract/dom";
import type { ExtractedRecord, Extractor, ExtractionOutcome } from "@/lib/pipeline/extract/types";

/**
 * Last-resort HTML extractor.
 *
 * Scans list items, headings and definition lists for text that reads like a
 * person's name. It scores low on purpose: it is the fallback when no
 * structured strategy fits, and its output is the most likely to need human
 * review, which the source's confidence score reflects.
 */
export const genericHtmlExtractor: Extractor = {
  type: "GENERIC_HTML",
  label: "Generic HTML",
  description:
    "Scans a page's lists and headings for person names. Used when no structured extractor fits; results carry lower confidence.",

  detect(input) {
    if (!input.contentType.includes("html")) return 0;

    const $ = loadHtml(input.body);
    stripChrome($);

    let hits = 0;
    $("li, h3, h4, h5, dt, p").each((_, el) => {
      const text = normalizeWhitespace($(el).text());
      if (text.length < 120 && looksLikePersonName(text.split(/[,–—|]/)[0]!.trim())) hits++;
    });

    if (hits < 4) return 0;
    // Capped below the structured extractors so it never wins against them.
    return Math.min(0.45, 0.2 + hits * 0.01);
  },

  extract(input): ExtractionOutcome {
    const $ = loadHtml(input.body);
    stripChrome($);

    const title = pageTitle($);
    const records: ExtractedRecord[] = [];
    const seen = new Set<string>();
    const selectors: string[] = [];

    $("li, h3, h4, h5, dt, p").each((_, el) => {
      const full = normalizeWhitespace($(el).text());
      if (full.length === 0 || full.length > 300) return;

      const head = (full.split(/[,\u2013\u2014|:]/)[0] ?? full).trim();
      if (!looksLikePersonName(head)) return;

      // Deduplicated on the whole line, never on the name alone. Two different
      // people can share a name -- that is the case this entire product is
      // built to handle -- so collapsing them here would destroy the evidence
      // entity resolution needs to tell them apart.
      const key = full.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      const tag = (el as { tagName?: string }).tagName ?? "";
      selectors.push(tag);

      const remainder = full.slice(head.length).replace(/^[\s,–—|:]+/, "").trim();

      records.push({
        name: head,
        // The remainder of the line is kept verbatim rather than guessed at.
        // Signal extraction decides later whether it says anything usable.
        note: remainder.length > 0 ? remainder : undefined,
        organization: title || undefined,
        year: findYear(full),
        email: findEmail(full),
        raw: { line: full, tag, pageTitle: title },
      });
    });

    return {
      records,
      structureHash: structureHash(selectors.length > 0 ? selectors : ["generic"]),
      parserUsed: "GENERIC_HTML",
      warnings:
        records.length > 0
          ? [
              "Extracted with the generic fallback. These records are less reliable than structured extraction and are worth spot-checking.",
            ]
          : [],
    };
  },
};
