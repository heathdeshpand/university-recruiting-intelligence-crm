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
 * CSRF defence for state-changing requests.
 *
 * Session cookies are SameSite=Lax, which already blocks cross-site POSTs from
 * a form or fetch. This adds a second, explicit check that the Origin (or
 * Referer) header matches the configured application origin, so the app does
 * not depend on browser SameSite behaviour alone.
 */
export async function requireSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get("origin");
  const referer = h.get("referer");

  const allowed = new URL(env.APP_URL).origin;

  if (origin) {
    if (origin !== allowed) {
      throw new HttpError(403, "Cross-origin request rejected.", "csrf");
    }
    return;
  }

  if (referer) {
    try {
      if (new URL(referer).origin !== allowed) {
        throw new HttpError(403, "Cross-origin request rejected.", "csrf");
      }
      return;
    } catch {
      throw new HttpError(403, "Cross-origin request rejected.", "csrf");
    }
  }

  // Neither header present. Browsers always send Origin on cross-origin
  // state-changing fetches, so this is a non-browser client; require it.
  throw new HttpError(403, "Missing Origin header on a state-changing request.", "csrf");
}

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
