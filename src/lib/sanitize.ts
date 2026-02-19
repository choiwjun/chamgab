/**
 * PostgREST filter input sanitizer
 *
 * PostgREST uses commas, parentheses, and dots as structural delimiters
 * in filter strings. Unsanitized user input interpolated into .or() calls
 * can inject additional filter clauses or break query parsing.
 *
 * This function strips those characters to prevent filter injection.
 *
 * @TASK SECURITY - PostgREST filter injection prevention
 */

/** Sanitize user input for safe use in PostgREST filter strings (.or(), .filter(), etc.) */
export function sanitizeFilterInput(input: string): string {
  return input.replace(/[,().]/g, '').trim()
}

/** Normalize user search query for consistent filtering. */
export function normalizeSearchQuery(input: string): string {
  return sanitizeFilterInput(input).replace(/\s+/g, ' ').trim()
}

/**
 * Build search terms for multi-word query support.
 * Example: "서울 강남 래미안" -> ["서울 강남 래미안", "서울", "강남", "래미안", "서울강남래미안"]
 */
export function buildSearchTerms(
  input: string,
  maxTerms: number = 5
): string[] {
  const normalized = normalizeSearchQuery(input)
  if (!normalized) return []

  const terms: string[] = [normalized]
  const tokens = normalized
    .split(' ')
    .map((v) => v.trim())
    .filter((v) => v.length >= 2)

  for (const token of tokens) {
    if (!terms.includes(token)) terms.push(token)
  }

  const compact = normalized.replace(/\s+/g, '')
  if (compact.length >= 2 && !terms.includes(compact)) {
    terms.push(compact)
  }

  return terms.slice(0, Math.max(1, maxTerms))
}
