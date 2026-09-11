import { forwardRef, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps, type PressableProps } from 'react-native';

export const Button = forwardRef<View, PressableProps & {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
}>(function Button({ children, variant = 'primary', disabled = false, className = '', ...props }, ref) {
  const variants = {
    primary: 'bg-primary',
    secondary: 'bg-surface2',
    ghost: 'bg-transparent border border-border',
  };
  const text = {
    primary: 'text-white',
    secondary: 'text-ink',
    ghost: 'text-ink',
  };
  return (
    <Pressable
      ref={ref}
      disabled={disabled}
      className={`h-11 items-center justify-center rounded-xl px-4 ${variants[variant]} ${disabled ? 'opacity-50' : ''} ${className}`}
      {...props}
    >
      <Text className={`text-sm font-semibold ${text[variant]}`}>{children}</Text>
    </Pressable>
  );
});

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <View className={`rounded-2xl border border-border bg-surface p-4 ${className}`}>{children}</View>;
}

export function FieldLabel({ children }: { children: string }) {
  return <Text className="mb-1.5 text-sm font-semibold text-ink">{children}</Text>;
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <Text className="mt-1.5 text-xs font-semibold text-danger">{message}</Text>;
}

export function TextField({ className = '', ...props }: TextInputProps & { className?: string }) {
  return (
    <TextInput
      placeholderTextColor="#64748B"
      className={`h-11 rounded-xl border border-border bg-bg px-3 text-base text-ink ${className}`}
      {...props}
    />
  );
}
