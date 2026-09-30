import fsd from '@feature-sliced/steiger-plugin'
import { defineConfig } from 'steiger'

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // SPEC 8.1 names these user actions as features on purpose, so each has one page consumer today.
    files: ['./src/features/auth-login/**', './src/features/invoice-create/**'],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
  {
    // The app-layer segment name "providers" is mandated by the project structure (SPEC 8.1).
    files: ['./src/app/providers/**'],
    rules: { 'fsd/segments-by-purpose': 'off' },
  },
])
