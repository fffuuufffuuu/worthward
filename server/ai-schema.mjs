function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(error) {
  return { ok: false, error }
}

export function validateJsonShape(value, shape) {
  if (!shape || typeof shape !== 'object') return fail('Missing JSON shape')

  if (Object.prototype.hasOwnProperty.call(shape, 'const')) {
    if (value !== shape.const) return fail('Value does not match the required constant')
    return { ok: true, value }
  }

  if (shape.type === 'object') {
    if (!isObject(value)) return fail('Expected an object')
    const required = Array.isArray(shape.required) ? shape.required : []
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        return fail(`Missing required field: ${key}`)
      }
    }
    const properties = isObject(shape.properties) ? shape.properties : {}
    const result = {}
    for (const [key, childShape] of Object.entries(properties)) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue
      const child = validateJsonShape(value[key], childShape)
      if (!child.ok) return child
      result[key] = child.value
    }
    return { ok: true, value: { ...value, ...result } }
  }

  if (shape.type === 'array') {
    if (!Array.isArray(value)) return fail('Expected an array')
    if (typeof shape.minItems === 'number' && value.length < shape.minItems) {
      return fail('Array is too short')
    }
    if (typeof shape.maxItems === 'number' && value.length > shape.maxItems) {
      return fail('Array is too long')
    }
    if (shape.items) {
      const items = []
      for (const entry of value) {
        const child = validateJsonShape(entry, shape.items)
        if (!child.ok) return child
        items.push(child.value)
      }
      return { ok: true, value: items }
    }
    return { ok: true, value }
  }

  if (shape.type === 'string') {
    if (typeof value !== 'string') return fail('Expected a string')
    return { ok: true, value }
  }

  if (shape.type === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) return fail('Expected a number')
    return { ok: true, value }
  }

  if (shape.type === 'boolean') {
    if (typeof value !== 'boolean') return fail('Expected a boolean')
    return { ok: true, value }
  }

  return fail('Unsupported JSON shape')
}

export const CONNECTION_TEST_SHAPE = {
  type: 'object',
  required: ['ok'],
  properties: {
    ok: { const: true },
  },
}
