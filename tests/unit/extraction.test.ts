import { describe, it, expect } from "vitest";
import { extract, selectExtractor } from "@/lib/pipeline/extract/registry";
import { parseCsv } from "@/lib/pipeline/extract/extractors/csv";
import { classYearToGraduationYear, sportFromTitle } from "@/lib/pipeline/extract/extractors/athletics-roster";
import { parseDetailLine } from "@/lib/pipeline/extract/extractors/org-directory";
import { buildDemoUniversities } from "@/lib/demo/fixtures";
import { renderFixture } from "@/lib/demo/render";
import type { ExtractorInput } from "@/lib/pipeline/extract/types";

function html(body: string): ExtractorInput {
  return {
    url: "https://esu.example.edu/test",
    body: `<!doctype html><html><head><title>Test Page</title></head><body>${body}</body></html>`,
    contentType: "text/html",
    sourceType: "STUDENT_ORGANIZATION",
  };
}

describe("extractor selection", () => {
  it("prefers structured JSON over any HTML strategy", () => {
    const input: ExtractorInput = {
      url: "https://esu.example.edu/api/people",
      body: JSON.stringify({ results: [{ fullName: "Michael Johnson", classYear: "2027" }] }),
      contentType: "application/json",
      sourceType: "STUDENT_DIRECTORY",
    };
    expect(selectExtractor(input)?.extractor.type).toBe("JSON_ENDPOINT");
  });

  it("prefers the athletics extractor over a generic table on a roster page", () => {
    const input = html(`
      <table>
        <thead><tr><th>No.</th><th>Name</th><th>Pos.</th><th>Cl.</th><th>Hometown</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>Michael Johnson</td><td>MF</td><td>Jr.</td><td>Fairview</td></tr>
          <tr><td>2</td><td>Priyanka Rao</td><td>GK</td><td>Sr.</td><td>Northgate</td></tr>
          <tr><td>3</td><td>Diego Torres</td><td>DF</td><td>So.</td><td>Riverbend</td></tr>
        </tbody>
      </table>`);
    input.sourceType = "ATHLETICS";
    expect(selectExtractor(input)?.extractor.type).toBe("ATHLETICS_ROSTER");
  });

  it("never lets the generic fallback outrank a structured strategy", () => {
    const input = html(`
      <table>
        <thead><tr><th>Name</th><th>Organization</th></tr></thead>
        <tbody>
          <tr><td>Michael Johnson</td><td>Debate Union</td></tr>
          <tr><td>Priyanka Rao</td><td>Debate Union</td></tr>
          <tr><td>Diego Torres</td><td>Debate Union</td></tr>
        </tbody>
      </table>`);
    const selection = selectExtractor(input)!;
    expect(selection.extractor.type).not.toBe("GENERIC_HTML");
  });

  it("returns null when a page has no records at all", () => {
    expect(selectExtractor(html("<p>The club sports programme runs each autumn.</p>"))).toBeNull();
  });
});

describe("HTML table extraction", () => {
  it("maps headers onto candidate fields", () => {
    const result = extract(
      html(`
        <table>
          <thead><tr><th>Name</th><th>Team</th><th>Position</th><th>Class Year</th></tr></thead>
          <tbody>
            <tr><td>Michael Johnson</td><td>Club Soccer</td><td>Captain</td><td>2027</td></tr>
            <tr><td>Priyanka Rao</td><td>Club Soccer</td><td></td><td>2028</td></tr>
            <tr><td>Diego Torres</td><td>Club Soccer</td><td></td><td>2026</td></tr>
          </tbody>
        </table>`),
      "HTML_TABLE",
    );

    expect(result.records).toHaveLength(3);
    expect(result.records[0]).toMatchObject({
      name: "Michael Johnson",
      role: "Captain",
      year: "2027",
    });
  });

  it("finds the name column when the table has no usable headers", () => {
    const result = extract(
      html(`
        <table>
          <tbody>
            <tr><td>1</td><td>Michael Johnson</td><td>Active</td></tr>
            <tr><td>2</td><td>Priyanka Rao</td><td>Active</td></tr>
            <tr><td>3</td><td>Diego Torres</td><td>Active</td></tr>
          </tbody>
        </table>`),
      "HTML_TABLE",
    );

    expect(result.records.map((r) => r.name)).toEqual([
      "Michael Johnson",
      "Priyanka Rao",
      "Diego Torres",
    ]);
  });

  it("reports a table that contains no people rather than inventing records", () => {
    const result = extract(
      html(`
        <table>
          <thead><tr><th>Sport</th><th>Season</th></tr></thead>
          <tbody>
            <tr><td>Soccer</td><td>Autumn</td></tr>
            <tr><td>Rowing</td><td>Spring</td></tr>
          </tbody>
        </table>`),
      "HTML_TABLE",
    );

    expect(result.records).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("organization directory extraction", () => {
  it("reads the organization from the heading above each group", () => {
    const result = extract(
      html(`
        <section>
          <h2>Undergraduate Sales Club</h2>
          <div class="member-list">
            <div class="member-card"><span class="member-name">Michael Johnson</span>, President</div>
            <div class="member-card"><span class="member-name">Priyanka Rao</span>, Treasurer</div>
            <div class="member-card"><span class="member-name">Diego Torres</span></div>
          </div>
        </section>`),
      "ORG_DIRECTORY",
    );

    expect(result.records).toHaveLength(3);
    expect(result.records[0]!.organization).toBe("Undergraduate Sales Club");
    expect(result.records[0]!.role).toBe("President");
    expect(result.records[2]!.role).toBeUndefined();
  });

  it("keeps one person's two memberships as two records", () => {
    // Deduplicating on text alone would collapse these into one, silently
    // erasing a membership.
    const result = extract(
      html(`
        <section>
          <h2>Debate Union</h2>
          <div class="list">
            <div class="card"><span class="name">Michael Johnson</span></div>
            <div class="card"><span class="name">Priyanka Rao</span></div>
            <div class="card"><span class="name">Diego Torres</span></div>
          </div>
        </section>
        <section>
          <h2>Mock Trial Association</h2>
          <div class="list">
            <div class="card"><span class="name">Michael Johnson</span></div>
            <div class="card"><span class="name">Fatima Haddad</span></div>
            <div class="card"><span class="name">Omar Nasrallah</span></div>
          </div>
        </section>`),
      "ORG_DIRECTORY",
    );

    const michaels = result.records.filter((r) => r.name === "Michael Johnson");
    expect(michaels).toHaveLength(2);
    expect(michaels.map((m) => m.organization).sort()).toEqual([
      "Debate Union",
      "Mock Trial Association",
    ]);
  });
});

describe("parseDetailLine", () => {
  it("separates a major from a class year", () => {
    expect(parseDetailLine("Economics · Class of 2027")).toEqual({
      major: "Economics",
      year: "2027",
      note: undefined,
    });
  });

  it("handles a major on its own", () => {
    expect(parseDetailLine("Political Science").major).toBe("Political Science");
  });

  it("keeps sentence-like text as a published note rather than a major", () => {
    const parsed = parseDetailLine("Worked as a sales associate at a campus retailer.");
    expect(parsed.major).toBeUndefined();
    expect(parsed.note).toContain("sales associate");
  });

  it("returns nothing for an empty detail line", () => {
    expect(parseDetailLine("")).toEqual({ major: undefined, year: undefined, note: undefined });
  });
});

describe("athletics helpers", () => {
  it("converts a class standing into an expected graduation year", () => {
    const now = new Date("2026-09-03T00:00:00Z");
    expect(classYearToGraduationYear("Sr.", now)).toBe(2027);
    expect(classYearToGraduationYear("Fr.", now)).toBe(2030);
  });

  it("leaves an unrecognised class value alone", () => {
    expect(classYearToGraduationYear("2027")).toBeUndefined();
  });

  it("recovers a sport from a roster page title", () => {
    expect(sportFromTitle("Men's Soccer Roster")).toBe("Soccer");
    expect(sportFromTitle("2026-27 Women's Basketball Roster")).toBe("Basketball");
  });
});

describe("JSON endpoint extraction", () => {
  it("finds the record array inside an envelope", () => {
    const result = extract(
      {
        url: "https://esu.example.edu/api",
        body: JSON.stringify({
          meta: { count: 2 },
          data: { results: [{ first_name: "Michael", last_name: "Johnson", grad_year: 2027 }] },
        }),
        contentType: "application/json",
        sourceType: "STUDENT_DIRECTORY",
      },
      "JSON_ENDPOINT",
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ name: "Michael Johnson", year: "2027" });
  });

  it("returns nothing for JSON that holds no people", () => {
    const result = extract(
      {
        url: "https://esu.example.edu/api",
        body: JSON.stringify({ status: "ok", counts: [1, 2, 3] }),
        contentType: "application/json",
        sourceType: "STUDENT_DIRECTORY",
      },
      "JSON_ENDPOINT",
    );
    expect(result.records).toHaveLength(0);
  });
});

describe("CSV extraction", () => {
  it("parses quoted fields and embedded separators", () => {
    const rows = parseCsv('name,organization\n"Johnson, Michael","Debate Union"\n"Rao, Priyanka",Chess\n');
    expect(rows).toEqual([
      ["name", "organization"],
      ["Johnson, Michael", "Debate Union"],
      ["Rao, Priyanka", "Chess"],
    ]);
  });

  it("handles escaped quotes", () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([["a"], ['say "hi"']]);
  });
});

describe("unsupported formats are reported, not silently empty", () => {
  it("claims a PDF and explains why it cannot be read", () => {
    const result = extract({
      url: "https://esu.example.edu/roster.pdf",
      body: "%PDF-1.7",
      contentType: "application/pdf",
      sourceType: "CLUB_SPORT",
    });

    expect(result.parserUsed).toBe("PDF_UNSUPPORTED");
    expect(result.warnings.join(" ")).toContain("PDF");
  });

  it("recognises a page that renders itself in the browser", () => {
    const result = extract({
      url: "https://esu.example.edu/orgs",
      body: `<!doctype html><html><body><div id="root"></div><script>${"x".repeat(30000)}</script></body></html>`,
      contentType: "text/html",
      sourceType: "STUDENT_ORGANIZATION",
    });

    expect(result.parserUsed).toBe("RENDERED_UNSUPPORTED");
    expect(result.warnings.join(" ")).toContain("browser");
  });
});

describe("structural drift", () => {
  it("warns when the configured extractor no longer fits the page", () => {
    const result = extract(
      {
        url: "https://esu.example.edu/api",
        body: JSON.stringify({ results: [{ fullName: "Michael Johnson" }] }),
        contentType: "application/json",
        sourceType: "STUDENT_DIRECTORY",
      },
      "HTML_TABLE",
    );

    expect(result.usedConfiguredParser).toBe(false);
    expect(result.warnings.join(" ")).toContain("structure");
  });
});

describe("the demo fixtures extract losslessly", () => {
  it("recovers every record from every demo source", () => {
    // A regression here means the demo is quietly under-reporting, which would
    // make every downstream number in the walkthrough wrong.
    for (const university of buildDemoUniversities()) {
      for (const fixture of university.sources) {
        if (fixture.notFound || fixture.failure) continue;

        const rendered = renderFixture(fixture);
        const result = extract(
          {
            url: `https://${university.domain}${fixture.urlPath}`,
            body: rendered.body,
            contentType: rendered.contentType,
            sourceType: fixture.sourceType,
          },
          fixture.parserType,
        );

        expect(
          result.records.length,
          `${university.slug}/${fixture.key} extracted ${result.records.length} of ${fixture.records.length}`,
        ).toBe(fixture.records.length);
      }
    }
  });

  it("finds no records on the source that is meant to fail", () => {
    const esu = buildDemoUniversities().find((u) => u.slug === "example-state-university")!;
    const broken = esu.sources.find((s) => s.failure?.kind === "parse_error")!;
    const rendered = renderFixture(broken);

    const result = extract(
      {
        url: `https://${esu.domain}${broken.urlPath}`,
        body: rendered.body,
        contentType: rendered.contentType,
        sourceType: broken.sourceType,
      },
      broken.parserType,
    );

    expect(result.records).toHaveLength(0);
  });
});
