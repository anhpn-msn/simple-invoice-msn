import { z } from 'zod'
import { MAX_EMAIL_LENGTH } from '@/shared/config'

const MAX_PASSWORD_BYTES = 72

const encoder = new TextEncoder()

// bcrypt only reads the first 72 bytes, so longer input is rejected instead of silently cut.
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .max(MAX_EMAIL_LENGTH, 'Email is too long')
    .pipe(z.email('Enter a valid email address')),
  password: z
    .string()
    .min(1, 'Password is required')
    .refine((value) => encoder.encode(value).length <= MAX_PASSWORD_BYTES, `Password must be at most ${MAX_PASSWORD_BYTES} bytes`),
})

export type LoginFormValues = z.infer<typeof loginSchema>
