import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { LIMITS, rateLimit } from "@/lib/auth/rate-limit";

/**
 * Route-handler guards: authentication, role checks, CSRF, rate limiting.
 *
 * These run on every mutating API route. Read routes still require a session
 * but skip the CSRF check, which only applies to state-changing methods.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = "error",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const unauthorized = (m = "You must sign in to do that.") => new HttpError(401, m, "unauthorized");
export const forbidden = (m = "You do not have permission to do that.") => new HttpError(403, m, "forbidden");
export const notFound = (m = "Not found.") => new HttpError(404, m, "not_found");
export const badRequest = (m: string, details?: unknown) => new HttpError(400, m, "bad_request", details);

export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

/** Requires a signed-in user, or throws. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  return user;
}

/** Requires a signed-in user with one of the given roles. */
export async function requireRole(...roles: SessionUser["role"][]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw forbidden();
  return user;
}

/**
/**
 * The origins a state-changing request may legitimately come from.
 *
 * Two are accepted, and both are the application's own:
 *
 *   APP_URL          what the deployment is configured to be.
 *   The request host what the browser actually asked for, reconstructed from
 *                    the forwarded host and protocol.
 *
 * Including the request's own host is what makes this work behind a proxy, a
 * tunnel, or a forwarded port without configuration -- a Codespace serves the
 * app from https://<name>-3000.app.github.dev while APP_URL still says
 * localhost, and comparing against APP_URL alone would reject every login.
 *
 * It remains a sound CSRF defence. Comparing Origin against the host the
 * request was sent to is the standard check: an attacker's page has its own
 * origin, which will never equal the host of the request it forged.
 */
function allowedOrigins(h: Headers): string[] {
  const origins = new Set<string>();

  try {
    origins.add(new URL(env.APP_URL).origin);
  } catch {
    // A malformed APP_URL should not disable the check entirely; the host
    // below still applies.
  }

  const forwardedHost = h.get("x-forwarded-host") ?? h.get("host");
  if (forwardedHost) {
    // A comma-separated list means several proxies appended to it; the first
    // is the one the client actually addressed.
    const host = forwardedHost.split(",")[0]!.trim();
    const proto = (h.get("x-forwarded-proto") ?? "").split(",")[0]!.trim();
    for (const scheme of proto ? [proto] : ["https", "http"]) {
      try {
        origins.add(new URL(`${scheme}://${host}`).origin);
      } catch {
        // Ignore an unparseable host header.
      }
    }
  }

  return [...origins];
}

/**
 * CSRF defence for state-changing requests.
 *
 * Session cookies are SameSite=Lax, which already blocks cross-site POSTs from
 * a form or fetch. This adds a second, explicit check that the Origin (or
 * Referer) matches an origin the application is actually served from, so the
 * app does not depend on browser SameSite behaviour alone.
 */
export async function requireSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get("origin");
  const referer = h.get("referer");
  const allowed = allowedOrigins(h);

  const reject = () => {
    throw new HttpError(
      403,
      "Cross-origin request rejected. If this application is served from a URL other than APP_URL, set APP_URL to that origin.",
      "csrf",
    );
  };

  if (origin) {
    if (!allowed.includes(origin)) reject();
    return;
  }

  if (referer) {
    try {
      if (!allowed.includes(new URL(referer).origin)) reject();
      return;
    } catch {
      reject();
    }
    return;
  }

  // Neither header present. Browsers always send Origin on cross-origin
  // state-changing fetches, so this is a non-browser client; require it.
  throw new HttpError(403, "Missing Origin header on a state-changing request.", "csrf");
}

export { allowedOrigins as __allowedOriginsForTests };

/** Applies a rate limit keyed by an identifier, or throws 429. */
export function enforceRateLimit(
  key: string,
  config: { limit: number; windowMs: number },
): void {
  const result = rateLimit(key, config.limit, config.windowMs);
  if (!result.allowed) {
    throw new HttpError(
      429,
      `Too many requests. Try again in ${result.retryAfterSeconds} seconds.`,
      "rate_limited",
      { retryAfterSeconds: result.retryAfterSeconds },
    );
  }
}

/** Standard guard for an authenticated mutating endpoint. */
export async function guardMutation(
  options: { roles?: SessionUser["role"][]; rateLimitKey?: string } = {},
): Promise<SessionUser> {
  await requireSameOrigin();
  const user = options.roles ? await requireRole(...options.roles) : await requireUser();
  enforceRateLimit(`api:${user.id}`, LIMITS.API);
  if (options.rateLimitKey) {
    enforceRateLimit(`${options.rateLimitKey}:${user.id}`, LIMITS.JOB_START);
  }
  return user;
}

/** Converts a thrown error into a JSON response with a useful message. */
export function errorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) {
    return NextResponse.json(
      { error: e.message, code: e.code, ...(e.details ? { details: e.details } : {}) },
      { status: e.status },
    );
  }
  const message = e instanceof Error ? e.message : "Unexpected server error.";
  // Never leak internals to the client, but do log them.
  console.error(JSON.stringify({ level: "error", scope: "api", message, stack: e instanceof Error ? e.stack : undefined }));
  return NextResponse.json(
    { error: "Something went wrong handling that request.", code: "internal" },
    { status: 500 },
  );
}
