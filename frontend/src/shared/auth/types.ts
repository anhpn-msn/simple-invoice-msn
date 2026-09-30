export type Role = 'ACCOUNTANT' | 'AUDITOR'

export interface AuthUser {
  id: string
  email: string
  fullname: string
  role: Role
  permissions: string[]
}

export interface LoginResponse {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
  user: AuthUser
}

export interface Session {
  accessToken: string
  /** Epoch milliseconds. */
  expiresAt: number
  user: AuthUser
}
