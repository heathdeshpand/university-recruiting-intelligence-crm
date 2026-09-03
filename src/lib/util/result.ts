/**
 * A small Result type.
 *
 * Source collection is expected to fail often -- pages disappear, structures
 * change, hosts time out. Modelling failure as a value rather than a thrown
 * exception makes it natural for the pipeline to record a per-source error
 * and keep processing the remaining sources, which is a hard requirement
 * (one bad source must never take down a university's run).
 */

export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok;
}

/** Turns an unknown thrown value into a readable message. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Runs `fn`, converting a throw into an `err` result. */
export async function attempt<T>(fn: () => Promise<T>): Promise<Result<T, string>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(errorMessage(e));
  }
}
