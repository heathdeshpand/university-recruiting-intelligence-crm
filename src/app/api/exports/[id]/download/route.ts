import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, errorResponse, notFound, requireUser } from "@/lib/auth/guard";
import { readExport } from "@/lib/pipeline/export/storage";
import { recordAudit } from "@/lib/api/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * Streams a generated workbook.
 *
 * Requires a session: exports contain personal data and must never be
 * reachable by anyone holding only the URL. The download is audited, because
 * "who took a copy of this data out of the system" is exactly the question an
 * audit log exists to answer.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const record = await prisma.export.findUnique({ where: { id } });
    if (!record) throw notFound("That export does not exist.");
    if (record.status !== "COMPLETED" || !record.filename) {
      throw badRequest(
        record.status === "FAILED"
          ? `That export failed: ${record.error ?? "no details were recorded."}`
          : "That export is still being built. Try again in a moment.",
      );
    }

    let buffer: Buffer;
    try {
      buffer = await readExport(record.filename);
    } catch {
      throw notFound(
        "The workbook file is no longer on disk. Generate a new export to download it again.",
      );
    }

    await recordAudit({
      actorId: user.id,
      action: "export.downloaded",
      entityType: "export",
      entityId: id,
      universityId: record.universityId,
      summary: `${user.name} downloaded ${record.filename}`,
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${record.filename}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
