/**
 * Pure function that walks a JSON value and returns the set of
 * dot-separated key paths whose key or value matches `query`.
 *
 * Ancestor paths are included so that a tree viewer knows which
 * nodes to expand in order to reveal the match.
 *
 * Example:
 *   given  { a: { b: "hello" } }  and query "hello"
 *   returns Set { "a", "a.b" }
 */
export function findMatchingPaths(
  obj: unknown,
  query: string,
  path: string[] = [],
): Set<string> {
  const matches = new Set<string>()
  const lowerQuery = query.toLowerCase()

  if (obj === null || obj === undefined) return matches

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const child = findMatchingPaths(obj[i], query, [...path, String(i)])
      for (const p of child) matches.add(p)
    }
    return matches
  }

  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const currentPath = [...path, key]

      if (key.toLowerCase().includes(lowerQuery)) {
        addAncestorPaths(matches, currentPath)
      }

      const child = findMatchingPaths(value, query, currentPath)
      for (const p of child) matches.add(p)
    }
    return matches
  }

  // Primitive value
  if (String(obj).toLowerCase().includes(lowerQuery)) {
    addAncestorPaths(matches, path)
  }

  return matches
}

/** Add every prefix of `path` into `set` so ancestor nodes expand. */
function addAncestorPaths(set: Set<string>, path: string[]): void {
  for (let i = 1; i <= path.length; i++) {
    set.add(path.slice(0, i).join('.'))
  }
}
