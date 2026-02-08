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
