export type CreateFailure =
  | { kind: 'invoice-number-taken'; message: string }
  | { kind: 'forbidden'; message: string }
  | { kind: 'banner'; messages: string[] }
