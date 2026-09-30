import { useSyncExternalStore } from 'react'

/** Subscribes to a CSS media query so only one of table or cards is mounted at a time. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = globalThis.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => globalThis.matchMedia(query).matches,
  )
}
