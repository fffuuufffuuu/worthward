// @vitest-environment node

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('CLI info tooltip styles', () => {
  it('keeps a continuous hover bridge between the CLI info icon and its tip', () => {
    const appCss = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/styles/app.css'),
      'utf8',
    )
    const tooltipRule = appCss.match(/\.cli-info-tooltip\{[^}]+\}/)?.[0] ?? ''
    expect(tooltipRule).toContain('bottom:100%')
    expect(tooltipRule).toContain('padding-bottom:8px')
    expect(tooltipRule).not.toContain('bottom:calc(100% + 8px)')
  })
})
