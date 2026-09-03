import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { clientIp, enforceRateLimit, errorResponse } from "@/lib/auth/guard";
import { LIMITS } from "@/lib/auth/rate-limit";
import { recordAudit } from "@/lib/api/audit";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export async function POST(request: NextRequest) {
  try {
    const ip = await clientIp();
    // Rate limit before touching the database, so a flood of bad logins is
    // cheap to reject.
    enforceRateLimit(`login:${ip}`, LIMITS.LOGIN);

    const parsed = loginSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Same response and roughly the same work whether or not the account
    // exists, so the endpoint does not confirm which emails are registered.
    const valid = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !valid || !user.active) {
      await recordAudit({
        action: "auth.login_failed",
        entityType: "user",
        entityId: user?.id ?? null,
        summary: `Failed sign-in attempt for ${email}`,
        ip,
      });
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    }

    const { token, expiresAt } = await createSession(user.id, {
      userAgent: request.headers.get("user-agent") ?? undefined,
      ip,
    });
    await setSessionCookie(token, expiresAt);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await recordAudit({
      actorId: user.id,
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
      summary: `${user.name} signed in`,
      ip,
    });

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
