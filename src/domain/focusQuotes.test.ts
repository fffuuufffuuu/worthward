import { describe, expect, it } from 'vitest'
import { FOCUS_QUOTES, pickFocusQuote } from './focusQuotes'

describe('focus quotes', () => {
  it('keeps the verified local quotes and expands the attention quote pool', () => {
    expect(FOCUS_QUOTES.length).toBeGreaterThanOrEqual(16)
    expect(FOCUS_QUOTES).toEqual(expect.arrayContaining([
      {
        text: '我的经验，就是我同意去关注的事物。',
        author: '威廉·詹姆斯',
        source: 'The Principles of Psychology',
        sourceUrl: 'https://www.gutenberg.org/files/57628/old/57628-h/57628-h.htm',
      },
      {
        text: '信息的丰饶造成注意力的贫乏。',
        author: '赫伯特·西蒙',
        source: 'Designing Organizations for an Information-Rich World',
        sourceUrl: 'https://gwern.net/doc/design/1971-simon.pdf',
      },
    ]))
    expect(new Set(FOCUS_QUOTES.map((quote) => quote.author)).size).toBeGreaterThanOrEqual(12)
    expect(FOCUS_QUOTES.every((quote) => quote.text && quote.author && quote.source && quote.sourceUrl)).toBe(true)
  })

  it('selects the first and last local quote from deterministic draws', () => {
    expect(pickFocusQuote(() => 0)).toBe(FOCUS_QUOTES[0])
    expect(pickFocusQuote(() => 0.999999)).toBe(FOCUS_QUOTES.at(-1))
  })
})
