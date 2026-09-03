/**
 * Deterministic pseudo-random number generator (mulberry32).
 *
 * The demo dataset must be identical on every machine and every reseed, so
 * that documentation, screenshots and tests can all refer to the same
 * candidates. Math.random would make the demo unreproducible.
 */
export function createRng(seed: number) {
  let a = seed >>> 0;

  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    /** Integer in [min, max]. */
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    /** True with probability p. */
    chance: (p: number) => next() < p,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    /** `count` distinct items, or all of them if count exceeds the pool. */
    sample: <T>(items: readonly T[], count: number): T[] => {
      const pool = [...items];
      const out: T[] = [];
      const n = Math.min(count, pool.length);
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(next() * pool.length);
        out.push(pool.splice(idx, 1)[0]!);
      }
      return out;
    },
    shuffle: <T>(items: readonly T[]): T[] => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}

export type Rng = ReturnType<typeof createRng>;
