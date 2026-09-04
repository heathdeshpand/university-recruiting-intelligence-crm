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
 * Words that mean a string is not a person's name.
 *
 * Every entry here came from a real false positive. Pointed at a university's
 * marketing site, the earlier version of this function accepted "Buy Tickets",
 * "Explore Campus Recreation" and "Men's Wheelchair Basketball Coach" as
 * people, because each is two to four capitalised words with no digits. Title
 * Case is the default style of every navigation menu ever written, so
 * capitalisation carries almost no signal on its own.
 */

/** Verbs that begin a call to action, never a name. */
const ACTION_WORDS = new Set([
  "buy", "shop", "explore", "discover", "learn", "read", "watch", "view", "see",
  "find", "get", "give", "support", "donate", "visit", "apply", "join", "meet",
  "start", "request", "submit", "download", "register", "subscribe", "browse",
  "search", "contact", "follow", "share", "book", "reserve", "order", "renew",
  "report", "enroll", "schedule", "plan", "discover", "experience", "sign",
]);

/**
 * Occupations and titles.
 *
 * Allowed as the FIRST word, because several are also genuine given names --
 * Dean, Chase, Chance, Major, Marshall. Anywhere else they indicate a job
 * title rather than a person.
 */
const OCCUPATION_WORDS = new Set([
  "coach", "director", "manager", "coordinator", "assistant", "associate",
  "professor", "instructor", "lecturer", "advisor", "adviser", "specialist",
  "officer", "administrator", "chancellor", "provost", "principal", "supervisor",
  "analyst", "engineer", "designer", "developer", "consultant", "trainer",
  "counselor", "counsellor", "therapist", "nurse", "physician", "librarian",
  "registrar", "bursar", "custodian", "technician", "staff", "faculty",
  "emeritus", "interim", "acting", "senior", "junior", "head", "chief",
]);

/** Nouns that appear in programme, facility and section names. */
const INSTITUTIONAL_WORDS = new Set([
  "university", "college", "school", "campus", "department", "office", "center",
  "centre", "institute", "program", "programme", "division", "council", "board",
  "committee", "association", "society", "foundation", "alumni", "athletics",
  "recreation", "sports", "sport", "team", "teams", "roster", "schedule",
  "tickets", "ticket", "news", "events", "event", "gallery", "store", "shop",
  "camp", "clinic", "league", "conference", "championship", "tournament",
  "basketball", "football", "soccer", "baseball", "softball", "volleyball",
  "hockey", "lacrosse", "tennis", "golf", "swimming", "wrestling", "rowing",
  "gymnastics", "track", "cross", "field", "wheelchair", "intramural",
  "resources", "services", "admissions", "academics", "research", "giving",
  "library", "housing", "dining", "parking", "safety", "emergency", "health",
  "wellness", "career", "employment", "jobs", "directory", "calendar", "map",
  "home", "about", "overview", "menu", "login", "logout", "account", "help",
  "faq", "policy", "policies", "terms", "privacy", "copyright", "accessibility",
  "sitemap", "archive", "blog", "story", "stories", "profile", "profiles",
  "more", "all", "page", "next", "previous", "back", "top", "here", "click",
  "the", "and", "for", "with", "your", "our", "their", "this", "that",
]);

/**
 * True when a string looks like a person's name.
 *
 * Deliberately strict. In this pipeline a false positive is far more costly
 * than a false negative: a missed name loses one record, while an invented one
 * becomes a candidate, accretes evidence, gets scored, and is presented to a
 * recruiter as a real student.
 */
export function looksLikePersonName(raw: string): boolean {
  const s = normalizeWhitespace(raw);
  if (s.length < 3 || s.length > 60) return false;

  // A digit that is not a class-year annotation.
  if (/\d/.test(s.replace(/['\u2019]\s?\d{2,4}\b/g, ""))) return false;
  if (/[@:/\\]|https?|www\./i.test(s)) return false;
  // Sentence punctuation, or a list of several things. Short abbreviated
  // tokens are removed first, because an initial ("A.") and a suffix ("Jr.")
  // both end in a full stop without making the string a sentence.
  const withoutAbbreviations = s.replace(/\b[A-Za-z]{1,3}\.\s?/g, "");
  if (/[.!?](\s|$)/.test(withoutAbbreviations) || s.includes(";")) return false;

  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;

  for (const [index, word] of words.entries()) {
    // Possessives never appear in a name: "Men's Wheelchair Basketball".
    if (/['\u2019]s$/i.test(word)) return false;

    const bare = word.replace(/[^A-Za-z'-]/g, "").toLowerCase();
    if (!bare) return false;

    if (ACTION_WORDS.has(bare)) return false;
    if (INSTITUTIONAL_WORDS.has(bare)) return false;
    // An occupation is allowed only as the first word, where it may genuinely
    // be a given name -- Dean, Chase, Marshall.
    if (index > 0 && OCCUPATION_WORDS.has(bare)) return false;
  }

  // Every word must read as a name component: capitalised, or fully uppercase
  // as rosters often are, or a single-letter initial with a full stop.
  return words.every((word) => {
    const bare = word.replace(/[^A-Za-z'-]/g, "");
    if (bare.length === 0) return false;
    if (bare.length === 1) return word.includes(".");
    return /^[A-Z]/.test(bare) || bare === bare.toUpperCase();
  });
}
