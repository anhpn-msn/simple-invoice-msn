import { setupServer } from 'msw/node'
import { createApiHandlers } from './handlers'

/** Started, reset and closed by `setup.ts`. Override per test with `server.use(...)`. */
export const server = setupServer(...createApiHandlers())
