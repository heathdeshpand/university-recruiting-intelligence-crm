import type { ParserType } from "@prisma/client";
import type { DemoRecord, DemoSourceFixture } from "@/lib/demo/fixtures";

/**
 * Renders demo fixture records into the markup a real source of that shape
 * would return.
 *
 * This matters more than it looks. The alternative -- handing the pipeline a
 * clean array of objects -- would mean the demo never exercises the
 * extractors, and a broken table parser would still produce a perfect-looking
 * demo. By rendering an HTML table for a table source and an officer-card
 * directory for a directory source, the demo runs the same extraction code
 * that a real university's pages would.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body>
<nav><a href="/">Home</a> <a href="/about">About</a></nav>
<main>
<h1>${escapeHtml(title)}</h1>
${body}
</main>
<footer><p>This is synthetic demo content. No real people are represented.</p></footer>
</body>
</html>`;
}

/** Groups records by organization so directories render under headings. */
function groupByOrganization(records: DemoRecord[]): Map<string, DemoRecord[]> {
  const groups = new Map<string, DemoRecord[]>();
  for (const record of records) {
    const key = record.organization ?? "Members";
    const list = groups.get(key);
    if (list) list.push(record);
    else groups.set(key, [record]);
  }
  return groups;
}

function renderOrgDirectory(fixture: DemoSourceFixture): string {
  const groups = groupByOrganization(fixture.records);
  const sections: string[] = [];

  for (const [org, records] of groups) {
    const cards = records
      .map((r) => {
        const roleSuffix = r.role ? `, ${escapeHtml(r.role)}` : "";
        const details: string[] = [];
        if (r.major) details.push(escapeHtml(r.major));
        if (r.year) details.push(`Class of ${escapeHtml(r.year)}`);
        return `      <div class="member-card"><span class="member-name">${escapeHtml(r.name)}</span>${roleSuffix}${
          details.length > 0 ? ` <span class="member-detail">${details.join(" · ")}</span>` : ""
        }</div>`;
      })
      .join("\n");

    sections.push(`  <section>
    <h2>${escapeHtml(org)}</h2>
    <div class="member-list">
${cards}
    </div>
  </section>`);
  }

  return sections.join("\n");
}

function renderTable(fixture: DemoSourceFixture): string {
  const rows = fixture.records
    .map(
      (r) => `      <tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.organization ?? "")}</td>
        <td>${escapeHtml(r.role ?? "")}</td>
        <td>${escapeHtml(r.year ?? "")}</td>
      </tr>`,
    )
    .join("\n");

  return `  <table>
    <thead><tr><th>Name</th><th>Team</th><th>Position</th><th>Class Year</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>`;
}

function renderAthleticsRoster(fixture: DemoSourceFixture): string {
  const rows = fixture.records
    .map(
      (r, i) => `      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.role ?? "")}</td>
        <td>${escapeHtml(r.year ?? "")}</td>
        <td>${escapeHtml(r.sport ?? "")}</td>
        <td>${escapeHtml(r.major ?? "")}</td>
      </tr>`,
    )
    .join("\n");

  return `  <table class="roster">
    <thead><tr><th>No.</th><th>Name</th><th>Pos.</th><th>Cl.</th><th>Sport</th><th>Major</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>`;
}

function renderGenericList(fixture: DemoSourceFixture): string {
  const items = fixture.records
    .map((r) => {
      const parts = [
        r.note?.replace(/\.$/, ""),
        r.major,
        r.year ? `Class of ${r.year}` : undefined,
      ].filter(Boolean);
      return `    <li>${escapeHtml(r.name)}${parts.length > 0 ? ` — ${escapeHtml(parts.join(". "))}` : ""}</li>`;
    })
    .join("\n");

  return `  <ul class="spotlights">
${items}
  </ul>`;
}

function renderJson(fixture: DemoSourceFixture): string {
  return JSON.stringify(
    {
      meta: { count: fixture.records.length, synthetic: true },
      results: fixture.records.map((r) => ({
        fullName: r.name,
        major: r.major ?? null,
        classYear: r.year ?? null,
        email: r.email ?? null,
      })),
    },
    null,
    2,
  );
}

/** Content a source that discovery misclassified as a roster would return. */
function renderProseOnly(fixture: DemoSourceFixture): string {
  return `  <p>The ${escapeHtml(fixture.name)} programme supports students in developing
  leadership skills through workshops, mentoring and community projects.</p>
  <p>Applications open each autumn. Participants are selected by a review committee
  and take part in a year-long cohort experience.</p>
  <p>For more information, contact the Office of Student Leadership.</p>`;
}

export interface RenderedFixture {
  body: string;
  contentType: string;
}

export function renderFixture(fixture: DemoSourceFixture): RenderedFixture {
  // A source that discovery classified as a roster but that actually contains
  // only a programme description. Extraction finds nothing, and the pipeline
  // must report that clearly rather than crash or silently succeed.
  if (fixture.failure?.kind === "parse_error") {
    return {
      body: page(fixture.name, renderProseOnly(fixture)),
      contentType: "text/html",
    };
  }

  const parser: ParserType = fixture.parserType;

  switch (parser) {
    case "JSON_ENDPOINT":
      return { body: renderJson(fixture), contentType: "application/json" };
    case "ATHLETICS_ROSTER":
      return { body: page(fixture.name, renderAthleticsRoster(fixture)), contentType: "text/html" };
    case "HTML_TABLE":
      return { body: page(fixture.name, renderTable(fixture)), contentType: "text/html" };
    case "ORG_DIRECTORY":
      return { body: page(fixture.name, renderOrgDirectory(fixture)), contentType: "text/html" };
    case "GENERIC_HTML":
    default:
      return { body: page(fixture.name, renderGenericList(fixture)), contentType: "text/html" };
  }
}
