import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { setSession } from '@/shared/auth'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { login, loginErrorMessage } from '../api/login'
import { loginSchema, type LoginFormValues } from '../model/schema'

interface LoginFormProps {
  /** Called after the session is stored. The page decides where to go next. */
  onSuccess: () => void
}

export function LoginForm({ onSuccess }: Readonly<LoginFormProps>) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (response) => {
      setSession(response)
      onSuccess()
    },
  })

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="flex flex-col gap-4"
    >
      {mutation.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{loginErrorMessage(mutation.error)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="username"
          autoFocus
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'login-email-error' : undefined}
          {...register('email')}
        />
        {errors.email ? (
          <p id="login-email-error" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? 'login-password-error' : undefined}
          {...register('password')}
        />
        {errors.password ? (
          <p id="login-password-error" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
        {mutation.isPending ? 'Signing in' : 'Sign in'}
      </Button>
    </form>
  )
}
