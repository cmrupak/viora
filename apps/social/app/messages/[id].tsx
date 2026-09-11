import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  colorsFor,
  getErrorMessage,
  optimisticMutation,
  type Message,
} from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';

function mapRealtimeRow(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderId: String(row.sender_id),
    body: row.deleted_at ? '' : String(row.body ?? ''),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    status: 'ready',
    sender: null,
  };
}

export default function MessageThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user, profile } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!api || !id) return;
    setLoading(true);
    setError('');
    try {
      const next = await api.messages.listMessages(id, { limit: 60 });
      setMessages(next);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!api || !id) return;

    const channel = api.client
      .channel(`messages:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const incoming = mapRealtimeRow(row);
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            const withoutPending = prev.filter(
              (m) =>
                !(
                  m.status === 'pending' &&
                  m.senderId === incoming.senderId &&
                  m.body === incoming.body
                ),
            );
            return [...withoutPending, incoming];
          });
        },
      )
      .subscribe();

    return () => {
      void api.client.removeChannel(channel);
    };
  }, [api, id]);

  async function send() {
    if (!api || !user || !profile || !id) return;
    const body = draft.trim();
    if (!body) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversationId: id,
      senderId: user.id,
      body,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      status: 'pending',
      sender: profile,
    };
    setSending(true);
    setDraft('');
    setError('');

    try {
      await optimisticMutation({
        apply: () => setMessages((prev) => [...prev, optimistic]),
        mutation: async () => {
          const created = await api.messages.send(id, user.id, body);
          setMessages((prev) => {
            if (prev.some((m) => m.id === created.id)) {
              return prev.filter((m) => m.id !== tempId);
            }
            return prev.map((m) => (m.id === tempId ? { ...created, status: 'ready' } : m));
          });
        },
        rollback: () => {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setDraft(body);
        },
        onError: (err) => setError(getErrorMessage(err)),
      });
    } catch {
      /* rolled back */
    } finally {
      setSending(false);
    }
  }

  if (loading && messages.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.wrap, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const mine = item.senderId === user?.id;
          return (
            <View
              style={[
                styles.bubble,
                {
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  backgroundColor: mine ? colors.brand : colors.surface,
                  borderColor: colors.line,
                },
              ]}
            >
              {!mine ? (
                <Text style={[styles.sender, { color: colors.muted }]}>
                  {item.sender?.displayName || item.sender?.username || 'User'}
                </Text>
              ) : null}
              <Text style={{ color: mine ? '#fff' : colors.ink, fontSize: 15 }}>{item.body}</Text>
              {item.status === 'pending' ? (
                <Text style={{ color: mine ? '#e2e8f0' : colors.muted, fontSize: 11 }}>Sending…</Text>
              ) : null}
            </View>
          );
        }}
      />

      <View style={[styles.composer, { borderColor: colors.line, backgroundColor: colors.surface }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message…"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.ink }]}
          multiline
        />
        <Pressable
          style={[styles.send, { backgroundColor: colors.brand, opacity: sending ? 0.7 : 1 }]}
          disabled={sending}
          onPress={() => void send()}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 8, paddingBottom: 12 },
  bubble: {
    maxWidth: '78%',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 2,
  },
  sender: { fontSize: 11, fontWeight: '700' },
  composer: {
    borderTopWidth: 1,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: { flex: 1, minHeight: 40, maxHeight: 120, fontSize: 15, paddingHorizontal: 4 },
  send: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  sendText: { color: '#fff', fontWeight: '800' },
  error: { paddingHorizontal: 16, paddingTop: 8 },
});
