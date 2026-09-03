import { demoUniversity } from "../src/lib/demo/fixtures";
import { renderFixture } from "../src/lib/demo/render";
import { EXTRACTORS, selectExtractor } from "../src/lib/pipeline/extract/registry";

const university = demoUniversity("example-state-university")!;

for (const key of ["student-organizations", "athletics", "student-spotlights", "greek-life"]) {
  const fixture = university.sources.find((s) => s.key === key)!;
  const rendered = renderFixture(fixture);
  const input = {
    url: `https://esu.example.edu${fixture.urlPath}`,
    body: rendered.body,
    contentType: rendered.contentType,
    sourceType: fixture.sourceType,
  };

  const scores = EXTRACTORS.map((e) => ({ type: e.type, score: Number(e.detect(input).toFixed(2)) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const selection = selectExtractor(input);
  const outcome = selection!.extractor.extract(input);

  console.log(`\n=== ${key} ===`);
  console.log(`fixture records: ${fixture.records.length}`);
  console.log(`extractor scores: ${scores.map((s) => `${s.type}=${s.score}`).join(" ")}`);
  console.log(`selected: ${selection!.extractor.type} -> ${outcome.records.length} records`);
  console.log(`sample:`, JSON.stringify(outcome.records.slice(0, 2), null, 1).slice(0, 600));
}
