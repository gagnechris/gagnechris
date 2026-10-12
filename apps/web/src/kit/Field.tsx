import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

type FieldProps = {
  label: string;
  hint?: ReactNode;
  fullWidth?: boolean;
  children: ReactNode;
};

export function Field({ label, hint, fullWidth, children }: FieldProps) {
  return (
    <label className={fullWidth ? 'kit-field kit-field--full' : 'kit-field'}>
      <span>{label}</span>
      {children}
      {hint ? <span className="kit-hint">{hint}</span> : null}
    </label>
  );
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

export function TextInput(props: TextInputProps) {
  return <input className="kit-input" {...props} />;
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea({ className, ...props }: TextAreaProps) {
  const classes = ['kit-input', 'kit-textarea', className]
    .filter(Boolean)
    .join(' ');
  return <textarea className={classes} {...props} />;
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: SelectProps) {
  const classes = ['kit-input', className].filter(Boolean).join(' ');
  return (
    <select className={classes} {...props}>
      {children}
    </select>
  );
}
