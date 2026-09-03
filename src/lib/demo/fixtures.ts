import type { AccessMethod, ParserType, SourceType } from "@prisma/client";
import { createRng, type Rng } from "@/lib/demo/random";
import {
  CLUB_SPORTS,
  EXPERIENCE_BLURBS,
  FIRST_NAMES,
  GREEK_CHAPTERS,
  LAST_NAMES,
  LEADERSHIP_TITLES,
  MAJORS,
  STUDENT_ORGS,
  VARSITY_SPORTS,
} from "@/lib/demo/pools";

/**
 * Generates the synthetic demo dataset.
 *
 * The generator's job is not to produce clean data -- it is to produce data
 * with the specific problems the pipeline exists to solve:
 *
 *   * the same person written differently in different sources
 *   * two different people who happen to share a name
 *   * records that disagree about graduation year or major
 *   * records missing the fields entity resolution would most like to have
 *   * a source that returns nothing, and a source that fails outright
 *   * a directory that covers most, but not all, of the population
 *
 * All of it is fictional.
 */

export interface DemoRecord {
  name: string;
  organization?: string;
  role?: string;
  major?: string;
  year?: string;
  sport?: string;
  email?: string;
  note?: string;
  profileUrl?: string;
}

export interface DemoSourceFixture {
  key: string;
  sourceType: SourceType;
  name: string;
  description: string;
  urlPath: string;
  parserType: ParserType;
  accessMethod: AccessMethod;
  /** Records this source serves during collection. */
  records: DemoRecord[];
  /**
   * Simulated failure. The demo has to show what a broken source looks like,
   * because handling one is a real requirement.
   */
  failure?: { kind: "http_error" | "parse_error"; message: string };
  /** Category the university genuinely does not publish. */
  notFound?: boolean;
}

export interface DemoUniversityFixture {
  slug: string;
  name: string;
  shortName: string;
  domain: string;
  athleticName?: string;
  aliases: string[];
  city: string;
  state: string;
  sources: DemoSourceFixture[];
  peopleCount: number;
}

/** Canonical given name -> a nickname a roster might use instead. */
const NICKNAME_FORMS: Record<string, string> = {
  Michael: "Mike", Christopher: "Chris", Matthew: "Matt", Joshua: "Josh",
  Daniel: "Dan", James: "Jim", Andrew: "Andy", Nicholas: "Nick",
  William: "Will", Robert: "Rob", Benjamin: "Ben", Thomas: "Tom",
  Anthony: "Tony", Gregory: "Greg", Patrick: "Pat", Jonathan: "Jon",
  Steven: "Steve", Katherine: "Katie", Elizabeth: "Liz", Samantha: "Sam",
  Jessica: "Jess", Rebecca: "Becky", Victoria: "Vicky", Deborah: "Deb",
};

interface DemoPerson {
  id: number;
  first: string;
  middleInitial: string;
  last: string;
  major: string;
  gradYear: number;
  memberships: Array<{ org: string; role?: string; category: string }>;
  greek?: string;
  clubSports: string[];
  varsitySport?: string;
  inDirectory: boolean;
  experienceBlurb?: string;
  /** True for the deliberately ambiguous name-collision pairs. */
  ambiguousTwin: boolean;
}

/** Produces one of several plausible spellings of a person's name. */
function nameVariant(person: DemoPerson, rng: Rng, allowNickname = true): string {
  const nickname = NICKNAME_FORMS[person.first];
  const roll = rng.next();

  if (allowNickname && nickname && roll < 0.22) return `${nickname} ${person.last}`;
  if (roll < 0.4) return `${person.first} ${person.middleInitial}. ${person.last}`;
  if (roll < 0.5) return `${person.last}, ${person.first}`;
  if (roll < 0.56) return `${person.first} ${person.last}`.toUpperCase();
  return `${person.first} ${person.last}`;
}

function buildPeople(rng: Rng, count: number, profile: UniversityProfile): DemoPerson[] {
  const people: DemoPerson[] = [];
  const currentYear = new Date().getFullYear();

  for (let i = 0; i < count; i++) {
    const first = rng.pick(FIRST_NAMES);
    const last = rng.pick(LAST_NAMES);
    const gradYear = rng.pick([
      currentYear, currentYear, currentYear + 1, currentYear + 1,
      currentYear + 2, currentYear + 3, currentYear - 1,
    ]);

    // Involvement is heavily skewed: most students appear in one place, a
    // small minority appear in several. That skew is what makes the funnel
    // meaningful rather than decorative.
    const orgCount = rng.chance(0.08) ? rng.int(3, 4) : rng.chance(0.25) ? 2 : 1;
    const orgs = rng
      .sample(STUDENT_ORGS, orgCount)
      .map((o) => ({
        org: o.name,
        category: o.category,
        role: rng.chance(0.18) ? rng.pick(LEADERSHIP_TITLES) : undefined,
      }));

    people.push({
      id: i,
      first,
      middleInitial: rng.pick("ABCDEFGHIJKLMNOPRSTW".split("")),
      last,
      major: rng.pick(MAJORS),
      gradYear,
      memberships: profile.hasStudentOrgs ? orgs : [],
      greek: profile.hasGreekLife && rng.chance(0.22) ? rng.pick(GREEK_CHAPTERS) : undefined,
      clubSports:
        profile.hasClubSports && rng.chance(0.2)
          ? rng.sample(CLUB_SPORTS, rng.chance(0.15) ? 2 : 1)
          : [],
      varsitySport: profile.hasAthletics && rng.chance(0.05) ? rng.pick(VARSITY_SPORTS) : undefined,
      // The directory covers most but not all people, so enrichment has both
      // successes and honest failures to show.
      inDirectory: profile.hasDirectory && rng.chance(0.86),
      experienceBlurb: rng.chance(0.12) ? rng.pick(EXPERIENCE_BLURBS) : undefined,
      ambiguousTwin: false,
    });
  }

  // Deliberate name collisions: pairs of genuinely different people who share
  // a first and last name. Entity resolution must NOT merge these on its own.
  const twinCount = Math.max(2, Math.floor(count * 0.02));
  for (let i = 0; i < twinCount; i++) {
    const source = people[rng.int(0, people.length - 1)]!;
    const twin: DemoPerson = {
      ...source,
      id: people.length,
      middleInitial: rng.pick("ABCDEFGHIJKLMNOPRSTW".split("")),
      major: rng.pick(MAJORS.filter((m) => m !== source.major)),
      gradYear: source.gradYear + rng.pick([-2, 2, 3]),
      memberships: profile.hasStudentOrgs ? rng.sample(STUDENT_ORGS, 1).map((o) => ({ org: o.name, category: o.category })) : [],
      greek: undefined,
      clubSports: [],
      varsitySport: undefined,
      ambiguousTwin: true,
    };
    source.ambiguousTwin = true;
    people.push(twin);
  }

  return people;
}

interface UniversityProfile {
  hasGreekLife: boolean;
  hasStudentOrgs: boolean;
  hasClubSports: boolean;
  hasIntramurals: boolean;
  hasAthletics: boolean;
  hasDirectory: boolean;
  hasNewsSource: boolean;
  hasFailingSource: boolean;
}

function buildSources(
  rng: Rng,
  people: DemoPerson[],
  profile: UniversityProfile,
): DemoSourceFixture[] {
  const sources: DemoSourceFixture[] = [];

  if (profile.hasGreekLife) {
    const records: DemoRecord[] = [];
    for (const p of people) {
      if (!p.greek) continue;
      records.push({
        name: nameVariant(p, rng),
        organization: p.greek,
        role: rng.chance(0.2) ? rng.pick(LEADERSHIP_TITLES) : undefined,
        // Greek chapter pages routinely omit academic detail. Those gaps are
        // UNKNOWN, and the pipeline must not read them as absence.
        year: rng.chance(0.45) ? String(p.gradYear) : undefined,
        major: rng.chance(0.3) ? p.major : undefined,
      });
    }
    sources.push({
      key: "greek-life",
      sourceType: "GREEK_LIFE",
      name: "Fraternity & Sorority Life chapter directory",
      description: "Chapter rosters published by the office of fraternity and sorority life.",
      urlPath: "/student-life/greek-life/chapters",
      parserType: "ORG_DIRECTORY",
      accessMethod: "PUBLIC_HTML",
      records: rng.shuffle(records),
    });
  } else {
    sources.push({
      key: "greek-life",
      sourceType: "GREEK_LIFE",
      name: "Greek life",
      description: "No public Greek life roster or chapter directory was found for this university.",
      urlPath: "/student-life/greek-life",
      parserType: "NONE",
      accessMethod: "UNAVAILABLE",
      records: [],
      notFound: true,
    });
  }

  if (profile.hasStudentOrgs) {
    const records: DemoRecord[] = [];
    for (const p of people) {
      for (const m of p.memberships) {
        records.push({
          name: nameVariant(p, rng),
          organization: m.org,
          role: m.role,
          major: rng.chance(0.55) ? p.major : undefined,
          // A small share of records disagree about graduation year. Entity
          // resolution has to treat that as a conflicting factor rather than
          // a disqualifier.
          year: rng.chance(0.6)
            ? String(rng.chance(0.06) ? p.gradYear + rng.pick([-1, 1]) : p.gradYear)
            : undefined,
        });
      }
    }
    sources.push({
      key: "student-organizations",
      sourceType: "STUDENT_ORGANIZATION",
      name: "Registered student organization directory",
      description: "Officer and member listings for registered student organizations.",
      urlPath: "/involvement/organizations",
      parserType: "ORG_DIRECTORY",
      accessMethod: "PUBLIC_HTML",
      records: rng.shuffle(records),
    });
  }

  if (profile.hasClubSports) {
    const records: DemoRecord[] = [];
    for (const p of people) {
      for (const sport of p.clubSports) {
        records.push({
          name: nameVariant(p, rng),
          organization: sport,
          sport: sport.replace(/^Club /, ""),
          role: rng.chance(0.12) ? "Captain" : undefined,
          year: rng.chance(0.5) ? String(p.gradYear) : undefined,
        });
      }
    }
    sources.push({
      key: "club-sports",
      sourceType: "CLUB_SPORT",
      name: "Club sports team rosters",
      description: "Rosters for competitive club sport teams published by campus recreation.",
      urlPath: "/recreation/club-sports/rosters",
      parserType: "HTML_TABLE",
      accessMethod: "PUBLIC_HTML",
      records: rng.shuffle(records),
    });
  }

  if (profile.hasIntramurals) {
    sources.push({
      key: "intramurals",
      sourceType: "INTRAMURAL",
      name: "Intramural sports",
      description:
        "Intramural participation data is not published publicly by this university. Recorded as unavailable, which is not the same as the students having no intramural involvement.",
      urlPath: "/recreation/intramurals",
      parserType: "NONE",
      accessMethod: "UNAVAILABLE",
      records: [],
      notFound: true,
    });
  }

  if (profile.hasAthletics) {
    const records: DemoRecord[] = [];
    for (const p of people) {
      if (!p.varsitySport) continue;
      records.push({
        name: `${p.first} ${p.last}`,
        organization: `${p.varsitySport} (Varsity)`,
        sport: p.varsitySport,
        year: String(p.gradYear),
        major: rng.chance(0.7) ? p.major : undefined,
      });
    }
    sources.push({
      key: "athletics",
      sourceType: "ATHLETICS",
      name: "Varsity athletics rosters",
      description: "Official varsity team rosters.",
      urlPath: "/sports/rosters",
      parserType: "ATHLETICS_ROSTER",
      accessMethod: "PUBLIC_HTML",
      records: rng.shuffle(records),
    });
  }

  if (profile.hasNewsSource) {
    const records: DemoRecord[] = [];
    for (const p of people) {
      if (!p.experienceBlurb) continue;
      records.push({
        name: `${p.first} ${p.last}`,
        note: p.experienceBlurb,
        major: p.major,
        year: String(p.gradYear),
      });
    }
    sources.push({
      key: "student-spotlights",
      sourceType: "NEWS_OR_AWARDS",
      name: "Student spotlight features",
      description:
        "Published student profiles. The only demo source that can produce work-experience or job-search signals, because those must be explicitly stated rather than inferred.",
      urlPath: "/news/student-spotlights",
      parserType: "GENERIC_HTML",
      accessMethod: "PUBLIC_HTML",
      records: rng.shuffle(records),
    });
  }

  if (profile.hasDirectory) {
    const records: DemoRecord[] = [];
    for (const p of people) {
      if (!p.inDirectory) continue;
      records.push({
        name: `${p.first} ${p.middleInitial}. ${p.last}`,
        major: p.major,
        year: String(p.gradYear),
        email: `${p.first[0]!.toLowerCase()}${p.last.toLowerCase()}${p.id}@students.example.edu`,
      });
    }
    sources.push({
      key: "student-directory",
      sourceType: "STUDENT_DIRECTORY",
      name: "Public student directory",
      description:
        "Directory of enrolled students. Used only for enrichment, and only for candidates that pass the discovery threshold -- never crawled up front.",
      urlPath: "/directory/students",
      parserType: "JSON_ENDPOINT",
      accessMethod: "JSON_ENDPOINT",
      records: rng.shuffle(records),
    });
  }

  if (profile.hasFailingSource) {
    sources.push({
      key: "leadership-programs",
      sourceType: "STUDENT_LEADERSHIP",
      name: "Student leadership programme participants",
      description: "A page that discovery classified as a roster but that the extractor cannot parse.",
      urlPath: "/leadership/programs/participants",
      parserType: "HTML_TABLE",
      accessMethod: "PUBLIC_HTML",
      records: [],
      failure: {
        kind: "parse_error",
        message:
          "Expected a table of participants but the page contains only a programme description. The page structure appears to have changed since discovery.",
      },
    });
  }

  return sources;
}

const UNIVERSITY_SPECS: Array<{
  slug: string;
  name: string;
  shortName: string;
  domain: string;
  athleticName?: string;
  aliases: string[];
  city: string;
  state: string;
  seed: number;
  people: number;
  profile: UniversityProfile;
}> = [
  {
    slug: "example-state-university",
    name: "Example State University",
    shortName: "ESU",
    domain: "esu.example.edu",
    athleticName: "Example State Foxes",
    aliases: ["Example State", "ESU"],
    city: "Fairview",
    state: "IL",
    seed: 20260903,
    people: 500,
    // The full-coverage case: most categories publish something, intramurals
    // do not, and one source is broken.
    profile: {
      hasGreekLife: true,
      hasStudentOrgs: true,
      hasClubSports: true,
      hasIntramurals: true,
      hasAthletics: true,
      hasDirectory: true,
      hasNewsSource: true,
      hasFailingSource: true,
    },
  },
  {
    slug: "riverbend-college",
    name: "Riverbend College",
    shortName: "Riverbend",
    domain: "riverbend.example.edu",
    athleticName: "Riverbend Herons",
    aliases: ["Riverbend"],
    city: "Riverbend",
    state: "OH",
    seed: 761204,
    people: 140,
    // A university that publishes only organizations and athletics. No Greek
    // directory, no club sports, and -- critically -- no public directory, so
    // enrichment has nothing to match against and says so.
    profile: {
      hasGreekLife: false,
      hasStudentOrgs: true,
      hasClubSports: false,
      hasIntramurals: false,
      hasAthletics: true,
      hasDirectory: false,
      hasNewsSource: false,
      hasFailingSource: false,
    },
  },
  {
    slug: "northgate-institute-of-technology",
    name: "Northgate Institute of Technology",
    shortName: "Northgate Tech",
    domain: "northgate.example.edu",
    aliases: ["Northgate", "NIT"],
    city: "Northgate",
    state: "WA",
    seed: 33189,
    people: 180,
    // A third shape again: club sports and competitive organizations, a
    // directory, but no Greek life and no athletics department.
    profile: {
      hasGreekLife: false,
      hasStudentOrgs: true,
      hasClubSports: true,
      hasIntramurals: false,
      hasAthletics: false,
      hasDirectory: true,
      hasNewsSource: true,
      hasFailingSource: false,
    },
  },
];

/** Builds every demo university. Deterministic for a given code version. */
export function buildDemoUniversities(): DemoUniversityFixture[] {
  return UNIVERSITY_SPECS.map((spec) => {
    const rng = createRng(spec.seed);
    const people = buildPeople(rng, spec.people, spec.profile);
    const sources = buildSources(rng, people, spec.profile);

    return {
      slug: spec.slug,
      name: spec.name,
      shortName: spec.shortName,
      domain: spec.domain,
      athleticName: spec.athleticName,
      aliases: spec.aliases,
      city: spec.city,
      state: spec.state,
      peopleCount: people.length,
      sources,
    };
  });
}

/** Looks up a single demo university fixture by slug. */
export function demoUniversity(slug: string): DemoUniversityFixture | undefined {
  return buildDemoUniversities().find((u) => u.slug === slug);
}
