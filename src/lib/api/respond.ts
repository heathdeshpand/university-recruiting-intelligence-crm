import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest } from "@/lib/auth/guard";
import { formatZodError } from "@/lib/api/validation";

/** Parses and validates a JSON request body, throwing a 400 on failure. */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  const raw = await request.json().catch(() => {
    throw badRequest("Request body must be valid JSON.");
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw badRequest(formatZodError(parsed.error), parsed.error.issues);
  }
  return parsed.data;
}

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}
