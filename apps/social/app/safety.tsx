import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  LANGUAGE_OPTIONS,
  colorsFor,
  getErrorMessage,
  type AppLanguageCode,
  type UserSettings,
} from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useAppTheme } from '@/components/ThemePreference';

export default function SafetyScreen() {
  const { api, user } = useAuth();
  const { preference, setPreference, scheme: resolved } = useAppTheme();
  void preference;
  const colors = colorsFor(resolved);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reportUser, setReportUser] = useState('');
  const [reportReason, setReportReason] = useState('spam');

  useEffect(() => {
    if (!api || !user) return;
    void (async () => {
      try {
        const next = await api.settings.getSettings(user.id);
        setSettings(next);
        if (next.themePreference !== 'system') {
          setPreference(next.themePreference);
        }
      } catch (err) {
        setError(getErrorMessage(err));
      }
    })();
  }, [api, user, setPreference]);

  async function patch(partial: Partial<UserSettings>) {
    if (!api || !user || !settings) return;
    const prev = settings;
    setSettings({ ...settings, ...partial });
    setBusy(true);
    try {
      const saved = await api.settings.updateSettings(user.id, {
        language: partial.language,
        hideSensitive: partial.hideSensitive,
        loginAlerts: partial.loginAlerts,
        reduceMotion: partial.reduceMotion,
        themePreference: partial.themePreference,
      });
      setSettings(saved);
      if (saved.themePreference === 'light' || saved.themePreference === 'dark') {
        setPreference(saved.themePreference);
      } else {
        setPreference('system');
      }
    } catch (err) {
      setSettings(prev);
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onReport() {
    if (!api || !user || !reportUser.trim()) return;
    setBusy(true);
    setError('');
    try {
      const hits = await api.profiles.search(reportUser.trim(), 5);
      const match = hits.find(
        (p) => p.username.toLowerCase() === reportUser.trim().replace(/^@/, '').toLowerCase(),
      );
      if (!match) throw new Error('User not found.');
      await api.reports.create({
        reporterId: user.id,
        targetType: 'user',
        targetId: match.id,
        reason: reportReason || 'other',
      });
      Alert.alert('Reported', 'Thanks — we received your report.');
      setReportUser('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.wrap}>
      <Text style={[styles.title, { color: colors.ink }]}>Safety & privacy</Text>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      {settings ? (
        <View style={styles.section}>
          <Row
            label="Hide sensitive content"
            value={settings.hideSensitive}
            disabled={busy}
            onChange={(v) => void patch({ hideSensitive: v })}
            colors={colors}
          />
          <Row
            label="Login alerts"
            value={settings.loginAlerts}
            disabled={busy}
            onChange={(v) => void patch({ loginAlerts: v })}
            colors={colors}
          />
          <Row
            label="Reduce motion"
            value={settings.reduceMotion}
            disabled={busy}
            onChange={(v) => void patch({ reduceMotion: v })}
            colors={colors}
          />

          <Text style={[styles.label, { color: colors.muted }]}>Language</Text>
          <View style={styles.chips}>
            {LANGUAGE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.chip,
                  {
                    borderColor: colors.line,
                    backgroundColor:
                      settings.language === opt.value ? colors.brandSoft : colors.surface,
                  },
                ]}
                onPress={() => void patch({ language: opt.value as AppLanguageCode })}
              >
                <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 12 }}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.muted }]}>Theme</Text>
          <View style={styles.chips}>
            {(['system', 'light', 'dark'] as const).map((opt) => (
              <Pressable
                key={opt}
                style={[
                  styles.chip,
                  {
                    borderColor: colors.line,
                    backgroundColor:
                      settings.themePreference === opt ? colors.brandSoft : colors.surface,
                  },
                ]}
                onPress={() => void patch({ themePreference: opt })}
              >
                <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 12 }}>{opt}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <Text style={{ color: colors.muted }}>Loading…</Text>
      )}

      <Text style={[styles.sub, { color: colors.ink }]}>Report a user</Text>
      <TextInput
        value={reportUser}
        onChangeText={setReportUser}
        placeholder="@username"
        placeholderTextColor={colors.muted}
        style={[styles.input, { borderColor: colors.line, color: colors.ink, backgroundColor: colors.surface }]}
      />
      <TextInput
        value={reportReason}
        onChangeText={setReportReason}
        placeholder="Reason"
        placeholderTextColor={colors.muted}
        style={[styles.input, { borderColor: colors.line, color: colors.ink, backgroundColor: colors.surface }]}
      />
      <Pressable
        style={[styles.btn, { backgroundColor: colors.brand }]}
        disabled={busy}
        onPress={() => void onReport()}
      >
        <Text style={styles.btnText}>Submit report</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({
  label,
  value,
  onChange,
  disabled,
  colors,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  colors: ReturnType<typeof colorsFor>;
}) {
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.ink, flex: 1, fontWeight: '600' }}>{label}</Text>
      <Switch value={value} disabled={disabled} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 12 },
  title: { fontSize: 24, fontWeight: '800' },
  sub: { fontSize: 18, fontWeight: '800', marginTop: 12 },
  section: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  btn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800' },
});
