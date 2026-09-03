import { normalizeWhitespace, stripDiacritics, titleCase } from "@/lib/util/text";

/**
 * Person-name parsing and nickname resolution.
 *
 * Source pages write the same person a dozen ways: "Johnson, Michael A.",
 * "Mike Johnson '27", "MICHAEL JOHNSON (President)". This module turns any of
 * those into a comparable structure while keeping the original string intact
 * somewhere else. It never guesses gender, ethnicity, or any other attribute
 * from a name -- it only splits and canonicalizes.
 */

export interface ParsedName {
  /** Cleaned display form, e.g. "Michael A. Johnson". */
  display: string;
  first?: string;
  middleInitial?: string;
  last?: string;
  suffix?: string;
  /** Nickname-expanded, punctuation-free key used for blocking. */
  key: string;
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** Titles and honorifics that appear in roster pages and are not part of a name. */
const PREFIXES = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "professor", "coach"]);

/**
 * Nickname -> canonical given name.
 *
 * Deliberately conservative: only pairs that are unambiguous in common US
 * usage. Ambiguous short forms (e.g. "Al", which maps to Albert, Alan,
 * Alfred and more) are left out, because collapsing them would create false
 * matches that entity resolution then has to undo.
 */
const NICKNAMES: Record<string, string> = {
  abby: "abigail", ali: "alexandra", alex: "alexander", andy: "andrew", annie: "ann",
  becky: "rebecca", ben: "benjamin", beth: "elizabeth", betsy: "elizabeth", bill: "william",
  billy: "william", bob: "robert", bobby: "robert", brad: "bradley", cathy: "catherine",
  charlie: "charles", chris: "christopher", chuck: "charles", cindy: "cynthia",
  dan: "daniel", danny: "daniel", dave: "david", deb: "deborah", debbie: "deborah",
  dick: "richard", don: "donald", doug: "douglas", ed: "edward", eddie: "edward",
  ellie: "eleanor", fran: "frances", frank: "francis", fred: "frederick", gabe: "gabriel",
  greg: "gregory", hank: "henry", ike: "isaac", jack: "john", jake: "jacob",
  jen: "jennifer", jenny: "jennifer", jerry: "gerald", jess: "jessica", jim: "james",
  jimmy: "james", joe: "joseph", joey: "joseph", jon: "jonathan", josh: "joshua",
  judy: "judith", kate: "katherine", kathy: "katherine", katie: "katherine",
  ken: "kenneth", kenny: "kenneth", kim: "kimberly", larry: "lawrence", len: "leonard",
  liz: "elizabeth", lizzy: "elizabeth", lou: "louis", maggie: "margaret", matt: "matthew",
  meg: "margaret", megan: "meghan", mich: "michael", mike: "michael", mitch: "mitchell",
  molly: "mary", nan: "nancy", nate: "nathaniel", nick: "nicholas", pat: "patrick",
  patty: "patricia", peggy: "margaret", pete: "peter", phil: "philip", ray: "raymond",
  rich: "richard", rick: "richard", rob: "robert", rod: "rodney", ron: "ronald",
  russ: "russell", sam: "samuel", sandy: "sandra", steve: "steven", sue: "susan",
  susie: "susan", ted: "theodore", terry: "terrence", tim: "timothy", tom: "thomas",
  tommy: "thomas", tony: "anthony", trish: "patricia", vicky: "victoria", will: "william",
  zach: "zachary",
};

/** Spelling variants that should collapse to a single canonical form. */
const SPELLING_VARIANTS: Record<string, string> = {
  katherine: "katherine", kathryn: "katherine", catherine: "katherine",
  steven: "steven", stephen: "steven",
  sean: "shawn", shaun: "shawn",
  jon: "jonathan", johnathan: "jonathan",
  eric: "eric", erik: "eric",
  brian: "brian", bryan: "brian",
  aaron: "aaron", aron: "aaron",
  megan: "meghan", meagan: "meghan",
  sara: "sarah",
  mark: "mark", marc: "mark",
  carl: "carl", karl: "carl",
  alan: "alan", allan: "alan", allen: "alan",
};

/** Expands a nickname and folds spelling variants. Returns lowercase. */
export function canonicalGivenName(name: string): string {
  const clean = stripDiacritics(name).toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return "";
  const expanded = NICKNAMES[clean] ?? clean;
  return SPELLING_VARIANTS[expanded] ?? expanded;
}

/** True when two given names are the same name written differently. */
export function areGivenNamesEquivalent(a: string, b: string): boolean {
  const ca = canonicalGivenName(a);
  const cb = canonicalGivenName(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  // "M." against "Michael": an initial is compatible with any name it starts.
  if (ca.length === 1 || cb.length === 1) return ca[0] === cb[0];
  return false;
}

/**
 * Parses a raw name string into components.
 *
 * Handles "Last, First M." as well as "First M. Last", strips honorifics,
 * class-year annotations ("'27"), and parenthetical roles.
 */
export function parseName(raw: string): ParsedName {
  let s = normalizeWhitespace(stripDiacritics(raw));

  // Remove parentheticals and bracketed annotations: roles, pronunciations.
  s = s.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  // Remove class-year annotations such as '27 or ’27.
  s = s.replace(/['’]\s?\d{2,4}\b/g, " ");
  // Remove anything after a separator that introduces a role or org.
  s = s.split(/\s+[|–—-]\s+/)[0] ?? s;
  s = normalizeWhitespace(s.replace(/[^A-Za-z ,.'-]/g, " "));

  if (!s) return { display: normalizeWhitespace(raw), key: "" };

  // "Last, First Middle" -> "First Middle Last"
  if (s.includes(",")) {
    const [lastPart, ...rest] = s.split(",");
    const remainder = normalizeWhitespace(rest.join(" "));
    const lastTokens = normalizeWhitespace(lastPart ?? "").split(" ");
    const trailingSuffix = lastTokens.length > 1 && isSuffix(lastTokens[lastTokens.length - 1]!);
    if (remainder && !isSuffix(remainder.replace(/\./g, ""))) {
      s = normalizeWhitespace(`${remainder} ${lastPart}`);
    } else if (trailingSuffix) {
      s = normalizeWhitespace(lastPart ?? "");
    }
  }

  let tokens = s.split(" ").filter(Boolean);

  // Drop honorifics.
  while (tokens.length > 1 && PREFIXES.has(bare(tokens[0]!).toLowerCase())) tokens = tokens.slice(1);

  // Pull off a suffix.
  let suffix: string | undefined;
  if (tokens.length > 1 && isSuffix(tokens[tokens.length - 1]!)) {
    suffix = titleCase(bare(tokens.pop()!));
  }

  if (tokens.length === 0) return { display: normalizeWhitespace(raw), key: "" };

  let first: string | undefined;
  let last: string | undefined;
  let middleInitial: string | undefined;

  if (tokens.length === 1) {
    last = tokens[0];
  } else {
    first = tokens[0];
    last = tokens[tokens.length - 1];
    const middles = tokens.slice(1, -1).filter((t) => bare(t).length > 0);
    if (middles.length > 0) middleInitial = bare(middles[0]!)[0]!.toUpperCase();
  }

  const displayParts = [
    first ? titleCase(bare(first)) : undefined,
    middleInitial ? `${middleInitial}.` : undefined,
    last ? titleCase(bare(last)) : undefined,
    suffix,
  ].filter(Boolean);

  const key = [first ? canonicalGivenName(first) : "", last ? bare(last).toLowerCase() : ""]
    .filter(Boolean)
    .join(" ");

  return {
    display: displayParts.join(" ") || normalizeWhitespace(raw),
    first: first ? titleCase(bare(first)) : undefined,
    middleInitial,
    last: last ? titleCase(bare(last)) : undefined,
    suffix,
    key,
  };
}

function bare(token: string): string {
  return token.replace(/[^A-Za-z'-]/g, "");
}

function isSuffix(token: string): boolean {
  return SUFFIXES.has(bare(token).toLowerCase());
}

/**
 * True when a string looks like a person's name rather than a heading, a
 * navigation label, or a sentence. Used to keep extractors from turning page
 * furniture into candidate records.
 */
export function looksLikePersonName(raw: string): boolean {
  const s = normalizeWhitespace(raw);
  if (s.length < 3 || s.length > 60) return false;
  if (/\d/.test(s.replace(/['’]\s?\d{2,4}\b/g, ""))) return false;
  if (/[@:/\\]|https?/i.test(s)) return false;

  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;

  // Sentence-like text and page furniture.
  //
  // Matched as whole words, not substrings. Substring matching looks harmless
  // until it quietly rejects everyone surnamed Moore ("more"), Allen ("all")
  // or Calloway ("all") -- which is exactly the kind of silent data loss this
  // pipeline must not have.
  const lowered = s.toLowerCase();
  const NON_NAME_WORDS = new Set([
    "click", "here", "more", "home", "about", "contact", "search", "menu", "login",
    "read", "view", "all", "page", "list", "join", "learn", "apply", "the", "and",
    "university", "college", "department", "office", "copyright", "reserved",
    "submit", "sign", "register", "back", "next", "previous", "toggle",
  ]);
  const loweredWords = lowered.split(/[^a-z']+/).filter(Boolean);
  if (loweredWords.some((w) => NON_NAME_WORDS.has(w))) return false;

  // Every word should be alphabetic-ish and capitalized or fully uppercase.
  return words.every((w) => {
    const b = bare(w);
    if (b.length === 0) return false;
    if (b.length === 1 && !w.includes(".")) return false;
    return /^[A-Z]/.test(b) || b === b.toUpperCase();
  });
}
