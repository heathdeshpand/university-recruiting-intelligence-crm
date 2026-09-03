import type { ParserType } from "@prisma/client";
import type { Extractor, ExtractionOutcome, ExtractorInput } from "@/lib/pipeline/extract/types";
import { htmlTableExtractor } from "@/lib/pipeline/extract/extractors/html-table";
import { orgDirectoryExtractor } from "@/lib/pipeline/extract/extractors/org-directory";
import { athleticsRosterExtractor } from "@/lib/pipeline/extract/extractors/athletics-roster";
import { jsonEndpointExtractor } from "@/lib/pipeline/extract/extractors/json-endpoint";
import { genericHtmlExtractor } from "@/lib/pipeline/extract/extractors/generic-html";
import { csvExtractor } from "@/lib/pipeline/extract/extractors/csv";
import {
  pdfUnsupportedExtractor,
  renderedUnsupportedExtractor,
} from "@/lib/pipeline/extract/extractors/unsupported";

/**
 * The extractor registry.
 *
 * Selection is by capability, not by configuration: every extractor scores
 * how well it fits the page it is shown, and the highest scorer wins. That
 * keeps the system working when discovery guessed the parser wrong, and means
 * adding an extractor cannot break the existing ones.
 *
 * Registration order is irrelevant; scores decide. Structured formats return
 * 1.0, specialised HTML strategies score in the 0.5-0.98 band, and the
 * generic fallback is capped at 0.45 so it can never outrank a real match.
 */

export const EXTRACTORS: Extractor[] = [
  jsonEndpointExtractor,
  csvExtractor,
  athleticsRosterExtractor,
  htmlTableExtractor,
  orgDirectoryExtractor,
  renderedUnsupportedExtractor,
  pdfUnsupportedExtractor,
  genericHtmlExtractor,
];

export interface ExtractorSelection {
  extractor: Extractor;
  score: number;
  /** All extractors that would accept this page, best first. */
  alternatives: Array<{ type: ParserType; score: number }>;
}

/** An extractor that throws during detection must not take the run down. */
function safeDetect(extractor: Extractor, input: ExtractorInput): number {
  try {
    return extractor.detect(input);
  } catch {
    return 0;
  }
}

/** Picks the best extractor for a page, or null when none applies. */
export function selectExtractor(input: ExtractorInput): ExtractorSelection | null {
  const scored = EXTRACTORS.map((extractor) => ({
    extractor,
    score: safeDetect(extractor, input),
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return null;

  return {
    extractor: best.extractor,
    score: best.score,
    alternatives: scored.slice(1, 4).map((s) => ({ type: s.extractor.type, score: s.score })),
  };
}

/** Looks an extractor up by its declared parser type. */
export function extractorFor(type: ParserType): Extractor | undefined {
  return EXTRACTORS.find((e) => e.type === type);
}

export type ExtractionRun = ExtractionOutcome & {
  selectedScore: number;
  usedConfiguredParser: boolean;
};

/**
 * Runs extraction, preferring the source's configured parser when it still
 * fits the page and falling back to whatever fits best otherwise.
 *
 * A source whose configured parser stops fitting is exactly the "the page
 * changed structure" case, so the mismatch is reported as a warning rather
 * than swallowed.
 */
export function extract(input: ExtractorInput, configuredParser?: ParserType | null): ExtractionRun {
  const selection = selectExtractor(input);

  if (configuredParser && configuredParser !== "NONE" && configuredParser !== "DEMO_FIXTURE") {
    const configured = extractorFor(configuredParser);
    if (configured) {
      const configuredScore = safeDetect(configured, input);

      if (configuredScore > 0) {
        const outcome = configured.extract(input);
        const warnings = [...outcome.warnings];
        if (
          selection &&
          selection.extractor.type !== configuredParser &&
          selection.score > configuredScore + 0.25
        ) {
          warnings.push(
            `This source is configured to use the ${configured.label} extractor, but the page now looks more like ${selection.extractor.label}. It may have changed structure.`,
          );
        }
        return { ...outcome, warnings, selectedScore: configuredScore, usedConfiguredParser: true };
      }

      if (selection) {
        const outcome = selection.extractor.extract(input);
        return {
          ...outcome,
          warnings: [
            `The configured ${configured.label} extractor no longer fits this page, so ${selection.extractor.label} was used instead. The source's structure has probably changed.`,
            ...outcome.warnings,
          ],
          selectedScore: selection.score,
          usedConfiguredParser: false,
        };
      }
    }
  }

  if (!selection) {
    return {
      records: [],
      structureHash: "",
      parserUsed: "NONE",
      warnings: [
        "No extractor recognised this page. It may not contain records, or it may need an adapter this version does not include.",
      ],
      selectedScore: 0,
      usedConfiguredParser: false,
    };
  }

  return {
    ...selection.extractor.extract(input),
    selectedScore: selection.score,
    usedConfiguredParser: false,
  };
}
