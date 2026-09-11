import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { colorsFor } from '@viora/core';
import { useColorScheme } from '@/components/useColorScheme';

export function PlaceholderScreen({ title, phase }: { title: string; phase: number }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      <Text style={[styles.eyebrow, { color: colors.brand }]}>Phase {phase}</Text>
      <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
      <Text style={[styles.lede, { color: colors.muted }]}>
        Same screen exists on web. Shared logic will live in @viora/core.
      </Text>
      <Link href="/" style={[styles.link, { borderColor: colors.line }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Back to welcome</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'center', gap: 10 },
  eyebrow: { fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 },
  title: { fontSize: 28, fontWeight: '800' },
  lede: { fontSize: 15, lineHeight: 22 },
  link: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
