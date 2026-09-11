import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getErrorMessage, type NotificationPrefs } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';

export default function NotificationPrefsScreen() {
  const { api, user } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!api || !user) return;
    try {
      setPrefs(await api.notifications.getPrefs(user.id));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [api, user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function toggle(key: keyof Omit<NotificationPrefs, 'userId' | 'updatedAt'>) {
    if (!api || !user || !prefs) return;
    const previous = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    try {
      setPrefs(await api.notifications.updatePrefs(user.id, { [key]: next[key] }));
    } catch (err) {
      setPrefs(previous);
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const rows: Array<{ key: keyof Omit<NotificationPrefs, 'userId' | 'updatedAt'>; label: string }> = [
    { key: 'likes', label: 'Likes' },
    { key: 'comments', label: 'Comments & replies' },
    { key: 'follows', label: 'New followers' },
    { key: 'messages', label: 'Messages' },
    { key: 'mentions', label: 'Mentions & tags' },
    { key: 'shares', label: 'Shares' },
    { key: 'birthdays', label: 'Birthdays' },
    { key: 'memories', label: 'On this day' },
    { key: 'pushEnabled', label: 'Push enabled' },
  ];

  if (!prefs) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg }}>
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <Text className="text-xs font-bold uppercase text-primary">Settings</Text>
      <Text className="text-2xl font-bold text-ink">Notifications</Text>
      {error ? <Text className="text-sm font-semibold text-danger">{error}</Text> : null}
      {rows.map((row) => (
        <Pressable
          key={row.key}
          onPress={() => void toggle(row.key)}
          className="flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3"
        >
          <Text className="text-sm font-semibold text-ink">{row.label}</Text>
          <Switch
            value={Boolean(prefs[row.key])}
            disabled={saving}
            onValueChange={() => void toggle(row.key)}
          />
        </Pressable>
      ))}
    </ScrollView>
  );
}
