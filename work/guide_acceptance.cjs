const fs = require('fs')
const path = require('path')

const guidePath = process.argv[2]
if (!guidePath) throw new Error('Usage: node work/guide_acceptance.cjs <guide-file>')

const html = fs.readFileSync(path.resolve(guidePath), 'utf8')
const searchableHtml = html.replace(/<br\s*\/?\s*>/g, '')
const required = [
  'AI 提出聚焦方向建议，由你确认投入方向。',
  '作者：CashewLab',
  'href="https://github.com/fffuuufffuuu/worthward"',
  '.footer-github { color: #536872; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }',
  '.footer-github:hover { color: var(--deep); text-decoration-thickness: 2px; }',
]
const forbidden = [
  '作者：待补充',
  'aria-disabled="true" aria-label="GitHub 链接待补充"',
]

const missing = required.filter((text) => !searchableHtml.includes(text))
const presentForbidden = forbidden.filter((text) => html.includes(text))

if (missing.length || presentForbidden.length) {
  if (missing.length) console.error(`Missing required content: ${missing.join(' | ')}`)
  if (presentForbidden.length) console.error(`Forbidden content found: ${presentForbidden.join(' | ')}`)
  process.exit(1)
}

console.log('GUIDE_ACCEPTANCE=PASS')
