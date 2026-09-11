import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function Input({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-11 w-full rounded-[12px] border border-border bg-surface px-3.5 text-sm text-ink placeholder:text-muted outline-none transition focus:border-primary ${className}`}
      {...props}
    />
  );
}

export function Textarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`min-h-24 w-full rounded-[12px] border border-border bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-muted outline-none transition focus:border-primary ${className}`}
      {...props}
    />
  );
}

export function Label({ children, htmlFor }: { children: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-ink">
      {children}
    </label>
  );
}
