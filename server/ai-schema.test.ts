// @vitest-environment node

import { describe, expect, test } from 'vitest'
import { validateJsonShape } from './ai-schema.mjs'

const connectionShape = {
  type: 'object',
  required: ['ok'],
  properties: {
    ok: { const: true },
  },
}

describe('validateJsonShape', () => {
  test('accepts the connection test payload', () => {
    expect(validateJsonShape({ ok: true }, connectionShape)).toEqual({
      ok: true,
      value: { ok: true },
    })
  })

  test('rejects a missing field', () => {
    expect(validateJsonShape({}, connectionShape).ok).toBe(false)
  })

  test('rejects ok:false', () => {
    expect(validateJsonShape({ ok: false }, connectionShape).ok).toBe(false)
  })

  test('rejects a non-object', () => {
    expect(validateJsonShape('ok', connectionShape).ok).toBe(false)
  })
})
