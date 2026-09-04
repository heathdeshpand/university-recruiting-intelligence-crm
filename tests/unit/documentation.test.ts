import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

/**
 * Documentation tests.
 *
 * Documentation rots silently: a renamed script or a deleted environment
 * variable leaves the README confidently wrong, and nobody notices until
 * someone follows it and it fails. These tests fail instead.
 */

const ROOT = resolve(__dirname, "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const DOC_FILES = [
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CHANGELOG.md",
  ...readdirSync(join(ROOT, "docs")).map((f) => `docs/${f}`),
];

describe("repository files", () => {
  it("has the files a professional repository is expected to have", () => {
    for (const file of [
      "README.md",
      "LICENSE",
      "CONTRIBUTING.md",
      "SECURITY.md",
      "CHANGELOG.md",
      ".env.example",
      ".gitignore",
      "prisma/schema.prisma",
    ]) {
      expect(existsSync(join(ROOT, file)), `${file} is missing`).toBe(true);
    }
  });

  it("ships a licence that names one", () => {
    const licence = read("LICENSE");
    expect(licence).toContain("MIT License");
    expect(licence.length).toBeGreaterThan(500);
  });
});

describe("documented commands exist", () => {
  const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;

  it("every `npm run <script>` mentioned in the docs is a real script", () => {
    const missing: string[] = [];

    for (const file of DOC_FILES) {
      const content = read(file);
      for (const match of content.matchAll(/npm run ([a-z][a-z0-9:_-]*)/g)) {
        const name = match[1]!;
        if (!(name in scripts)) missing.push(`${file}: npm run ${name}`);
      }
    }

    expect(missing, `documented scripts that do not exist:\n${missing.join("\n")}`).toEqual([]);
  });

  it("documents the commands the quick start depends on", () => {
    for (const name of ["dev", "build", "lint", "typecheck", "test", "db:migrate", "db:seed"]) {
      expect(scripts, `package.json is missing the "${name}" script`).toHaveProperty(name);
    }
  });

  it("the seed command referenced by the README actually seeds", () => {
    expect(scripts["db:seed"]).toContain("prisma/seed.ts");
  });
});

describe("environment variables are documented", () => {
  const example = read(".env.example");
  const envModule = read("src/lib/env.ts");

  /** Keys the schema in env.ts declares. */
  const declared = [...envModule.matchAll(/^\s{2}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]!);

  it("declares a non-trivial number of variables", () => {
    expect(declared.length).toBeGreaterThan(10);
  });

  it("documents every variable the application reads", () => {
    const undocumented = declared.filter((key) => !example.includes(key));
    expect(
      undocumented,
      `variables read by src/lib/env.ts but absent from .env.example:\n${undocumented.join("\n")}`,
    ).toEqual([]);
  });

  it("does not document variables the application never reads", () => {
    const documented = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!);
    const unused = documented.filter((key) => !declared.includes(key));
    expect(
      unused,
      `documented in .env.example but not read by src/lib/env.ts:\n${unused.join("\n")}`,
    ).toEqual([]);
  });

  it("ships no real secret in the example file", () => {
    // The example must never contain a usable session secret.
    const secretLine = example.split("\n").find((l) => l.startsWith("SESSION_SECRET="));
    expect(secretLine).toBeDefined();
    expect(secretLine!.toLowerCase()).toContain("replace-me");
  });

  it("defaults to not contacting real websites", () => {
    // A fresh checkout must be safe: live network access off, robots honoured.
    expect(example).toMatch(/^ENABLE_LIVE_NETWORK="false"$/m);
    expect(example).toMatch(/^RESPECT_ROBOTS_TXT="true"$/m);
  });
});

describe("internal documentation links resolve", () => {
  it("every relative markdown link points at a file that exists", () => {
    const broken: string[] = [];

    for (const file of DOC_FILES) {
      const content = read(file);
      const fileDir = dirname(join(ROOT, file));

      for (const match of content.matchAll(/\]\((?!https?:|#|mailto:)([^)]+)\)/g)) {
        const target = match[1]!.split("#")[0]!;
        if (!target) continue;
        // GitHub-relative links such as ../../security/advisories are not files.
        if (target.startsWith("../../")) continue;

        if (!existsSync(resolve(fileDir, target))) {
          broken.push(`${file} → ${target}`);
        }
      }
    }

    expect(broken, `broken links:\n${broken.join("\n")}`).toEqual([]);
  });
});

describe("the README stays honest", () => {
  const readme = read("README.md");

  it("states that outreach is not supported", () => {
    expect(readme).toMatch(/[Nn]o outreach|not supported, by design/);
  });

  it("carries a project status table distinguishing implemented from planned", () => {
    expect(readme).toContain("## Project status");
    expect(readme).toContain("Implemented");
    expect(readme).toMatch(/[Nn]ot implemented|[Nn]ot supported/);
  });

  it("carries a limitations section", () => {
    expect(readme).toContain("## Limitations");
  });

  it("links to the privacy and ethics documentation", () => {
    expect(readme).toContain("docs/privacy-and-ethics.md");
  });

  it("documents the demo walkthrough and how to reset it", () => {
    expect(readme).toContain("Demo walkthrough");
    expect(readme).toContain("npm run demo:reset");
  });
});

describe("the privacy documentation matches the code", () => {
  it("the signal taxonomy contains nothing describing a protected attribute", () => {
    const signals = read("src/lib/config/signals.ts");

    // A crude but useful guard: these words should never appear as part of a
    // signal key or label. If one does, the taxonomy has drifted from the
    // documented principles and needs a human to look at it.
    const FORBIDDEN = [
      "religio", "race", "ethnic", "political", "disabilit", "mental",
      "sexual", "orientation", "hardship", "poverty", "dropout", "drop_out",
      "failing", "probation", "immigration", "criminal",
    ];

    const keysAndLabels = [
      ...signals.matchAll(/key:\s*"([^"]+)"/g),
      ...signals.matchAll(/label:\s*"([^"]+)"/g),
    ].map((m) => m[1]!.toLowerCase());

    const offending = keysAndLabels.filter((v) => FORBIDDEN.some((f) => v.includes(f)));
    expect(offending, `signal names touching protected attributes:\n${offending.join("\n")}`).toEqual([]);
  });

  it("scoring rules never carry negative points", () => {
    const scoring = read("src/lib/config/scoring.ts");
    expect(scoring).not.toMatch(/points:\s*-\d/);
    expect(scoring).not.toMatch(/pointsPerExtraOccurrence:\s*-\d/);
  });
});
