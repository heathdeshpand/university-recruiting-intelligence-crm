import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Test environment bootstrap.
 *
 * Next.js loads `.env` automatically; Vitest does not. Without this, any test
 * that imports a module which transitively reaches `src/lib/env.ts` fails to
 * load at all -- which reads as "no tests found" rather than as a missing
 * variable, and is thoroughly confusing.
 *
 * A developer's `.env` is used when present so tests see the real
 * configuration. Otherwise safe defaults are installed, so the suite runs on a
 * fresh checkout and in CI without setup.
 */

const ENV_PATH = resolve(__dirname, "..", ".env");

/** Minimal dotenv parser: `KEY=value`, optionally quoted, `#` comments. */
function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    const rest = line.slice(eq + 1).trim();

    let value: string;
    const quote = rest[0];

    if (quote === '"' || quote === "'") {
      // Quoted: take everything up to the matching close quote, and discard
      // whatever follows. `.env.example` documents options in a trailing
      // comment, and reading FOO=""  # "a" | "b" as one long quoted string
      // produces a value that fails validation in a baffling way.
      const close = rest.indexOf(quote, 1);
      value = close === -1 ? rest.slice(1) : rest.slice(1, close);
    } else {
      // Unquoted: a comment starts at the first ` #`.
      const comment = rest.indexOf(" #");
      value = (comment === -1 ? rest : rest.slice(0, comment)).trim();
    }

    values[key] = value;
  }

  return values;
}

if (existsSync(ENV_PATH)) {
  for (const [key, value] of Object.entries(parseEnvFile(readFileSync(ENV_PATH, "utf8")))) {
    // Never override something the runner set deliberately.
    process.env[key] ??= value;
  }
}

// Defaults, applied only where nothing is set. These make the unit suite
// runnable with no database present at all: nothing in it connects.
// NODE_ENV is typed read-only by the Next.js ambient types, so it is set
// through a widened view of process.env rather than directly.
const env = process.env as Record<string, string | undefined>;

env.NODE_ENV ??= "test";
env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/recruiting_crm_test?schema=public";
env.SESSION_SECRET ??= "test-only-session-secret-at-least-32-characters-long";
env.APP_URL ??= "http://localhost:3000";

// The test suite must never contact a real website, whatever a developer's
// own .env says.
env.ENABLE_LIVE_NETWORK = "false";
