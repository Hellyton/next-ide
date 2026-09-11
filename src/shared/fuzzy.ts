const WORD_START = new Set(['/', '.', '-', '_', ' '])

/** Subsequence match; higher is better. Bonuses: consecutive chars, file-name chars, word starts. */
export function fuzzyScore(query: string, candidate: string): number | null {
  const q = query.toLowerCase()
  if (!q) return 0
  const c = candidate.toLowerCase()
  const nameStart = c.lastIndexOf('/') + 1
  let score = 0
  let from = 0
  let prev = -2
  for (const ch of q) {
    const found = c.indexOf(ch, from)
    if (found < 0) return null
    score += found === prev + 1 ? 5 : 1
    if (found >= nameStart) score += 2
    if (found === 0 || WORD_START.has(c[found - 1]!)) score += 3
    prev = found
    from = found + 1
  }
  return score - (c.length - q.length) * 0.01
}

export function fuzzyFilter<T>(query: string, items: T[], key: (item: T) => string, limit = 50): T[] {
  if (!query) return items.slice(0, limit)
  return items
    .map((item) => ({ item, score: fuzzyScore(query, key(item)) }))
    .filter((x): x is { item: T; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item)
}
