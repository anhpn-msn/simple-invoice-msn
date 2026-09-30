import { useId, type ComponentProps, type ReactNode } from 'react'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { NativeSelect } from '@/shared/ui/native-select'
import { Textarea } from '@/shared/ui/textarea'

interface FieldShellProps {
  label: string
  error?: string
  hint?: string
  required?: boolean
  render: (control: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => ReactNode
}

function FieldShell({ label, error, hint, required, render }: Readonly<FieldShellProps>) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={required ? "after:text-destructive after:content-['*']" : undefined}>
        {label}
      </Label>
      {render({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

interface CommonFieldProps {
  label: string
  error?: string
  hint?: string
}

export function TextField({
  label,
  error,
  hint,
  required,
  ...inputProps
}: CommonFieldProps & ComponentProps<'input'>) {
  return (
    <FieldShell
      label={label}
      error={error}
      hint={hint}
      required={required}
      render={(control) => <Input {...control} required={required} {...inputProps} />}
    />
  )
}

export function TextAreaField({
  label,
  error,
  hint,
  required,
  ...textareaProps
}: CommonFieldProps & ComponentProps<'textarea'>) {
  return (
    <FieldShell
      label={label}
      error={error}
      hint={hint}
      required={required}
      render={(control) => <Textarea {...control} required={required} {...textareaProps} />}
    />
  )
}

export function SelectField({
  label,
  error,
  hint,
  required,
  children,
  ...selectProps
}: CommonFieldProps & ComponentProps<'select'>) {
  return (
    <FieldShell
      label={label}
      error={error}
      hint={hint}
      required={required}
      render={(control) => (
        <NativeSelect {...control} required={required} {...selectProps}>
          {children}
        </NativeSelect>
      )}
    />
  )
}
