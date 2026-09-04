#!/usr/bin/env node
/**
 * Dependency audit that fails on vulnerabilities but not on npm outages.
 *
 * `npm audit` exits non-zero both when it finds something and when it cannot
 * reach the registry. Treating those the same means a third-party outage turns
 * the build red, which trains people to ignore a red build -- far more
 * expensive than a missed audit run.
 *
 * This distinguishes the two: a reachable registry returns a JSON report, so
 * a parseable report means the result is real and is acted on. An unreachable
 * one is retried, then reported as a warning.
 *
 *   node scripts/audit.mjs [--level=moderate]
 */

import { spawnSync } from "node:child_process";

const LEVELS = ["info", "low", "moderate", "high", "critical"];

const levelArg = process.argv.find((a) => a.startsWith("--level="));
const minimum = levelArg ? levelArg.split("=")[1] : "moderate";

if (!LEVELS.includes(minimum)) {
  console.error(`Unknown level "${minimum}". Expected one of ${LEVELS.join(", ")}.`);
  process.exit(2);
}

const ATTEMPTS = 3;
const RETRY_DELAY_MS = 10_000;
// A degraded audit endpoint does not refuse the connection, it just never
// answers. Without a timeout the whole job hangs until the runner kills it,
// which is how this failed the first time.
const ATTEMPT_TIMEOUT_MS = 45_000;

function runAudit() {
  return spawnSync("npm", ["audit", "--json", `--audit-level=${minimum}`], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: ATTEMPT_TIMEOUT_MS,
  });
}

function sleep(ms) {
  // Synchronous so the script stays a simple top-to-bottom read.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  const result = runAudit();

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    report = null;
  }

  // A report with metadata means the registry answered, whatever the exit code.
  if (report?.metadata?.vulnerabilities) {
    const counts = report.metadata.vulnerabilities;
    const relevant = LEVELS.slice(LEVELS.indexOf(minimum));
    const total = relevant.reduce((sum, level) => sum + (counts[level] ?? 0), 0);

    if (total === 0) {
      console.log(`No vulnerabilities at ${minimum} severity or above.`);
      process.exit(0);
    }

    console.log(
      `::error::npm audit found ${total} vulnerabilit${total === 1 ? "y" : "ies"} at ${minimum} severity or above.`,
    );
    for (const [name, entry] of Object.entries(report.vulnerabilities ?? {})) {
      if (!relevant.includes(entry.severity)) continue;
      const via = (entry.via ?? [])
        .map((v) => (typeof v === "string" ? v : v.title))
        .filter(Boolean)
        .join("; ");
      console.log(`  ${entry.severity.padEnd(9)} ${name}${via ? `  — ${via}` : ""}`);
    }
    process.exit(1);
  }

  const reason = result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM"
    ? `no response within ${ATTEMPT_TIMEOUT_MS / 1000}s`
    : "the endpoint returned an error";
  console.log(`Attempt ${attempt} of ${ATTEMPTS}: ${reason}.`);
  if (result.stderr) console.log(result.stderr.trim().split("\n").slice(0, 5).join("\n"));

  if (attempt < ATTEMPTS) sleep(RETRY_DELAY_MS);
}

console.log(
  "::warning::Skipped the dependency audit: npm's audit endpoint was unreachable after " +
    `${ATTEMPTS} attempts. This is an npm outage, not a finding.`,
);
process.exit(0);
