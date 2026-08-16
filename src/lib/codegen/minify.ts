/** Strips `//` line comments and blank lines, trims each line's
 * leading/trailing whitespace, joins everything back together with no
 * newlines (C# doesn't need them once comments are gone — every generated
 * line already ends in a token delimiter like `;`/`{`/`}`), and finally
 * shortens our own generated identifiers (method/field names) to a couple
 * of characters each. All of this only matters for the char count against
 * the PB's 100,000-char limit — the unminified "Full" output stays
 * unchanged. We own the generator's output format exactly — it never
 * emits a block comment or a string literal split across lines
 * (stringLiteral/interpolatedStringLiteral always escape embedded newlines
 * to `\n` text) — so this line-based pass is safe without a full C# parser. */
export function minifySource(source: string): string {
  const joined = stripCommentsAndJoin(source)
  return compressIdentifiers(joined)
}

const TOKEN_BOUNDARY = /[;{}:,()[\]<>=+\-*/%!&|^~?"' ]/

function stripCommentsAndJoin(source: string): string {
  let out = ''
  for (const rawLine of source.split('\n')) {
    const line = stripLineComment(rawLine).trim()
    if (line.length === 0) continue
    if (out.length > 0) {
      const prevChar = out[out.length - 1]
      const nextChar = line[0]
      // Only two "word" characters butting up against each other (e.g. a
      // statement ending in an identifier followed by one starting with a
      // keyword) would silently merge into one token — everything else
      // (;, {, }, whitespace, punctuation...) already separates them.
      if (!TOKEN_BOUNDARY.test(prevChar) && !TOKEN_BOUNDARY.test(nextChar)) out += ' '
    }
    out += line
  }
  return out
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

// Every readable identifier we generate (see generate.ts's methodName,
// logicEmitters.ts's sectionMethodName, and generate.ts's
// promoteVariableStorage) uses one of these prefixes and nothing else in
// the codebase does, so a global rename by prefix can't collide with an SE
// API member or a fixed helper name (GetBlock, _argument, _rng, ...). The
// \b before each prefix matters: it's what stops "Num_x" inside a longer
// identifier like "Something_Num_x" from being mistaken for a real field
// (underscore is a word character, so \b never falls between two
// underscore-joined pieces of the same identifier).
const RENAME_RULES: { pattern: RegExp; prefix: string }[] = [
  { pattern: /\bStep_\d+(?:_\w+)?\b/g, prefix: 'M' },
  { pattern: /\bSection_\w+\b/g, prefix: 'S' },
  { pattern: /\bNum_\w+\b/g, prefix: 'n' },
  { pattern: /\bText_\w+\b/g, prefix: 't' },
  { pattern: /\bBool_\w+\b/g, prefix: 'b' },
]

function compressIdentifiers(source: string): string {
  let result = source
  for (const { pattern, prefix } of RENAME_RULES) {
    const shortNameByOriginal = new Map<string, string>()
    result = result.replace(pattern, (original) => {
      let short = shortNameByOriginal.get(original)
      if (short === undefined) {
        short = `${prefix}${shortNameByOriginal.size}`
        shortNameByOriginal.set(original, short)
      }
      return short
    })
  }
  return result
}
