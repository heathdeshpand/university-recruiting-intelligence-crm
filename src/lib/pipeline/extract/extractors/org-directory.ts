import { structureHash } from "@/lib/util/hash";
import { looksLikePersonName, parseName } from "@/lib/util/names";
import { containsAnyPhrase, normalizeWhitespace } from "@/lib/util/text";
import { LEADERSHIP_ROLES } from "@/lib/config/organizations";
import {
  findEmail,
  findRepeatedBlocks,
  findYear,
  loadHtml,
  stripChrome,
  type RepeatedBlock,
} from "@/lib/pipeline/extract/dom";
import type { ExtractedRecord, Extractor, ExtractionOutcome, ExtractorInput } from "@/lib/pipeline/extract/types";

/**
 * Organization and chapter directories.
 *
 * These pages are the messiest of the lot: a heading naming an organization,
 * then a repeated block per person, with the role attached in whatever way
 * the CMS author felt like that day ("Jane Doe, President", "Jane Doe —
 * President", "President: Jane Doe"). The extractor pulls the name out of the
 * block and tries the common role separators around it.
 */

const ROLE_KEYWORDS = LEADERSHIP_ROLES.flatMap((r) => r.keywords);

/**
 * Resolves a block into a name, an optional role, and any leftover text.
 *
 * Structure first: if the card marks the name up separately -- a `.name`
 * span, a link, a heading -- that is far more reliable than splitting the
 * flattened text, which silently glues "Silva, Leila" to "Political Science".
 * Text splitting is the fallback for markup that offers no structure.
 */
function resolveBlock(block: RepeatedBlock): {
  name?: string;
  role?: string;
  note?: string;
  major?: string;
  year?: string;
} {
  for (const candidate of block.nameCandidates) {
    if (!looksLikePersonName(candidate)) continue;

    const remainder = normalizeWhitespace(block.remainder);
    const isRole = remainder.length > 0 && containsAnyPhrase(remainder, ROLE_KEYWORDS);

    if (isRole) {
      return { name: candidate, role: stripLeadingSeparators(remainder) };
    }

    // Anything that is not the name and not a role is text the source
    // published about this person. Structured parts of it (major, class year)
    // are pulled out; the rest is kept verbatim, because work-experience and
    // job-search signals may only come from text a source actually stated.
    const detail = parseDetailLine(stripLeadingSeparators(remainder));
    return { name: candidate, major: detail.major, year: detail.year, note: detail.note };
  }

  const fromText = splitNameAndRole(block.text);
  if (!fromText.name) return {};

  const remainder = stripLeadingSeparators(
    normalizeWhitespace(block.text.slice(fromText.name.length)),
  );
  if (fromText.role) return { name: fromText.name, role: fromText.role };

  const detail = parseDetailLine(remainder);
  return { name: fromText.name, major: detail.major, year: detail.year, note: detail.note };
}

function stripLeadingSeparators(value: string): string {
  return value.replace(/^[\s,;:–—|·•-]+/, "").trim();
}

/**
 * Splits a card's detail line into the fields it actually carries.
 *
 * Directory cards commonly read "Economics · Class of 2027" or
 * "Political Science, Class of 2027". Dumping all of that into a free-text
 * note would discard the major -- which is one of the strongest corroborating
 * fields entity resolution has. Each separated segment is classified instead:
 * a year phrase becomes the year, a short noun-like phrase becomes the major,
 * and anything sentence-like stays as published text.
 */
export function parseDetailLine(detail: string): {
  major?: string;
  year?: string;
  note?: string;
} {
  const segments = detail
    .split(/\s*[·•|;]\s*|\s+[–—]\s+/)
    .flatMap((part) => part.split(/,\s*(?=Class of|class of)/))
    .map((part) => stripLeadingSeparators(part))
    .filter(Boolean);

  let major: string | undefined;
  let year: string | undefined;
  const notes: string[] = [];

  for (const segment of segments) {
    const classYear = segment.match(/(?:class of\s*)?['’]?((?:19|20)\d{2}|\d{2})\b/i);
    const isYearPhrase = /^(class of\s*)?['’]?(?:(?:19|20)\d{2}|\d{2})$/i.test(segment.trim());

    if (isYearPhrase && classYear?.[1]) {
      const raw = classYear[1];
      year = raw.length === 2 ? String(2000 + Number.parseInt(raw, 10)) : raw;
      continue;
    }

    const words = segment.split(/\s+/).filter(Boolean);
    const looksLikeAProgramName =
      !major &&
      segment.length <= 45 &&
      words.length <= 5 &&
      !/[.!?]$/.test(segment) &&
      !/\d/.test(segment) &&
      /^[A-Z]/.test(segment);

    if (looksLikeAProgramName) {
      major = segment;
      continue;
    }

    notes.push(segment);
  }

  return { major, year, note: notes.length > 0 ? notes.join(". ") : undefined };
}

/** Splits "Michael Johnson, Treasurer" into its name and role halves. */
function splitNameAndRole(text: string): { name?: string; role?: string } {
  const line = normalizeWhitespace(text);

  // "President: Michael Johnson"
  const leadingRole = line.match(/^([A-Za-z /&'-]{3,40})\s*[:–—-]\s*(.+)$/);
  if (leadingRole) {
    const [, maybeRole, maybeName] = leadingRole;
    if (
      maybeRole &&
      maybeName &&
      containsAnyPhrase(maybeRole, ROLE_KEYWORDS) &&
      looksLikePersonName(maybeName)
    ) {
      return { name: maybeName.trim(), role: maybeRole.trim() };
    }
  }

  // "Michael Johnson, Treasurer" / "Michael Johnson - Treasurer"
  for (const separator of [",", "–", "—", "|", "-", "•"]) {
    const idx = line.indexOf(separator);
    if (idx <= 0) continue;
    const head = line.slice(0, idx).trim();
    const tail = line.slice(idx + 1).trim();
    if (looksLikePersonName(head)) {
      const isRole = tail.length > 0 && containsAnyPhrase(tail, ROLE_KEYWORDS);
      return { name: head, role: isRole ? tail : undefined };
    }
  }

  // A bare name, possibly followed by a role on the next line.
  const firstLine = line.split(/\s{2,}/)[0] ?? line;
  if (looksLikePersonName(firstLine)) {
    const rest = line.slice(firstLine.length).trim();
    const isRole = rest.length > 0 && containsAnyPhrase(rest, ROLE_KEYWORDS);
    return { name: firstLine, role: isRole ? rest : undefined };
  }

  return {};
}

function blocksFor(input: ExtractorInput): RepeatedBlock[] {
  const $ = loadHtml(input.body);
  stripChrome($);
  return findRepeatedBlocks($, input.url);
}

export const orgDirectoryExtractor: Extractor = {
  type: "ORG_DIRECTORY",
  label: "Organization directory",
  description:
    "Reads organization and chapter directories where each person is a repeated card or list item under an organization heading.",

  detect(input) {
    if (!input.contentType.includes("html")) return 0;
    const blocks = blocksFor(input);
    if (blocks.length < 3) return 0;

    const named = blocks.filter((b) => resolveBlock(b).name).length;
    if (named < 3) return 0;

    const ratio = named / blocks.length;
    return Math.min(0.95, 0.4 + ratio * 0.5);
  },

  extract(input): ExtractionOutcome {
    const blocks = blocksFor(input);
    const records: ExtractedRecord[] = [];
    const warnings: string[] = [];
    const structureParts: string[] = [];

    for (const block of blocks) {
      const { name, role, note, major, year } = resolveBlock(block);
      if (!name) continue;

      const parsed = parseName(name);
      if (!parsed.last) continue;

      if (block.heading) structureParts.push(block.heading);

      records.push({
        name,
        // The nearest heading is nearly always the organization these people
        // belong to; on a Greek directory it is the chapter name.
        organization: block.heading,
        role,
        note,
        major,
        year: year ?? findYear(block.text),
        email: findEmail(block.text),
        profileUrl: block.links.find((l) => l.text.includes(parsed.last!))?.href,
        raw: {
          blockText: block.text.slice(0, 500),
          heading: block.heading ?? null,
          links: block.links.slice(0, 5),
        },
      });
    }

    if (blocks.length >= 3 && records.length === 0) {
      warnings.push(
        "Repeated blocks were found but none of them contained a recognisable person name. This page may list organizations rather than people.",
      );
    }

    return {
      records,
      structureHash: structureHash(structureParts.length > 0 ? structureParts : ["org-directory"]),
      parserUsed: "ORG_DIRECTORY",
      warnings,
    };
  },
};
