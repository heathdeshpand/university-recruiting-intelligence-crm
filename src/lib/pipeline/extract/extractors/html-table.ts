import { structureHash } from "@/lib/util/hash";
import { looksLikePersonName } from "@/lib/util/names";
import {
  guessNameColumn,
  loadHtml,
  mapHeaders,
  parseTables,
  stripChrome,
  type ParsedTable,
} from "@/lib/pipeline/extract/dom";
import type { ExtractedRecord, Extractor, ExtractionOutcome, ExtractorInput } from "@/lib/pipeline/extract/types";

/**
 * Tabular rosters.
 *
 * Handles both well-formed tables with meaningful headers and tables with no
 * usable headers at all, by falling back to whichever column actually reads
 * like a list of names.
 */

function usableTables(input: ExtractorInput): ParsedTable[] {
  const $ = loadHtml(input.body);
  stripChrome($);
  return parseTables($, input.url).filter((t) => t.rows.length >= 2);
}

function tableScore(table: ParsedTable): number {
  const headerMap = mapHeaders(table.headers);
  const hasNameHeader = Object.values(headerMap).some(
    (f) => f === "name" || f === "lastName" || f === "firstName",
  );
  const nameCol = guessNameColumn(table.rows);
  if (!hasNameHeader && nameCol === -1) return 0;

  // Capped below the specialised roster extractors on purpose: a page that a
  // more specific strategy understands should go to that strategy, even
  // though a plain table read would also "work" and lose the sport.
  let score = 0.45;
  if (hasNameHeader) score += 0.25;
  if (nameCol !== -1) score += 0.12;
  if (table.rows.length >= 5) score += 0.05;
  return Math.min(0.87, score);
}

export const htmlTableExtractor: Extractor = {
  type: "HTML_TABLE",
  label: "HTML table",
  description:
    "Reads rosters laid out as HTML tables, mapping column headers onto candidate fields and falling back to the column that most looks like names.",

  detect(input) {
    if (!input.contentType.includes("html")) return 0;
    const tables = usableTables(input);
    if (tables.length === 0) return 0;
    return Math.max(...tables.map(tableScore));
  },

  extract(input): ExtractionOutcome {
    const tables = usableTables(input);
    const records: ExtractedRecord[] = [];
    const warnings: string[] = [];
    const structureParts: string[] = [];

    for (const table of tables) {
      if (tableScore(table) === 0) continue;

      const headerMap = mapHeaders(table.headers);
      structureParts.push(table.headers.join(","));

      const explicitNameCol = Number(
        Object.entries(headerMap).find(([, f]) => f === "name")?.[0] ?? -1,
      );
      const firstCol = Number(Object.entries(headerMap).find(([, f]) => f === "firstName")?.[0] ?? -1);
      const lastCol = Number(Object.entries(headerMap).find(([, f]) => f === "lastName")?.[0] ?? -1);
      const fallbackNameCol = guessNameColumn(table.rows);

      for (const [rowIndex, row] of table.rows.entries()) {
        const raw: Record<string, unknown> = {};
        table.headers.forEach((h, i) => {
          if (h) raw[h] = row[i] ?? null;
        });
        if (table.headers.length === 0) {
          row.forEach((cell, i) => {
            raw[`column_${i + 1}`] = cell;
          });
        }

        let name: string | undefined;
        if (firstCol >= 0 && lastCol >= 0) {
          name = [row[firstCol], row[lastCol]].filter(Boolean).join(" ").trim();
        } else if (explicitNameCol >= 0) {
          name = row[explicitNameCol];
        } else if (fallbackNameCol >= 0) {
          name = row[fallbackNameCol];
        }

        if (!name || !looksLikePersonName(name)) continue;

        const valueFor = (field: string): string | undefined => {
          const idx = Object.entries(headerMap).find(([, f]) => f === field)?.[0];
          if (idx === undefined) return undefined;
          const v = row[Number(idx)];
          return v && v.length > 0 ? v : undefined;
        };

        const profileUrl =
          table.rowLinks[rowIndex]?.[explicitNameCol >= 0 ? explicitNameCol : fallbackNameCol] ??
          table.rowLinks[rowIndex]?.find(Boolean);

        records.push({
          name,
          organization: valueFor("organization"),
          role: valueFor("role"),
          major: valueFor("major"),
          year: valueFor("year"),
          sport: valueFor("sport"),
          email: valueFor("email"),
          profileUrl: profileUrl ?? undefined,
          raw,
        });
      }
    }

    if (tables.length > 0 && records.length === 0) {
      warnings.push(
        "Tables were present but no column contained values that read as person names. The page may list something other than people.",
      );
    }

    return {
      records,
      structureHash: structureHash(structureParts),
      parserUsed: "HTML_TABLE",
      warnings,
    };
  },
};
