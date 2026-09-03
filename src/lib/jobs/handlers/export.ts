import { statSync } from "node:fs";
import { buildUniversityWorkbook } from "@/lib/pipeline/export/workbook";
import { writeExport } from "@/lib/pipeline/export/storage";
import { recordAudit } from "@/lib/api/audit";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * Builds a university's Excel workbook and records it for download.
 */
export const exportHandler: JobHandler = async (ctx) => {
  const university = await ctx.prisma.university.findUnique({
    where: { id: ctx.universityId },
    select: { id: true, name: true, slug: true },
  });
  if (!university) throw new Error("The university no longer exists.");

  const exportId = typeof ctx.metadata.exportId === "string" ? ctx.metadata.exportId : null;

  await ctx.setTotal(1);
  await ctx.setProgress(0, "Building workbook");

  if (exportId) {
    await ctx.prisma.export.update({ where: { id: exportId }, data: { status: "RUNNING" } });
  }

  try {
    const { buffer, sheetCounts } = await buildUniversityWorkbook(ctx.prisma, university.id);

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const filename = `${university.slug}-${stamp}.xlsx`;
    const path = await writeExport(filename, buffer);
    const sizeBytes = statSync(path).size;

    if (exportId) {
      await ctx.prisma.export.update({
        where: { id: exportId },
        data: {
          status: "COMPLETED",
          filename,
          filePath: path,
          sizeBytes,
          sheetCounts: sheetCounts as never,
          completedAt: new Date(),
        },
      });
    }

    await recordAudit({
      action: "export.created",
      entityType: "export",
      entityId: exportId,
      universityId: university.id,
      summary: `Exported ${university.name} workbook (${Object.values(sheetCounts).reduce((a, b) => a + b, 0)} rows)`,
      metadata: sheetCounts,
    });

    await ctx.setProgress(1, "Workbook ready");

    const sheets = Object.entries(sheetCounts)
      .map(([name, count]) => `${name}: ${count}`)
      .join(", ");

    return {
      summary: `Workbook built with ${Object.keys(sheetCounts).length} sheets (${sheets}).`,
      stats: { filename, sizeBytes, ...sheetCounts },
    };
  } catch (e) {
    if (exportId) {
      await ctx.prisma.export
        .update({
          where: { id: exportId },
          data: { status: "FAILED", error: e instanceof Error ? e.message : String(e) },
        })
        .catch(() => undefined);
    }
    throw e;
  }
};
