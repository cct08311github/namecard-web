/**
 * Shared internal utilities for Firestore batch operations.
 *
 * Extracted from tags.ts so multiple repository modules can share them
 * without duplicating implementations.
 */

/**
 * Split an array into chunks of at most `size` elements.
 */
export function chunkArray<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * Run `fn` over `items` with at most `concurrency` promises in-flight at once.
 */
export async function runParallelLimited<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (next !== undefined) await fn(next);
    }
  });
  await Promise.all(workers);
}
