/** Coercion and escaping helpers shared by all emitters. Property values on a
 * ScriptNode are always strings (see PropertyPanel); these turn them into
 * safe C# literals. */

export function numberLiteral(raw: string | undefined): string {
  const n = Number(raw)
  const value = Number.isFinite(n) ? n : 0
  return Number.isInteger(value) ? `${value}d` : `${value}`
}

export function boolLiteral(raw: string | undefined): string {
  return raw?.trim().toLowerCase() === 'true' ? 'true' : 'false'
}

export function stringLiteral(raw: string | undefined): string {
  const text = raw ?? ''
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n')
    .replace(/\t/g, '\\t')
  return `"${escaped}"`
}

/** C# identifiers must start with a letter/underscore and contain only
 * word characters; ScriptNode.Id is a crypto.randomUUID(), so strip dashes. */
export function sanitizeIdentifier(prefix: string, id: string): string {
  return `${prefix}_${id.replace(/[^a-zA-Z0-9_]/g, '')}`
}

/** Turns a node Title (e.g. "If Number Less Than") into a readable method
 * name fragment ("If_Number_Less_Than"), collapsing anything that isn't a
 * word character into a single underscore. */
export function titleToIdentifier(title: string): string {
  return title
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
