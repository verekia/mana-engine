import { describe, expect, test } from 'bun:test'

import type { ManaScript, ScriptParamDef } from './script.ts'

/** Replicates the param merging logic from scene.ts createScene() */
function mergeScriptParams(
  scriptDef: ManaScript,
  instanceParams?: Record<string, number | string | boolean>,
): Record<string, number | string | boolean> {
  const params: Record<string, number | string | boolean> = {}
  if (scriptDef.params) {
    for (const [key, def] of Object.entries(scriptDef.params)) {
      params[key] = def.default
    }
  }
  if (instanceParams) {
    Object.assign(params, instanceParams)
  }
  return params
}

describe('Script param merging', () => {
  test('uses defaults when no instance params', () => {
    const script: ManaScript = {
      params: {
        speed: { type: 'number', default: 2 },
        label: { type: 'string', default: 'hello' },
        active: { type: 'boolean', default: true },
      },
    }
    const params = mergeScriptParams(script)
    expect(params).toEqual({ speed: 2, label: 'hello', active: true })
  })

  test('instance params override defaults', () => {
    const script: ManaScript = {
      params: {
        speed: { type: 'number', default: 2 },
        label: { type: 'string', default: 'hello' },
      },
    }
    const params = mergeScriptParams(script, { speed: 5 })
    expect(params).toEqual({ speed: 5, label: 'hello' })
  })

  test('works with no script params defined', () => {
    const script: ManaScript = {}
    const params = mergeScriptParams(script, { custom: 42 })
    expect(params).toEqual({ custom: 42 })
  })

  test('works with empty instance params', () => {
    const script: ManaScript = {
      params: {
        speed: { type: 'number', default: 1 },
      },
    }
    const params = mergeScriptParams(script, {})
    expect(params).toEqual({ speed: 1 })
  })

  test('instance params can add keys not in defaults', () => {
    const script: ManaScript = {
      params: {
        speed: { type: 'number', default: 1 },
      },
    }
    const params = mergeScriptParams(script, { speed: 3, extra: 'bonus' })
    expect(params).toEqual({ speed: 3, extra: 'bonus' })
  })
})

describe('ManaScript interface', () => {
  test('script with all lifecycle methods', () => {
    const calls: string[] = []
    const script: ManaScript = {
      params: { speed: { type: 'number', default: 1 } },
      init() {
        calls.push('init')
      },
      update() {
        calls.push('update')
      },
      fixedUpdate() {
        calls.push('fixedUpdate')
      },
      dispose() {
        calls.push('dispose')
      },
    }

    // biome-ignore lint: testing with minimal mock context
    const ctx: any = { entity: {}, scene: {}, dt: 0.016, time: 1, params: { speed: 1 } }
    script.init?.(ctx)
    script.update?.(ctx)
    script.fixedUpdate?.(ctx)
    script.dispose?.()

    expect(calls).toEqual(['init', 'update', 'fixedUpdate', 'dispose'])
  })

  test('script with no lifecycle methods is valid', () => {
    const script: ManaScript = {}
    expect(script.init).toBeUndefined()
    expect(script.update).toBeUndefined()
    expect(script.fixedUpdate).toBeUndefined()
    expect(script.dispose).toBeUndefined()
  })

  test('ScriptParamDef supports all types', () => {
    const numberParam: ScriptParamDef = { type: 'number', default: 42 }
    const stringParam: ScriptParamDef = { type: 'string', default: 'hello' }
    const boolParam: ScriptParamDef = { type: 'boolean', default: false }

    expect(numberParam.type).toBe('number')
    expect(stringParam.default).toBe('hello')
    expect(boolParam.default).toBe(false)
  })
})
