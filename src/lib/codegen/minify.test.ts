import { describe, expect, it } from 'vitest'
import { minifySource } from './minify'

describe('minifySource', () => {
  it('strips standalone comment lines', () => {
    const src = ['// #1 Start', 'void Step_1_Start() {', '    Step_2_Echo();', '}'].join('\n')
    expect(minifySource(src)).toBe('void Step_1_Start() {\nStep_2_Echo();\n}')
  })

  it('drops blank lines', () => {
    const src = 'a;\n\n\nb;\n'
    expect(minifySource(src)).toBe('a;\nb;')
  })

  it('trims leading indentation but leaves interior spacing alone', () => {
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

  it('is a no-op on already-minified input', () => {
    const src = 'void A() {\nB();\n}'
    expect(minifySource(src)).toBe(src)
  })
})
