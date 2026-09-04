import { describe, it, expect } from "vitest";
import { __allowedOriginsForTests as allowedOrigins } from "@/lib/auth/guard";

/**
 * The CSRF origin check.
 *
 * The failure this guards against is subtle: comparing only against a
 * configured APP_URL rejects every request when the app is served from a
 * forwarded port, a tunnel or a proxy -- which looks like a broken login
 * rather than a misconfiguration.
 */

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("allowedOrigins", () => {
  it("always includes the configured application origin", () => {
    expect(allowedOrigins(headers({}))).toContain("http://localhost:3000");
  });

  it("accepts a forwarded host, which is how a Codespace serves the app", () => {
    const origins = allowedOrigins(
      headers({
        "x-forwarded-host": "shiny-space-machine-3000.app.github.dev",
        "x-forwarded-proto": "https",
      }),
    );
    expect(origins).toContain("https://shiny-space-machine-3000.app.github.dev");
    // The configured origin still works, so local development is unaffected.
    expect(origins).toContain("http://localhost:3000");
  });

  it("uses the first host when proxies have appended to the header", () => {
    const origins = allowedOrigins(
      headers({
        "x-forwarded-host": "app.example.com, internal.proxy",
        "x-forwarded-proto": "https, http",
      }),
    );
    expect(origins).toContain("https://app.example.com");
    expect(origins).not.toContain("https://internal.proxy");
  });

  it("falls back to the Host header when nothing is forwarded", () => {
    const origins = allowedOrigins(headers({ host: "localhost:3000" }));
    expect(origins).toContain("http://localhost:3000");
  });

  it("allows both schemes when the protocol is not stated", () => {
    // Without x-forwarded-proto there is no way to know, and refusing both
    // would break plain HTTP deployments.
    const origins = allowedOrigins(headers({ host: "app.example.com" }));
    expect(origins).toContain("https://app.example.com");
    expect(origins).toContain("http://app.example.com");
  });

  it("never accepts an unrelated origin", () => {
    const origins = allowedOrigins(
      headers({ "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https" }),
    );
    // The whole point: an attacker's page origin is not the host the forged
    // request was addressed to.
    expect(origins).not.toContain("https://evil.example.com");
    expect(origins).not.toContain("http://evil.example.com");
  });

  it("ignores an unparseable host rather than accepting everything", () => {
    const origins = allowedOrigins(headers({ "x-forwarded-host": "not a host::::" }));
    expect(origins).toEqual(["http://localhost:3000"]);
  });
});
