import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react'

type FieldProps = {
  label: string
  hint?: ReactNode
  fullWidth?: boolean
  children: ReactNode
}

/** Labeled admin field wrapper (`admin-field`). */
export function Field({ label, hint, fullWidth, children }: FieldProps) {
  return (
    <label
      className={
        fullWidth ? 'admin-field admin-field--full' : 'admin-field'
      }
    >
      <span>{label}</span>
      {children}
      {hint ? <span className="admin-hint">{hint}</span> : null}
    </label>
  )
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement>

export function TextInput(props: TextInputProps) {
  return <input className="admin-input" {...props} />
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function TextArea({ className, ...props }: TextAreaProps) {
  const classes = ['admin-input', 'admin-textarea', className]
    .filter(Boolean)
    .join(' ')
  return <textarea className={classes} {...props} />
}
