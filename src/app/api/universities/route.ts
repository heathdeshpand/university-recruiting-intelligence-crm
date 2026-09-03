import type { NextRequest } from "next/server";
import { errorResponse, guardMutation, requireUser } from "@/lib/auth/guard";
import { parseBody, json } from "@/lib/api/respond";
import { createUniversitySchema } from "@/lib/api/validation";
import { createUniversity, listUniversities } from "@/lib/api/universities";

export async function GET() {
  try {
    await requireUser();
    return json({ universities: await listUniversities() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await guardMutation({ roles: ["ADMIN", "RECRUITER"] });
    const input = await parseBody(request, createUniversitySchema);
    const university = await createUniversity(input, user.id);
    return json({ university }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
