import { describe, expect, it } from 'vitest'
import {
  appendTextVariableEmitter,
  callSectionEmitter,
  calculateEmitter,
  commandRouterEmitter,
  echoEmitter,
  numberCompareEmitter,
  numberGreaterRouterEmitter,
  numberMathEmitter,
  repeatTimesEmitter,
  runEverySecondsEmitter,
  sectionMethodName,
  stopScriptEmitter,
  waitSecondsEmitter,
} from './logicEmitters'
import { expressionOf, fakeContext, makeNode, statementsOf } from './testUtils'

describe('runEverySecondsEmitter', () => {
  it('accumulates elapsed time and only reports due once the threshold is hit', () => {
    const node = makeNode({ ActionType: 'RunEverySeconds', Properties: { Seconds: '5' } })
    const emit = runEverySecondsEmitter(node, fakeContext())
    expect(emit.kind).toBe('condition')
    const statements = statementsOf(emit)
    expect(statements.join('\n')).toContain('>= 5')
    // Resets the accumulator only when due, so it doesn't fire every tick after threshold.
    expect(statements[2]).toContain('if (GetBool(')
  })

  it('uses a per-node key so two RunEverySeconds nodes do not share state', () => {
    const a = runEverySecondsEmitter(makeNode({ ActionType: 'RunEverySeconds', Id: 'a', Properties: { Seconds: '1' } }), fakeContext())
    const b = runEverySecondsEmitter(makeNode({ ActionType: 'RunEverySeconds', Id: 'b', Properties: { Seconds: '1' } }), fakeContext())
    expect(expressionOf(a)).not.toBe(expressionOf(b))
  })
})

describe('numberCompareEmitter', () => {
  it.each([
    ['>', '>'],
    ['<', '<'],
    ['>=', '>='],
    ['<=', '<='],
  ])('emits the %s operator verbatim', (operator, expected) => {
    const node = makeNode({ ActionType: 'NumberCompare', Properties: { Name: 'n', Operator: operator, Value: '5' } })
    const emit = numberCompareEmitter(node, fakeContext())
    expect(emit.kind).toBe('condition')
    expect(expressionOf(emit)).toBe(`GetNum("n") ${expected} 5d`)
  })

  it('falls back to > for an unrecognized/missing operator', () => {
    const node = makeNode({ ActionType: 'NumberCompare', Properties: { Name: 'n', Operator: '', Value: '5' } })
    expect(expressionOf(numberCompareEmitter(node, fakeContext()))).toBe('GetNum("n") > 5d')
  })

  it('Value can be a variable reference instead of a literal', () => {
    const node = makeNode({ ActionType: 'NumberCompare', Properties: { Name: 'n', Operator: '>', Value: '{threshold}' } })
    expect(expressionOf(numberCompareEmitter(node, fakeContext()))).toBe('GetNum("n") > GetNum("threshold")')
  })

  it('== and != compare within Tolerance instead of an exact float ==, absorbing the retired Number Equals node', () => {
    const node = makeNode({ ActionType: 'NumberCompare', Properties: { Name: 'n', Operator: '==', Value: '5', Tolerance: '0.01' } })
    expect(expressionOf(numberCompareEmitter(node, fakeContext()))).toBe('Math.Abs(GetNum("n") - (5d)) <= (0.01)')

    const notEqual = makeNode({ ActionType: 'NumberCompare', Properties: { Name: 'n', Operator: '!=', Value: '5', Tolerance: '0.01' } })
    expect(expressionOf(numberCompareEmitter(notEqual, fakeContext()))).toBe('!(Math.Abs(GetNum("n") - (5d)) <= (0.01))')
  })

  it('a missing Tolerance defaults to 0 (exact equality), for old nodes/graphs saved before Tolerance existed', () => {
    const node = makeNode({ ActionType: 'NumberCompare', Properties: { Name: 'n', Operator: '==', Value: '5' } })
    expect(expressionOf(numberCompareEmitter(node, fakeContext()))).toBe('Math.Abs(GetNum("n") - (5d)) <= (0d)')
  })
})

describe('numberMathEmitter', () => {
  it.each([
    ['+', 'GetNum("n") + (3d)'],
    ['-', 'GetNum("n") - (3d)'],
    ['*', 'GetNum("n") * (3d)'],
  ])('applies the %s operator in place, replacing Add/Subtract/Multiply Number Variable', (operator, expected) => {
    const node = makeNode({ ActionType: 'NumberMath', Properties: { Name: 'n', Operator: operator, Value: '3' } })
    const emit = numberMathEmitter(node, fakeContext())
    expect(statementsOf(emit).join('\n')).toContain(`_num["n"] = ${expected};`)
  })

  it('divide guards against a zero divisor instead of crashing the script', () => {
    const node = makeNode({ ActionType: 'NumberMath', Properties: { Name: 'n', Operator: '/', Value: '0' } })
    const emit = numberMathEmitter(node, fakeContext())
    const statements = statementsOf(emit).join('\n')
    expect(statements).toContain('if ((0d) == 0)')
    expect(statements).toContain('Echo("Divide by zero: " + "n")')
  })

  it('divides normally for a non-zero divisor', () => {
    const node = makeNode({ ActionType: 'NumberMath', Properties: { Name: 'n', Operator: '/', Value: '4' } })
    const statements = statementsOf(numberMathEmitter(node, fakeContext())).join('\n')
    expect(statements).toContain('_num["n"] = GetNum("n") / (4d);')
  })

  it('falls back to + for an unrecognized/missing operator', () => {
    const node = makeNode({ ActionType: 'NumberMath', Properties: { Name: 'n', Operator: '', Value: '3' } })
    expect(statementsOf(numberMathEmitter(node, fakeContext())).join('\n')).toContain('_num["n"] = GetNum("n") + (3d);')
  })
})

describe('appendTextVariableEmitter', () => {
  it('appends a literal value', () => {
    const node = makeNode({ ActionType: 'AppendTextVariable', Properties: { Name: 't', Value: 'more' } })
    const emit = appendTextVariableEmitter(node, fakeContext())
    expect(statementsOf(emit).join('\n')).toContain('_text["t"] = GetText("t") + "more";')
  })

  it('Value supports the same {name} interpolation as Set Text Variable/Echo', () => {
    const node = makeNode({ ActionType: 'AppendTextVariable', Properties: { Name: 't', Value: '{other}' } })
    const emit = appendTextVariableEmitter(node, fakeContext())
    expect(statementsOf(emit).join('\n')).toContain('_text["t"] = GetText("t") + $"{GetNum("other")}";')
  })
})

describe('waitSecondsEmitter', () => {
  it('returns early (pausing the whole call chain) until enough time has passed', () => {
    const node = makeNode({ ActionType: 'WaitSeconds', Properties: { Seconds: '3' } })
    const emit = waitSecondsEmitter(node, fakeContext())
    expect(emit.kind).toBe('raw')
    const statements = statementsOf(emit)
    expect(statements.some((s) => s.includes('return;'))).toBe(true)
    expect(statements.join('\n')).toContain('< 3) return;')
  })
})

describe('stopScriptEmitter', () => {
  it('disables the update frequency before returning', () => {
    const emit = stopScriptEmitter(makeNode({ ActionType: 'StopScript' }), fakeContext())
    expect(statementsOf(emit)).toEqual(['Runtime.UpdateFrequency = UpdateFrequency.None;', 'return;'])
  })
})

describe('commandRouterEmitter', () => {
  it('only emits case labels for arguments the user actually configured', () => {
    const node = makeNode({
      ActionType: 'CommandRouter',
      Properties: { StartupArgument: 'startup', DockArgument: '' },
    })
    const emit = commandRouterEmitter(node, fakeContext())
    const src = statementsOf(emit).join('\n')
    expect(src).toContain('case "startup":')
    expect(src).not.toContain('case "":')
    expect(src).toContain('default:')
  })
})

describe('numberGreaterRouterEmitter', () => {
  it('builds a nested if/else so only the highest matching threshold fires', () => {
    const node = makeNode({
      ActionType: 'NumberGreaterRouter',
      Properties: { Name: 'x', Threshold2: '2', Threshold3: '3' },
    })
    const emit = numberGreaterRouterEmitter(node, fakeContext())
    const src = statementsOf(emit).join('\n')
    expect(src.indexOf('> 3')).toBeLessThan(src.indexOf('> 2'))
    expect(src).toContain('NEXT(Else)')
  })

  it('skips unset thresholds entirely rather than emitting a broken branch', () => {
    const node = makeNode({ ActionType: 'NumberGreaterRouter', Properties: { Name: 'x', Threshold4: '4' } })
    const emit = numberGreaterRouterEmitter(node, fakeContext())
    const src = statementsOf(emit).join('\n')
    expect(src).not.toContain('> undefined')
    expect(src).toContain('> 4')
  })
})

describe('repeatTimesEmitter', () => {
  it('loops until the counter reaches Times, then resets and goes to Done', () => {
    const node = makeNode({ ActionType: 'RepeatTimes', Properties: { Times: '3' } })
    const emit = repeatTimesEmitter(node, fakeContext())
    const src = statementsOf(emit).join('\n')
    expect(src).toContain('< 3')
    expect(src).toContain('NEXT(Loop)')
    expect(src).toContain('_num[') // resets the counter in the Done branch
    expect(src).toContain('NEXT(Done)')
  })
})

describe('echoEmitter', () => {
  it('emits a plain literal when the text has no {variable} holes', () => {
    const node = makeNode({ ActionType: 'Echo', Properties: { Text: 'hello' } })
    const emit = echoEmitter(node, fakeContext())
    expect(statementsOf(emit)[0]).toBe('Echo("hello");')
  })

  it('interpolates a {name} hole as a number-variable read by default', () => {
    const node = makeNode({ ActionType: 'Echo', Properties: { Text: 'Elevation: {elevation}m' } })
    const ctx = fakeContext()
    const emit = echoEmitter(node, ctx)
    expect(ctx.usedHelpers.has('Vars')).toBe(true)
    expect(statementsOf(emit)[0]).toBe('Echo($"Elevation: {GetNum("elevation")}m");')
  })

  it('supports explicit text: and bool: kind prefixes', () => {
    const node = makeNode({ ActionType: 'Echo', Properties: { Text: '{text:name} armed={bool:armed}' } })
    const emit = echoEmitter(node, fakeContext())
    expect(statementsOf(emit)[0]).toBe('Echo($"{GetText("name")} armed={GetBool("armed")}");')
  })
})

describe('calculateEmitter', () => {
  it('translates variable names and arithmetic operators into GetNum reads', () => {
    const node = makeNode({ ActionType: 'CalculateFormula', Properties: { Name: 'result', Formula: 'a + b * 2' } })
    const ctx = fakeContext()
    const emit = calculateEmitter(node, ctx)
    expect(ctx.usedHelpers.has('Vars')).toBe(true)
    expect(statementsOf(emit)[0]).toBe('_num["result"] = GetNum("a") + GetNum("b") * 2;')
  })

  it('maps known function names to Math.* equivalents', () => {
    const node = makeNode({ ActionType: 'CalculateFormula', Properties: { Name: 'r', Formula: 'sqrt(x)' } })
    const emit = calculateEmitter(node, fakeContext())
    expect(statementsOf(emit)[0]).toBe('_num["r"] = Math.Sqrt(GetNum("x"));')
  })

  it('rejects formulas with characters outside the safe arithmetic charset', () => {
    const node = makeNode({ ActionType: 'CalculateFormula', Properties: { Name: 'r', Formula: 'x; DoEvil()' } })
    const emit = calculateEmitter(node, fakeContext())
    const statements = statementsOf(emit)
    expect(statements[0]).toContain('WARNING')
    expect(statements[1]).toBe('_num["r"] = 0;')
  })
})

describe('sections', () => {
  it('sectionMethodName sanitizes non-identifier characters', () => {
    expect(sectionMethodName('my section 1')).toBe('Section_my_section_1')
  })

  it('callSectionEmitter delegates to ctx.callSection with the raw section name', () => {
    const node = makeNode({ ActionType: 'CallSection', Properties: { SectionName: 'cleanup' } })
    const emit = callSectionEmitter(node, fakeContext())
    expect(statementsOf(emit)).toEqual(['CALL_SECTION(cleanup);'])
  })
})
