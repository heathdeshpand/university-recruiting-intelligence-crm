import { structureHash } from "@/lib/util/hash";
import { looksLikePersonName } from "@/lib/util/names";
import { normalizeWhitespace } from "@/lib/util/text";
import {
  guessNameColumn,
  loadHtml,
  mapHeaders,
  pageTitle,
  parseTables,
  stripChrome,
} from "@/lib/pipeline/extract/dom";
import type { ExtractedRecord, Extractor, ExtractionOutcome } from "@/lib/pipeline/extract/types";

/**
 * Varsity athletics rosters.
 *
 * Athletics sites are their own dialect: columns like "No.", "Pos.", "Cl.",
 * "Ht.", "Hometown", and a team name that only appears in the page title. A
 * general table extractor gets the names but loses the sport and the class
 * year, so this specialisation exists to keep them.
 */

const CLASS_YEARS: Record<string, string> = {
  fr: "Freshman", "fr.": "Freshman", freshman: "Freshman",
  so: "Sophomore", "so.": "Sophomore", sophomore: "Sophomore",
  jr: "Junior", "jr.": "Junior", junior: "Junior",
  sr: "Senior", "sr.": "Senior", senior: "Senior",
  gr: "Graduate", "gr.": "Graduate", graduate: "Graduate",
  "r-fr": "Freshman", "r-so": "Sophomore", "r-jr": "Junior", "r-sr": "Senior",
};

/** Turns a class standing into an expected graduation year. */
export function classYearToGraduationYear(
  classYear: string,
  now = new Date(),
): number | undefined {
  const key = classYear.trim().toLowerCase();
  const standing = CLASS_YEARS[key];
  if (!standing) return undefined;

  const yearsRemaining: Record<string, number> = {
    Freshman: 4, Sophomore: 3, Junior: 2, Senior: 1, Graduate: 1,
  };
  const remaining = yearsRemaining[standing];
  if (remaining === undefined) return undefined;

  // An academic year that has passed its northern-hemisphere autumn start
  // graduates in the following calendar year.
  const academicBase = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  return academicBase + remaining - 1;
}

/** Pulls a sport out of a roster page's title, e.g. "Men's Soccer Roster". */
export function sportFromTitle(title: string): string | undefined {
  const cleaned = normalizeWhitespace(title)
    .replace(/\b(roster|schedule|team|20\d{2}(-\d{2})?)\b/gi, " ")
    .replace(/\b(men'?s|women'?s)\b/gi, " ")
    .replace(/[|·—–-].*$/, " ");
  const words = normalizeWhitespace(cleaned).split(" ").filter((w) => w.length > 2);
  return words.length > 0 ? words.slice(0, 3).join(" ") : undefined;
}

export const athleticsRosterExtractor: Extractor = {
  type: "ATHLETICS_ROSTER",
  label: "Athletics roster",
  description:
    "Reads varsity athletics rosters, understanding athletics-specific columns and recovering the sport from the page title.",

  detect(input) {
    if (!input.contentType.includes("html")) return 0;

    const $ = loadHtml(input.body);
    stripChrome($);
    const tables = parseTables($, input.url).filter((t) => t.rows.length >= 2);
    if (tables.length === 0) return 0;

    const headerText = tables.flatMap((t) => t.headers).join(" ");
    const athleticsColumns = ["pos", "pos.", "ht", "ht.", "wt", "wt.", "cl", "cl.", "hometown", "no.", "#"];
    const hits = athleticsColumns.filter((c) => headerText.includes(c)).length;
    if (hits === 0) return 0;

    const hasNames = tables.some((t) => guessNameColumn(t.rows) !== -1 || mapHeaders(t.headers));
    if (!hasNames) return 0;

    // Only outbid the generic table extractor when the athletics vocabulary is
    // clearly present.
    return Math.min(0.98, 0.6 + hits * 0.1);
  },

  extract(input): ExtractionOutcome {
    const $ = loadHtml(input.body);
    stripChrome($);
    const title = pageTitle($);
    const sport = input.sourceType === "ATHLETICS" ? sportFromTitle(title) : undefined;
    const tables = parseTables($, input.url).filter((t) => t.rows.length >= 2);

    const records: ExtractedRecord[] = [];
    const warnings: string[] = [];
    const structureParts: string[] = [];

    for (const table of tables) {
      const headerMap = mapHeaders(table.headers);
      structureParts.push(table.headers.join(","));

      const idxOf = (field: string) => {
        const entry = Object.entries(headerMap).find(([, f]) => f === field);
        return entry ? Number(entry[0]) : -1;
      };

      const nameCol = idxOf("name") >= 0 ? idxOf("name") : guessNameColumn(table.rows);
      const firstCol = idxOf("firstName");
      const lastCol = idxOf("lastName");
      const roleCol = idxOf("role");
      const yearCol = idxOf("year");
      const majorCol = idxOf("major");
      const sportCol = idxOf("sport");

      for (const row of table.rows) {
        const raw: Record<string, unknown> = {};
        table.headers.forEach((h, i) => {
          if (h) raw[h] = row[i] ?? null;
        });

        let name: string | undefined;
        if (firstCol >= 0 && lastCol >= 0) name = [row[firstCol], row[lastCol]].filter(Boolean).join(" ");
        else if (nameCol >= 0) name = row[nameCol];

        if (!name || !looksLikePersonName(name)) continue;

        // A roster that lists several teams on one page names the sport per
        // row; a single-team page only names it in the title.
        const rowSport = sportCol >= 0 && row[sportCol] ? row[sportCol] : undefined;
        const effectiveSport = rowSport ?? sport;

        const rawYear = yearCol >= 0 ? row[yearCol] : undefined;
        const graduationYear = rawYear ? classYearToGraduationYear(rawYear) : undefined;

        records.push({
          name,
          organization: effectiveSport ? `${effectiveSport} (Varsity)` : title || undefined,
          sport: effectiveSport,
          // A class standing is converted to a year, but the original string
          // is kept in `raw` so the conversion is auditable.
          year: graduationYear ? String(graduationYear) : rawYear,
          role: roleCol >= 0 ? row[roleCol] : undefined,
          major: majorCol >= 0 ? row[majorCol] : undefined,
          raw: { ...raw, pageTitle: title, derivedGraduationYear: graduationYear ?? null },
        });
      }
    }

    if (tables.length > 0 && records.length === 0) {
      warnings.push("The page looked like an athletics roster but no rows contained person names.");
    }

    return {
      records,
      structureHash: structureHash(structureParts),
      parserUsed: "ATHLETICS_ROSTER",
      warnings,
    };
  },
};
