import { useEffect, useMemo, useState } from 'react'
import { FOCUS_QUOTES, pickFocusQuote, type FocusQuote } from '../domain/focusQuotes'

const TYPE_MS = 48
const DELETE_MS = 28
const HOLD_MS = 10_000

function pickNextQuote(current: FocusQuote): FocusQuote {
  if (FOCUS_QUOTES.length <= 1) return current
  let next = pickFocusQuote()
  for (let attempt = 0; attempt < 10 && next.text === current.text; attempt += 1) {
    next = pickFocusQuote()
  }
  return next
}

function StaticFocusQuote() {
  const [quote] = useState(() => pickFocusQuote())
  return (
    <blockquote className="focus-quote">
      <p>“{quote.text}”</p>
      <cite>— {quote.author}</cite>
    </blockquote>
  )
}

function AnimatedFocusQuote() {
  const [quote, setQuote] = useState(() => pickFocusQuote())
  const [charCount, setCharCount] = useState(0)
  const [phase, setPhase] = useState<'typing' | 'holding' | 'deleting'>('typing')
  const chars = useMemo(() => Array.from(quote.text), [quote.text])
  const visible = chars.slice(0, charCount).join('')

  useEffect(() => {
    if (phase === 'typing') {
      if (charCount >= chars.length) {
        setPhase('holding')
        return
      }
      const timer = window.setTimeout(() => setCharCount((count) => count + 1), TYPE_MS)
      return () => window.clearTimeout(timer)
    }

    if (phase === 'holding') {
      const timer = window.setTimeout(() => setPhase('deleting'), HOLD_MS)
      return () => window.clearTimeout(timer)
    }

    if (charCount > 0) {
      const timer = window.setTimeout(() => setCharCount((count) => count - 1), DELETE_MS)
      return () => window.clearTimeout(timer)
    }

    const next = pickNextQuote(quote)
    setQuote(next)
    setCharCount(0)
    setPhase('typing')
  }, [phase, charCount, chars.length, quote])

  return (
    <blockquote className="focus-quote" aria-live="polite">
      <p>
        “{visible}
        <span className={`focus-quote-caret${phase === 'holding' ? ' idle' : ''}`} aria-hidden="true" />
        ”
      </p>
      <cite className={charCount > 0 || phase !== 'typing' ? '' : 'is-empty'}>— {quote.author}</cite>
    </blockquote>
  )
}

export function FocusQuoteRotator() {
  if (import.meta.env.MODE === 'test') return <StaticFocusQuote />
  return <AnimatedFocusQuote />
}
