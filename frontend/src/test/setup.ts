import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { clearSession } from '@/shared/auth'
import { server } from './server'

// jsdom lacks these; Radix Select, DropdownMenu and Sonner touch them.
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => undefined
Element.prototype.releasePointerCapture ??= () => undefined
Element.prototype.scrollIntoView ??= () => undefined
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }) as MediaQueryList

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  clearSession()
})

afterAll(() => server.close())
