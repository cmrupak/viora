import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  colorsFor,
  getErrorMessage,
  runAccountExport,
  runAccountHardDelete,
  type ActivityLogEntry,
  type DataExportRequest,
  type LoginEvent,
  type MfaFactorSummary,
} from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';

export default function AccountSecurityScreen() {
  const { api, user, logout } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const [factors, setFactors] = useState<MfaFactorSummary[]>([]);
  const [logins, setLogins] = useState<LoginEvent[]>([]);
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [exports, setExports] = useState<DataExportRequest[]>([]);
  const [enrollId, setEnrollId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [deletePhrase, setDeletePhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  async function refresh() {
    if (!api || !user) return;
    const [f, l, a, e] = await Promise.all([
      api.security.listMfaFactors().catch(() => [] as MfaFactorSummary[]),
      api.settings.listLoginEvents(user.id).catch(() => [] as LoginEvent[]),
      api.settings.listActivity(user.id).catch(() => [] as ActivityLogEntry[]),
      api.settings.listDataExports(user.id).catch(() => [] as DataExportRequest[]),
    ]);
    setFactors(f);
    setLogins(l);
    setActivity(a);
    setExports(e);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, user]);

  async function startMfa() {
    if (!api) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.security.enrollTotp();
      setEnrollId(result.id);
      setSecret(result.totp?.secret ?? null);
      setStatus('Scan the secret in your authenticator app, then enter the code.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmMfa() {
    if (!api || !enrollId || !code.trim()) return;
    setBusy(true);
    try {
      await api.security.challengeAndVerify(enrollId, code.trim());
      setEnrollId(null);
      setSecret(null);
      setCode('');
      setStatus('Two-factor authentication enabled.');
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    if (!api || !user) return;
    setBusy(true);
    setError('');
    try {
      const request = await api.settings.requestDataExport(user.id);
      const token = await api.auth.getAccessToken();
      if (!token) throw new Error('Session expired.');
      const result = await runAccountExport(token, request.id);
      setStatus(result.message);
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onHardDelete() {
    if (!api || !user) return;
    Alert.alert('Delete account?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            setBusy(true);
            setError('');
            try {
              const request = await api.settings.requestHardDelete(user.id);
              const token = await api.auth.getAccessToken();
              if (!token) throw new Error('Session expired.');
              await runAccountHardDelete(token, request.id, deletePhrase.trim() || 'DELETE');
              await logout();
            } catch (err) {
              setError(getErrorMessage(err));
            } finally {
              setBusy(false);
            }
          })(),
      },
    ]);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.wrap}>
      <Text style={[styles.title, { color: colors.ink }]}>Account security</Text>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      {status ? <Text style={{ color: colors.success }}>{status}</Text> : null}

      <Text style={[styles.section, { color: colors.ink }]}>Two-factor auth</Text>
      {factors.map((f) => (
        <Text key={f.id} style={{ color: colors.muted }}>
          {f.friendlyName || f.factorType} · {f.status}
        </Text>
      ))}
      {!enrollId ? (
        <Pressable
          style={[styles.btn, { borderColor: colors.line }]}
          disabled={busy}
          onPress={() => void startMfa()}
        >
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Set up authenticator</Text>
        </Pressable>
      ) : (
        <View style={{ gap: 8 }}>
          {secret ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>Secret: {secret}</Text>
          ) : null}
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="6-digit code"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            style={[styles.input, { borderColor: colors.line, color: colors.ink }]}
          />
          <Pressable
            style={[styles.btn, { backgroundColor: colors.brand }]}
            disabled={busy}
            onPress={() => void confirmMfa()}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>Verify</Text>
          </Pressable>
        </View>
      )}

      <Text style={[styles.section, { color: colors.ink }]}>Recent sign-ins</Text>
      {logins.length === 0 ? (
        <Text style={{ color: colors.muted }}>None yet.</Text>
      ) : (
        logins.slice(0, 8).map((item) => (
          <Text key={item.id} style={{ color: colors.muted, fontSize: 13 }}>
            {item.deviceLabel || 'Device'} · {new Date(item.createdAt).toLocaleString()}
          </Text>
        ))
      )}

      <Text style={[styles.section, { color: colors.ink }]}>Activity</Text>
      {activity.length === 0 ? (
        <Text style={{ color: colors.muted }}>None yet.</Text>
      ) : (
        activity.slice(0, 10).map((item) => (
          <Text key={item.id} style={{ color: colors.muted, fontSize: 13 }}>
            {item.action} · {new Date(item.createdAt).toLocaleString()}
          </Text>
        ))
      )}

      <Text style={[styles.section, { color: colors.ink }]}>Data export</Text>
      <Pressable
        style={[styles.btn, { borderColor: colors.line }]}
        disabled={busy}
        onPress={() => void onExport()}
      >
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Request export</Text>
      </Pressable>
      {exports.map((item) => (
        <Text key={item.id} style={{ color: colors.muted, fontSize: 13 }}>
          {item.status} · {new Date(item.createdAt).toLocaleString()}
        </Text>
      ))}

      <Text style={[styles.section, { color: colors.ink }]}>Hard delete</Text>
      <TextInput
        value={deletePhrase}
        onChangeText={setDeletePhrase}
        placeholder="Type DELETE"
        placeholderTextColor={colors.muted}
        style={[styles.input, { borderColor: colors.line, color: colors.ink }]}
      />
      <Pressable
        style={[styles.btn, { borderColor: colors.danger }]}
        disabled={busy || deletePhrase.trim() !== 'DELETE'}
        onPress={() => void onHardDelete()}
      >
        <Text style={{ color: colors.danger, fontWeight: '800' }}>Delete permanently</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 10 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  section: { fontSize: 16, fontWeight: '800', marginTop: 14 },
  btn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
});
