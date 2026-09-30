import { useNavigate, useSearchParams } from 'react-router'
import { LoginForm } from '@/features/auth-login'
import { safeRedirectPath } from '@/shared/auth'
import { DEMO_ACCOUNTS, env, REDIRECT_PARAM } from '@/shared/config'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'

export function LoginPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  function handleSuccess() {
    void navigate(safeRedirectPath(searchParams.get(REDIRECT_PARAM)), { replace: true })
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">
            <h1>Login</h1>
          </CardTitle>
          <CardDescription>Sign in to SimpleInvoice with your email and password.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LoginForm onSuccess={handleSuccess} />
          {env.isDev ? (
            <p className="text-xs text-muted-foreground">
              Demo accounts: {DEMO_ACCOUNTS.accountant} (accountant) and {DEMO_ACCOUNTS.auditor} (read-only). The
              password is the SEED_DEMO_PASSWORD value from your env.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}
