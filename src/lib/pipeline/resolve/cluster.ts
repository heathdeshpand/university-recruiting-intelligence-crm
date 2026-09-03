import { pairKey } from "@/lib/pipeline/resolve/blocking";

/**
 * Constrained clustering.
 *
 * Confident pairs are merged transitively -- if A matches B and B matches C,
 * all three are one person. But transitivity is dangerous next to a human
 * decision: if a reviewer has explicitly said "A and B are different people",
 * a chain through C must not quietly reunite them.
 *
 * So edges are applied strongest-first, and a merge is refused whenever it
 * would place a rejected pair in the same cluster. Refusals are returned
 * rather than hidden, so the UI can tell the reviewer that a chain was
 * blocked by their own earlier decision.
 */

export interface ClusterEdge {
  a: string;
  b: string;
  score: number;
}

export interface ClusterResult {
  /** Record id -> cluster id (the smallest record id in the cluster). */
  assignment: Map<string, string>;
  clusters: Map<string, string[]>;
  /** Edges refused because they would have violated a rejection. */
  blockedByRejection: ClusterEdge[];
}

class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    const p = this.parent.get(x);
    if (p === undefined) {
      this.parent.set(x, x);
      return x;
    }
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    // Keep the lexicographically smaller id as the root so cluster ids are
    // stable across runs.
    if (ra < rb) this.parent.set(rb, ra);
    else this.parent.set(ra, rb);
  }

  connected(a: string, b: string): boolean {
    return this.find(a) === this.find(b);
  }
}

export function clusterRecords(
  recordIds: string[],
  edges: ClusterEdge[],
  rejectedPairs: Set<string>,
  confirmedPairs: ClusterEdge[] = [],
): ClusterResult {
  const uf = new UnionFind();
  for (const id of recordIds) uf.find(id);

  // Members of each cluster, kept alongside the union-find so rejection
  // checks can be done before committing a merge.
  const members = new Map<string, Set<string>>();
  for (const id of recordIds) members.set(id, new Set([id]));

  const blockedByRejection: ClusterEdge[] = [];

  const wouldViolate = (a: string, b: string): boolean => {
    const ra = uf.find(a);
    const rb = uf.find(b);
    if (ra === rb) return false;
    const left = members.get(ra) ?? new Set([ra]);
    const right = members.get(rb) ?? new Set([rb]);

    // Check the smaller side against the larger to keep this cheap.
    const [small, large] = left.size <= right.size ? [left, right] : [right, left];
    for (const x of small) {
      for (const y of large) {
        if (rejectedPairs.has(pairKey(x, y))) return true;
      }
    }
    return false;
  };

  const commit = (a: string, b: string) => {
    const ra = uf.find(a);
    const rb = uf.find(b);
    if (ra === rb) return;
    const left = members.get(ra) ?? new Set([ra]);
    const right = members.get(rb) ?? new Set([rb]);
    uf.union(a, b);
    const newRoot = uf.find(a);
    const merged = new Set([...left, ...right]);
    members.set(newRoot, merged);
    if (newRoot !== ra) members.delete(ra);
    if (newRoot !== rb) members.delete(rb);
  };

  // Human confirmations are applied first and unconditionally: a reviewer who
  // said "these are the same person" outranks every automatic score.
  for (const edge of confirmedPairs) {
    commit(edge.a, edge.b);
  }

  for (const edge of [...edges].sort((x, y) => y.score - x.score)) {
    if (uf.connected(edge.a, edge.b)) continue;
    if (wouldViolate(edge.a, edge.b)) {
      blockedByRejection.push(edge);
      continue;
    }
    commit(edge.a, edge.b);
  }

  const assignment = new Map<string, string>();
  const clusters = new Map<string, string[]>();

  for (const id of recordIds) {
    const root = uf.find(id);
    assignment.set(id, root);
    const list = clusters.get(root);
    if (list) list.push(id);
    else clusters.set(root, [id]);
  }

  return { assignment, clusters, blockedByRejection };
}
