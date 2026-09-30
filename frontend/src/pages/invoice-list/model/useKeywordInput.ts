import { useEffect, useEffectEvent, useState } from 'react'
import { KEYWORD_DEBOUNCE_MS } from './constants'

/**
 * Local text state for the search box. The typed value goes to the URL only after the user
 * pauses, and URL changes made elsewhere (back button, reset) flow back into the box.
 */
export function useKeywordInput(urlKeyword: string, onCommit: (keyword: string) => void) {
  const [input, setInput] = useState(urlKeyword)
  const [committed, setCommitted] = useState(urlKeyword)
  const [seenUrlKeyword, setSeenUrlKeyword] = useState(urlKeyword)

  // Our own commit also changes the URL; only a different URL value is an outside change.
  if (urlKeyword !== seenUrlKeyword) {
    setSeenUrlKeyword(urlKeyword)
    if (urlKeyword !== committed) {
      setInput(urlKeyword)
      setCommitted(urlKeyword)
    }
  }

  const commit = useEffectEvent(onCommit)

  useEffect(() => {
    const trimmed = input.trim()
    if (trimmed === committed) {
      return
    }
    const timer = setTimeout(() => {
      setCommitted(trimmed)
      commit(trimmed)
    }, KEYWORD_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [input, committed])

  function clear() {
    setInput('')
    setCommitted('')
  }

  return { value: input, setValue: setInput, clear }
}
