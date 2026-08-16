/** Strips `//` line comments and blank lines, and trims each line's
 * leading/trailing whitespace, to shrink generated output toward the PB's
 * 100,000-char limit. We own the generator's output format exactly — it
 * never emits a block comment or a string literal split across lines
 * (stringLiteral/interpolatedStringLiteral always escape embedded newlines
 * to `\n` text) — so this line-based pass is safe without a full C# parser.
 * Interior whitespace (token separation) is left untouched. */
export function minifySource(source: string): string {
  const out: string[] = []
  for (const rawLine of source.split('\n')) {
    const trimmed = stripLineComment(rawLine).trim()
    if (trimmed.length > 0) out.push(trimmed)
  }
  return out.join('\n')
}

/** Scans a single line for a `//` that starts a comment, ignoring any `//`
 * that appears inside a `"..."` string literal (interpolated or not — the
 * leading `$` doesn't change where the string's quotes are). */
function stripLineComment(line: string): string {
  let inString = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inString) {
      if (ch === '\\') {
        i++ // skip the escaped character (e.g. \" ) so it can't end the string early
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '/' && line[i + 1] === '/') return line.slice(0, i)
  }
  return line
}
