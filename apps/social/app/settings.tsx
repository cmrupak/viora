import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colorsFor, getErrorMessage } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';

export default function SettingsScreen() {
  const { api, user, setProfile, logout } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function confirmDeactivate() {
    Alert.alert(
      'Deactivate account',
      'Your profile will be marked inactive. You can contact support later to reactivate.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: () => void deactivate(),
        },
      ],
    );
  }

  async function deactivate() {
    if (!api || !user) return;
    setBusy(true);
    setError('');
    try {
      const next = await api.settings.deactivateAccount(user.id);
      setProfile(next);
      await logout();
      router.replace('/login');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: colors.ink }]}>Settings</Text>
      <Text style={[styles.lede, { color: colors.muted }]}>
        Manage your account and session.
      </Text>

      <Pressable
        style={[styles.btn, { borderColor: colors.line }]}
        onPress={() => router.push({ pathname: '/messages/index' })}
      >
        <Text style={[styles.btnText, { color: colors.ink }]}>Messages</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, { borderColor: colors.line }]}
        onPress={() => router.push('/friends')}
      >
        <Text style={[styles.btnText, { color: colors.ink }]}>Friends</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, { borderColor: colors.line }]}
        onPress={() => router.push('/groups')}
      >
        <Text style={[styles.btnText, { color: colors.ink }]}>Groups</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, { borderColor: colors.line }]}
        onPress={() => router.push('/events')}
      >
        <Text style={[styles.btnText, { color: colors.ink }]}>Events</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, { borderColor: colors.line }]}
        onPress={() => router.push('/reels')}
      >
        <Text style={[styles.btnText, { color: colors.ink }]}>Reels</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, { borderColor: colors.line }]}
        onPress={() => router.push('/saved')}
      >
        <Text style={[styles.btnText, { color: colors.ink }]}>Saved</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, { borderColor: colors.line }]}
        onPress={() => router.push('/search')}
      >
        <Text style={[styles.btnText, { color: colors.ink }]}>Search</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, { borderColor: colors.line }]}
        onPress={() => router.push('/stories/create')}
      >
        <Text style={[styles.btnText, { color: colors.ink }]}>Create story</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, { borderColor: colors.line }]}
        disabled={busy}
        onPress={() => void onLogout()}
      >
        <Text style={[styles.btnText, { color: colors.ink }]}>Log out</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, { borderColor: colors.danger }]}
        disabled={busy}
        onPress={confirmDeactivate}
      >
        <Text style={[styles.btnText, { color: colors.danger }]}>
          {busy ? 'Working…' : 'Deactivate account'}
        </Text>
      </Pressable>

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '800' },
  lede: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  btn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { fontWeight: '800' },
});
