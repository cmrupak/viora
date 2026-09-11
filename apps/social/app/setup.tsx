import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { BRAND, colorsFor } from '@viora/core';
import { useColorScheme } from '@/components/useColorScheme';

export default function SetupScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      <Text style={[styles.brand, { color: colors.brand }]}>{BRAND.name}</Text>
      <Text style={[styles.title, { color: colors.ink }]}>Connect Supabase</Text>
      <Text style={[styles.lede, { color: colors.muted }]}>
        Create apps/social/.env with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (anon key only). Then run
        the Phase 2 SQL migration in Supabase.
      </Text>
      <Link href="/" style={[styles.link, { borderColor: colors.line }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Back to welcome</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  brand: { fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', fontSize: 12 },
  title: { fontSize: 28, fontWeight: '800' },
  lede: { fontSize: 15, lineHeight: 22 },
  link: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
