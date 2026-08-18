import { describe, expect, it } from 'vitest'
import { boolLiteral, numberLiteral, sanitizeIdentifier, stringLiteral } from './format'

describe('numberLiteral', () => {
  it('formats integers with a trailing d suffix', () => {
    expect(numberLiteral('5')).toBe('5d')
    expect(numberLiteral('-3')).toBe('-3d')
    expect(numberLiteral('0')).toBe('0d')
  })

  it('formats decimals without the suffix', () => {
    expect(numberLiteral('2.5')).toBe('2.5')
  })

  it('defaults non-numeric or missing input to 0', () => {
    expect(numberLiteral('not a number')).toBe('0d')
    expect(numberLiteral(undefined)).toBe('0d')
    expect(numberLiteral('')).toBe('0d')
  })
})

describe('boolLiteral', () => {
  it('parses case-insensitively', () => {
    expect(boolLiteral('true')).toBe('true')
    expect(boolLiteral('True')).toBe('true')
    expect(boolLiteral('TRUE')).toBe('true')
  })

  it('defaults anything else to false', () => {
    expect(boolLiteral('false')).toBe('false')
    expect(boolLiteral('yes')).toBe('false')
    expect(boolLiteral(undefined)).toBe('false')
    expect(boolLiteral('')).toBe('false')
  })
})

describe('stringLiteral', () => {
  it('wraps plain text in quotes', () => {
    expect(stringLiteral('hello')).toBe('"hello"')
  })

  it('escapes backslashes before quotes (order matters)', () => {
    expect(stringLiteral('a\\b"c')).toBe('"a\\\\b\\"c"')
  })

  it('escapes embedded quotes', () => {
    expect(stringLiteral('say "hi"')).toBe('"say \\"hi\\""')
  })

  it('converts newlines and tabs to escape sequences', () => {
    expect(stringLiteral('line1\nline2')).toBe('"line1\\nline2"')
    expect(stringLiteral('line1\r\nline2')).toBe('"line1\\nline2"')
    expect(stringLiteral('a\tb')).toBe('"a\\tb"')
  })

  it('defaults undefined to an empty string literal', () => {
    expect(stringLiteral(undefined)).toBe('""')
  })
})

describe('sanitizeIdentifier', () => {
  it('strips characters invalid in a C# identifier', () => {
    expect(sanitizeIdentifier('N', 'abc-123-def')).toBe('N_abc123def')
  })

  it('preserves underscores and alphanumerics', () => {
    expect(sanitizeIdentifier('Section', 'my_section_1')).toBe('Section_my_section_1')
  })
})
