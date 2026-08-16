import { describe, expect, it } from 'vitest'
import { minifySource } from './minify'

describe('minifySource', () => {
  it('strips standalone comment lines and joins without newlines', () => {
    const src = ['// #1 Start', 'void Step_1_Start() {', '    Step_2_Echo();', '}'].join('\n')
    // Step_1_Start / Step_2_Echo both get compressed to short M-names too.
    expect(minifySource(src)).toBe('void M0() {M1();}')
  })

  it('drops blank lines', () => {
    const src = 'a();\n\n\nb();\n'
    expect(minifySource(src)).toBe('a();b();')
  })

  it('trims leading indentation', () => {
    const src = '        int budget = 25;'
    expect(minifySource(src)).toBe('int budget = 25;')
  })

  it('does not strip a trailing // comment that follows real code on the same line', () => {
    const src = 'x = 1; // some comment'
    expect(minifySource(src)).toBe('x = 1;')
  })

  it('leaves a // that appears inside a string literal alone', () => {
    const src = 'Echo("see http://example.com for docs");'
    expect(minifySource(src)).toBe(src)
  })

  it('leaves a // inside an interpolated string literal alone, including one after a nested-quote GetNum call', () => {
    const src = 'Echo($"Elevation: {GetNum("elevation")}m // not a comment");'
    expect(minifySource(src)).toBe(src)
  })

  it('handles an escaped quote inside a string without prematurely ending it', () => {
    const src = 'Echo("she said \\"hi// there\\"");'
    expect(minifySource(src)).toBe(src)
  })

  it('inserts a single separating space when two lines would otherwise merge into one token', () => {
    // Neither line ends/starts on punctuation, so a bare join would read "returnx".
    const src = 'return\nx;'
    expect(minifySource(src)).toBe('return x;')
  })

  it('does not insert a space when the boundary is already punctuation', () => {
    const src = 'void A() {\nB();\n}'
    expect(minifySource(src)).toBe('void A() {B();}')
  })

  describe('identifier compression', () => {
    it('shortens Step_<N>_<Title> method names consistently everywhere they appear, including as dispatch string keys', () => {
      const src = [
        'void Step_1_Start() {',
        '    _nextNode = "Step_2_Echo_Message";',
        '}',
        'void Step_2_Echo_Message() {',
        '    Echo("hi");',
        '}',
      ].join('\n')
      const out = minifySource(src)
      expect(out).toBe('void M0() {_nextNode = "M1";}void M1() {Echo("hi");}')
    })

    it('shortens Num_/Text_/Bool_ field names by their own counters, and Section_ aliases too', () => {
      const src = [
        'double Num_elevation;',
        'string Text_name = "";',
        'bool Bool_armed;',
        'void Section_cleanup() { Num_elevation = 0; }',
      ].join('\n')
      const out = minifySource(src)
      expect(out).toBe('double n0;string t0 = "";bool b0;void S0() { n0 = 0; }')
    })

    it('does not rename a field/method name that merely appears as a substring inside a longer identifier', () => {
      // A user variable literally named "Step_3_Thing" would field-promote to
      // "Num_Step_3_Thing" — the underscore glues it to the Num_ prefix, so
      // "Step_3_Thing" must NOT also get renamed as if it were its own method.
      const src = 'double Num_Step_3_Thing;'
      expect(minifySource(src)).toBe('double n0;')
    })
  })
})
