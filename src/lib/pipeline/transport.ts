import type { UniversitySource } from "@prisma/client";
import { politeFetch, type FetchFailure, type FetchResult } from "@/lib/pipeline/http";
import { demoUniversity } from "@/lib/demo/fixtures";
import { renderFixture } from "@/lib/demo/render";
import { err, ok, type Result } from "@/lib/util/result";

/**
 * Decides how a source's bytes are obtained.
 *
 * There are exactly two transports, and which one is used is never ambiguous:
 *
 *   DEMO     -- the source belongs to a demo university. Its bytes are
 *               rendered from the synthetic fixture set. No network call is
 *               made, ever, for any reason.
 *   LIVE     -- a real source, fetched through the polite HTTP client, which
 *               enforces robots.txt, per-host delays and the live-network
 *               switch.
 *
 * Keeping this decision in one function is what makes the guarantee on the
 * demo banner true: demo data cannot accidentally trigger a real request, and
 * a real source cannot accidentally be served synthetic data.
 */

export type TransportKind = "demo" | "live";

export interface TransportResponse extends FetchResult {
  transport: TransportKind;
}

export interface DemoFailure {
  kind: "demo_failure";
  message: string;
}

export type TransportFailure = FetchFailure | DemoFailure;

export function transportFor(universitySlug: string, isDemo: boolean): TransportKind {
  return isDemo && demoUniversity(universitySlug) ? "demo" : "live";
}

/**
 * Fetches a source's content.
 *
 * `source` carries the URL and the university it belongs to; `universitySlug`
 * and `isDemo` come from the university row so the caller cannot forget to
 * pass them.
 */
export async function fetchSourceContent(
  source: Pick<UniversitySource, "url" | "accessMethod">,
  universitySlug: string,
  isDemo: boolean,
): Promise<Result<TransportResponse, TransportFailure>> {
  if (transportFor(universitySlug, isDemo) === "demo") {
    return fetchDemoContent(source.url, universitySlug);
  }

  const result = await politeFetch(source.url, {
    accept:
      source.accessMethod === "JSON_ENDPOINT"
        ? "application/json,text/plain;q=0.9,*/*;q=0.5"
        : undefined,
  });

  if (!result.ok) return err(result.error);
  return ok({ ...result.value, transport: "live" as const });
}

/** Serves a demo source's synthetic content, including simulated failures. */
export function fetchDemoContent(
  url: string,
  universitySlug: string,
): Result<TransportResponse, TransportFailure> {
  const university = demoUniversity(universitySlug);
  if (!university) {
    return err({
      kind: "demo_failure",
      message: `No demo fixture exists for ${universitySlug}.`,
    });
  }

  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return err({ kind: "demo_failure", message: `${url} is not a valid URL.` });
  }

  const fixture = university.sources.find((s) => s.urlPath === path);
  if (!fixture) {
    return err({
      kind: "http_error",
      status: 404,
      message: `The demo fixture set has no page at ${path}.`,
    });
  }

  // Simulated HTTP failure, so the demo can show a genuinely failing source.
  if (fixture.failure?.kind === "http_error") {
    return err({ kind: "http_error", status: 503, message: fixture.failure.message });
  }

  if (fixture.notFound) {
    return err({
      kind: "http_error",
      status: 404,
      message: `${university.name} does not publish a page for this category.`,
    });
  }

  const rendered = renderFixture(fixture);

  return ok({
    url,
    finalUrl: url,
    status: 200,
    contentType: rendered.contentType,
    body: rendered.body,
    bytes: Buffer.byteLength(rendered.body, "utf8"),
    fetchedAt: new Date(),
    transport: "demo",
  });
}
