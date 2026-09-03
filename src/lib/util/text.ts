/**
 * String similarity and phonetic helpers used by normalization and entity
 * resolution. All pure functions, all unit-tested.
 */

/** Strips accents, collapses whitespace, lowercases. */
export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function slugify(input: string): string {
  return stripDiacritics(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function titleCase(input: string): string {
  return normalizeWhitespace(input)
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Mc)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(O')([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

/**
 * Jaro-Winkler similarity in [0, 1].
 *
 * Chosen over plain edit distance because it weights a shared prefix heavily,
 * which matches how human name variants actually differ ("Kathryn"/"Katherine"
 * rather than arbitrary character noise).
 */
export function jaroWinkler(a: string, b: string, prefixScale = 0.1): number {
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);
  const s1Matches = new Array<boolean>(s1.length).fill(false);
  const s2Matches = new Array<boolean>(s2.length).fill(false);

  let matches = 0;
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  transpositions /= 2;

  const jaro =
    (matches / s1.length + matches / s2.length + (matches - transpositions) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * prefixScale * (1 - jaro);
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  let prev = Array.from({ length: s2.length + 1 }, (_, i) => i);
  let curr = new Array<number>(s2.length + 1).fill(0);

  for (let i = 1; i <= s1.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[s2.length];
}

/** Edit distance expressed as a similarity in [0, 1]. */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * A compact phonetic key (a simplified Metaphone).
 *
 * Used only for *blocking* -- grouping records that are worth comparing in
 * detail -- never for deciding a match on its own. "Smith" and "Smyth" share
 * a key so they get compared; whether they are the same person is then
 * settled by the full scoring pass.
 */
export function phoneticKey(input: string): string {
  let s = stripDiacritics(input).toUpperCase().replace(/[^A-Z]/g, "");
  if (s.length === 0) return "";

  // Leading digraphs that are pronounced as a single sound.
  s = s
    .replace(/^KN/, "N")
    .replace(/^GN/, "N")
    .replace(/^PN/, "N")
    .replace(/^AE/, "E")
    .replace(/^WR/, "R")
    .replace(/^PS/, "S")
    .replace(/^X/, "S");

  const first = s[0];

  s = s
    .replace(/PH/g, "F")
    .replace(/SCH/g, "SK")
    .replace(/[SC]H/g, "X")
    .replace(/C([IEY])/g, "S$1")
    .replace(/CK/g, "K")
    .replace(/C/g, "K")
    .replace(/DG([EIY])/g, "J$1")
    .replace(/D/g, "T")
    .replace(/G([IEY])/g, "J$1")
    .replace(/GH/g, "")
    .replace(/G/g, "K")
    .replace(/Q/g, "K")
    .replace(/V/g, "F")
    .replace(/Z/g, "S")
    .replace(/(?<=.)H(?![AEIOU])/g, "")
    .replace(/W(?![AEIOU])/g, "")
    .replace(/Y(?![AEIOU])/g, "");

  // Drop vowels except a leading one, then collapse repeats.
  const head = /^[AEIOU]/.test(first) ? first : "";
  const body = s.slice(1).replace(/[AEIOU]/g, "");
  const key = (head + s[0] + body).replace(/(.)\1+/g, "$1");

  return key.slice(0, 8);
}

/** Jaccard similarity over token sets. */
export function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map((t) => t.toLowerCase()));
  const setB = new Set(b.map((t) => t.toLowerCase()));
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Splits a string into lowercase alphanumeric tokens. */
export function tokenize(input: string): string[] {
  return stripDiacritics(input)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/**
 * Whole-phrase containment.
 *
 * Plain `includes` is wrong for keyword lexicons and fails in ways that are
 * hard to notice: "Adventure" contains "venture", so an outdoor club gets
 * classified as an entrepreneurship organization. Matching on token
 * boundaries instead keeps multi-word phrases working while refusing
 * accidental substrings.
 */
export function containsPhrase(haystack: string, phrase: string): boolean {
  const needle = phrase.trim().toLowerCase();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(haystack.toLowerCase());
}

/** True when any of the phrases appears as a whole phrase. */
export function containsAnyPhrase(haystack: string, phrases: readonly string[]): boolean {
  return phrases.some((p) => containsPhrase(haystack, p));
}

/** The longest phrase that appears in the haystack, or undefined. */
export function longestMatchingPhrase(
  haystack: string,
  phrases: readonly string[],
): string | undefined {
  let best: string | undefined;
  for (const phrase of phrases) {
    if (!containsPhrase(haystack, phrase)) continue;
    if (!best || phrase.length > best.length) best = phrase;
  }
  return best;
}
