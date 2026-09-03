import { structureHash } from "@/lib/util/hash";
import { looksLikePersonName } from "@/lib/util/names";
import { mapHeaders } from "@/lib/pipeline/extract/dom";
import type { ExtractedRecord, Extractor, ExtractionOutcome, ExtractorInput } from "@/lib/pipeline/extract/types";

/**
 * CSV.
 *
 * The documented manual fallback: when a source cannot be fetched or parsed
 * automatically, a recruiter can obtain the data by legitimate means and
 * import it as CSV, and it flows through the identical downstream pipeline.
 */

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.length > 0));
}

function parse(input: ExtractorInput): { headers: string[]; rows: string[][] } | null {
  const rows = parseCsv(input.body);
  if (rows.length < 2) return null;
  const [header, ...rest] = rows;
  return { headers: header!.map((h) => h.toLowerCase()), rows: rest };
}

export const csvExtractor: Extractor = {
  type: "CSV",
  label: "CSV",
  description: "Reads comma-separated data, used for manual imports and CSV endpoints.",

  detect(input) {
    const isCsv = input.contentType.includes("csv") || input.url.toLowerCase().endsWith(".csv");
    if (!isCsv) return 0;
    const parsed = parse(input);
    if (!parsed) return 0;
    const map = mapHeaders(parsed.headers);
    return Object.values(map).some((f) => f.toLowerCase().includes("name")) ? 1 : 0.6;
  },

  extract(input): ExtractionOutcome {
    const parsed = parse(input);
    if (!parsed) {
      return {
        records: [],
        structureHash: structureHash(["csv-empty"]),
        parserUsed: "CSV",
        warnings: ["The file did not contain a header row and at least one data row."],
      };
    }

    const map = mapHeaders(parsed.headers);
    const idxOf = (field: string) => {
      const entry = Object.entries(map).find(([, f]) => f === field);
      return entry ? Number(entry[0]) : -1;
    };

    const nameCol = idxOf("name");
    const firstCol = idxOf("firstName");
    const lastCol = idxOf("lastName");

    const records: ExtractedRecord[] = [];
    for (const row of parsed.rows) {
      const raw: Record<string, unknown> = {};
      parsed.headers.forEach((h, i) => {
        raw[h] = row[i] ?? null;
      });

      const name =
        firstCol >= 0 && lastCol >= 0
          ? [row[firstCol], row[lastCol]].filter(Boolean).join(" ")
          : nameCol >= 0
            ? row[nameCol]
            : undefined;

      if (!name || !looksLikePersonName(name)) continue;

      const val = (field: string) => {
        const i = idxOf(field);
        return i >= 0 && row[i] ? row[i] : undefined;
      };

      records.push({
        name,
        organization: val("organization"),
        role: val("role"),
        major: val("major"),
        year: val("year"),
        sport: val("sport"),
        email: val("email"),
        raw,
      });
    }

    return {
      records,
      structureHash: structureHash(parsed.headers),
      parserUsed: "CSV",
      warnings: [],
    };
  },
};
