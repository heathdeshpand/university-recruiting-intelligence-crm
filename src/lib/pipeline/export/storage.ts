import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";

/**
 * Where generated workbooks live.
 *
 * Exports contain personal data, so the directory is gitignored and every
 * read is path-checked: a filename is only ever resolved inside the export
 * root, so a crafted export id cannot be used to read an arbitrary file off
 * the server.
 */

export const EXPORT_ROOT = resolve(process.cwd(), "storage", "exports");

export async function ensureExportDir(): Promise<void> {
  await mkdir(EXPORT_ROOT, { recursive: true });
}

export function exportPath(filename: string): string {
  const safe = normalize(filename).replace(/^(\.\.(\/|\\|$))+/, "").replace(/[/\\]/g, "_");
  const full = join(EXPORT_ROOT, safe);
  if (!full.startsWith(EXPORT_ROOT)) {
    throw new Error("Refusing to resolve an export path outside the export directory.");
  }
  return full;
}

export async function writeExport(filename: string, buffer: Buffer): Promise<string> {
  await ensureExportDir();
  const path = exportPath(filename);
  await writeFile(path, buffer);
  return path;
}

export async function readExport(filename: string): Promise<Buffer> {
  return readFile(exportPath(filename));
}
