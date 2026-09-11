import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { brand } from '@/design/tokens';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-xs font-bold uppercase tracking-[1.5px] text-primary">{brand.name}</Text>
        <Text className="mt-3 text-3xl font-bold text-ink">{title}</Text>
        <Text className="mt-2 text-sm leading-5 text-muted">{subtitle}</Text>
        <View className="mt-6 rounded-2xl border border-border bg-surface p-5">{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
