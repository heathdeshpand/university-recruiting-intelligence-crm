import { canonicalGivenName } from "@/lib/util/names";
import type { ResolvableRecord } from "@/lib/pipeline/resolve/types";

/**
 * Blocking.
 *
 * Comparing every record against every other record is quadratic and
 * unnecessary: almost every pair disagrees on the surname and could never
 * match. Blocking groups records that are *worth* comparing, so a university
 * with 100,000 records does tens of thousands of comparisons rather than five
 * billion.
 *
 * Records are placed in several blocks, because any single key would miss
 * real matches:
 *
 *   phonetic surname + first initial  catches Smith/Smyth and Mike/Michael
 *   exact canonical name key          catches records with no other overlap
 *   email                             catches anything, decisively
 *
 * A pair appearing in two blocks is compared once; the caller deduplicates.
 */

export interface Block {
  key: string;
  recordIds: string[];
}

/** Blocks larger than this are split further to keep comparisons bounded. */
const MAX_BLOCK_SIZE = 250;

function blockKeysFor(record: ResolvableRecord): string[] {
  const keys: string[] = [];

  const phonetic = record.lastNamePhonetic ?? "";
  const firstInitial = canonicalGivenName(record.firstName ?? "").slice(0, 1);

  if (phonetic) {
    keys.push(`p:${phonetic}:${firstInitial}`);
    // A second key without the first initial catches records where the given
    // name is missing entirely on one side.
    if (!firstInitial) keys.push(`p:${phonetic}:`);
  }

  if (record.nameKey) keys.push(`n:${record.nameKey}`);
  if (record.email) keys.push(`e:${record.email}`);

  return keys;
}

/**
 * Splits an oversized block using a secondary key.
 *
 * Very common surnames ("Smith" with a first initial of J) can still produce
 * a large group. Sub-blocking on graduation year keeps the work bounded; the
 * cost is missing a pair that disagrees on year, which the scoring model
 * would have penalised heavily anyway.
 */
function splitLargeBlock(records: ResolvableRecord[]): Block[] {
  const byYear = new Map<string, string[]>();
  for (const r of records) {
    const key = r.graduationYear ? String(r.graduationYear) : "unknown";
    const list = byYear.get(key);
    if (list) list.push(r.id);
    else byYear.set(key, [r.id]);
  }

  // Records with no year could match any year, so they join every sub-block.
  const unknown = byYear.get("unknown") ?? [];
  const blocks: Block[] = [];

  for (const [year, ids] of byYear) {
    if (year === "unknown") continue;
    blocks.push({ key: `split:${year}`, recordIds: [...ids, ...unknown] });
  }

  if (blocks.length === 0 && unknown.length > 0) {
    blocks.push({ key: "split:unknown", recordIds: unknown });
  }

  return blocks;
}

export interface BlockingResult {
  blocks: Block[];
  /** Pairs that will be compared, after deduplication. */
  pairCount: number;
  oversizedBlocks: number;
}

export function buildBlocks(records: ResolvableRecord[]): BlockingResult {
  const byId = new Map(records.map((r) => [r.id, r]));
  const grouped = new Map<string, string[]>();

  for (const record of records) {
    for (const key of blockKeysFor(record)) {
      const list = grouped.get(key);
      if (list) list.push(record.id);
      else grouped.set(key, [record.id]);
    }
  }

  const blocks: Block[] = [];
  let oversizedBlocks = 0;

  for (const [key, ids] of grouped) {
    if (ids.length < 2) continue;

    if (ids.length > MAX_BLOCK_SIZE) {
      oversizedBlocks += 1;
      const members = ids.map((id) => byId.get(id)!).filter(Boolean);
      for (const sub of splitLargeBlock(members)) {
        if (sub.recordIds.length >= 2) {
          blocks.push({ key: `${key}|${sub.key}`, recordIds: sub.recordIds });
        }
      }
      continue;
    }

    blocks.push({ key, recordIds: ids });
  }

  const seenPairs = new Set<string>();
  for (const block of blocks) {
    for (let i = 0; i < block.recordIds.length; i++) {
      for (let j = i + 1; j < block.recordIds.length; j++) {
        seenPairs.add(pairKey(block.recordIds[i]!, block.recordIds[j]!));
      }
    }
  }

  return { blocks, pairCount: seenPairs.size, oversizedBlocks };
}

/** Canonical, order-independent key for a pair of record ids. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Yields each unique pair implied by the blocks, exactly once. */
export function* iteratePairs(blocks: Block[]): Generator<[string, string]> {
  const seen = new Set<string>();
  for (const block of blocks) {
    for (let i = 0; i < block.recordIds.length; i++) {
      for (let j = i + 1; j < block.recordIds.length; j++) {
        const a = block.recordIds[i]!;
        const b = block.recordIds[j]!;
        const key = pairKey(a, b);
        if (seen.has(key)) continue;
        seen.add(key);
        yield a < b ? [a, b] : [b, a];
      }
    }
  }
}

export { MAX_BLOCK_SIZE };
