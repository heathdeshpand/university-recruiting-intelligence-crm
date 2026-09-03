import { NextResponse } from "next/server";
import { destroySession, getSessionUser } from "@/lib/auth/session";
import { clientIp, errorResponse } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/api/audit";

export async function POST() {
  try {
    const user = await getSessionUser();
    await destroySession();

    if (user) {
      await recordAudit({
        actorId: user.id,
        action: "auth.logout",
        entityType: "user",
        entityId: user.id,
        summary: `${user.name} signed out`,
        ip: await clientIp(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
