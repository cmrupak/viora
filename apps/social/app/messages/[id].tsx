import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  colorsFor,
  getErrorMessage,
  optimisticMutation,
  type Message,
  type MessageReactionType,
} from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { contentTypeForExtension, extensionFromUri, uriToArrayBuffer } from '@/lib/media';

function mapRealtimeRow(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    conversationId: String(row.conversationId ?? row.conversation_id),
    senderId: String(row.senderId ?? row.sender_id),
    body: row.deletedAt || row.deleted_at ? '' : String(row.body ?? ''),
    replyToId:
      row.replyToId == null && row.reply_to_id == null
        ? null
        : String(row.replyToId ?? row.reply_to_id),
    expiresAt:
      row.expiresAt == null && row.expires_at == null
        ? null
        : String(row.expiresAt ?? row.expires_at),
    deletedAt:
      row.deletedAt == null && row.deleted_at == null
        ? null
        : String(row.deletedAt ?? row.deleted_at),
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
    updatedAt:
      row.updatedAt == null && row.updated_at == null
        ? undefined
        : String(row.updatedAt ?? row.updated_at),
    status: 'ready',
    sender: null,
    attachments: [],
  };
}

export default function MessageThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user, profile } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [typing, setTyping] = useState(false);

  const load = useCallback(async () => {
    if (!api || !id || !user) return;
    setLoading(true);
    setError('');
    try {
      const next = await api.messages.listMessages(id, {
        limit: 60,
        currentUserId: user.id,
      });
      setMessages(next);
      await api.messages.markRead(id, user.id);
      await api.messages.heartbeat(user.id, true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, id, user]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        if (api && user) void api.messages.heartbeat(user.id, false);
      };
    }, [load, api, user]),
  );

  useEffect(() => {
    if (!api || !id || !user) return;

    const unsubMessages = api.realtime.subscribeMessages(id, ({ message: row }) => {
      const incoming = mapRealtimeRow(row);
      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev;
        return [...prev.filter((m) => m.status !== 'pending' || m.body !== incoming.body), incoming];
      });
      const senderId = String(row.senderId ?? row.sender_id ?? '');
      if (senderId && senderId !== user.id) {
        void api.messages.markRead(id, user.id);
      }
    });

    const unsubTyping = api.realtime.subscribeTyping(id, ({ userId: from }) => {
      if (from && from !== user.id) {
        setTyping(true);
        setTimeout(() => setTyping(false), 2000);
      }
    });

    return () => {
      unsubMessages();
      unsubTyping();
    };
  }, [api, id, user]);

  async function uploadUri(localUri: string) {
    if (!api || !user) throw new Error('Not signed in');
    const ext = extensionFromUri(localUri);
    const contentType = contentTypeForExtension(ext);
    const mediaType = (contentType.startsWith('audio/')
      ? 'audio'
      : contentType.startsWith('video/')
        ? 'video'
        : 'image') as 'image' | 'video' | 'audio';
    const bytes = await uriToArrayBuffer(localUri);
    if (api.media) {
      const uploaded = await api.media.upload({
        bucket: 'messages',
        file: bytes,
        filename: `${user.id}-${Date.now()}.${ext}`,
        contentType,
      });
      return { url: uploaded.url, mediaType, fileName: null };
    }
    if (!api.client) throw new Error('Message attachments are not configured.');
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await api.client.storage.from('messages').upload(path, bytes, {
      contentType,
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data } = api.client.storage.from('messages').getPublicUrl(path);
    return { url: data.publicUrl, mediaType, fileName: null };
  }

  async function send(attachments?: Array<{ url: string; mediaType: 'image' | 'video' | 'audio' | 'file'; fileName?: string | null }>) {
    if (!api || !user || !profile || !id) return;
    const body = draft.trim();
    if (!body && !(attachments && attachments.length)) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversationId: id,
      senderId: user.id,
      body,
      replyToId: replyTo?.id ?? null,
      replyTo: replyTo,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      status: 'pending',
      sender: profile,
      attachments: attachments?.map((a, i) => ({
        id: `${tempId}-${i}`,
        messageId: tempId,
        url: a.url,
        mediaType: a.mediaType,
        fileName: a.fileName ?? null,
        createdAt: new Date().toISOString(),
      })),
    };
    const previous = messages;
    const parent = replyTo;
    setDraft('');
    setReplyTo(null);
    setSending(true);
    setError('');

    try {
      await optimisticMutation({
        apply: () => setMessages((prev) => [...prev, optimistic]),
        mutation: async () => {
          const created = await api.messages.sendMessage({
            conversationId: id,
            senderId: user.id,
            body,
            replyToId: parent?.id,
            attachments,
          });
          setMessages((prev) => {
            if (prev.some((m) => m.id === created.id)) {
              return prev.filter((m) => m.id !== tempId);
            }
            return prev.map((m) => (m.id === tempId ? { ...created, status: 'ready' } : m));
          });
        },
        rollback: () => {
          setMessages(previous);
          setDraft(body);
        },
        onError: (err) => setError(getErrorMessage(err)),
      });
    } finally {
      setSending(false);
    }
  }

  async function pickAndSendMedia() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Media permission required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    try {
      const uploaded = await uploadUri(result.assets[0].uri);
      await send([uploaded]);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function react(message: Message, reaction: MessageReactionType) {
    if (!api || !user) return;
    const next = message.myReaction === reaction ? null : reaction;
    setMessages((prev) =>
      prev.map((m) => (m.id === message.id ? { ...m, myReaction: next } : m)),
    );
    try {
      await api.messages.setReaction(message.id, user.id, next);
    } catch (err) {
      setError(getErrorMessage(err));
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
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      {typing ? (
        <Text style={{ color: colors.brand, paddingHorizontal: 16, fontWeight: '700' }}>Typing…</Text>
      ) : null}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const mine = item.senderId === user?.id;
          return (
            <Pressable
              onLongPress={() => setReplyTo(item)}
              style={[
                styles.bubble,
                {
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  backgroundColor: mine ? colors.brand : colors.surface,
                  borderColor: colors.line,
                },
              ]}
            >
              {item.replyTo ? (
                <Text style={{ color: mine ? '#ffffffcc' : colors.muted, fontSize: 11, marginBottom: 4 }}>
                  Re: {item.replyTo.body || 'attachment'}
                </Text>
              ) : null}
              {item.body ? (
                <Text style={{ color: mine ? '#fff' : colors.ink }}>{item.body}</Text>
              ) : null}
              {(item.attachments ?? []).map((a) =>
                a.mediaType === 'image' ? (
                  <Image key={a.id} source={{ uri: a.url }} style={styles.media} />
                ) : (
                  <Text key={a.id} style={{ color: mine ? '#fff' : colors.ink, fontSize: 12 }}>
                    {a.fileName || a.mediaType}
                  </Text>
                ),
              )}
              <View style={styles.reactRow}>
                {(['like', 'love', 'haha'] as MessageReactionType[]).map((r) => (
                  <Pressable key={r} onPress={() => void react(item, r)}>
                    <Text style={{ opacity: item.myReaction === r ? 1 : 0.5 }}>
                      {r === 'like' ? '👍' : r === 'love' ? '❤️' : '😆'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Pressable>
          );
        }}
      />

      {replyTo ? (
        <View style={[styles.replyBar, { borderColor: colors.line, backgroundColor: colors.surface }]}>
          <Text style={{ color: colors.muted, flex: 1 }} numberOfLines={1}>
            Replying: {replyTo.body || 'attachment'}
          </Text>
          <Pressable onPress={() => setReplyTo(null)}>
            <Text style={{ color: colors.brand, fontWeight: '800' }}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.composer, { borderColor: colors.line, backgroundColor: colors.surface }]}>
        <Pressable onPress={() => void pickAndSendMedia()}>
          <Text style={{ color: colors.brand, fontWeight: '800' }}>Media</Text>
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            if (!api || !user || !id) return;
            void api.realtime.publishTyping(id, user.id, true);          }}
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
          <Text style={styles.sendText}>{sending ? '…' : 'Send'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 8, paddingBottom: 24 },
  bubble: {
    maxWidth: '80%',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  media: { width: 180, height: 140, borderRadius: 10, marginTop: 6 },
  reactRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  replyBar: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  composer: {
    borderTopWidth: 1,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: { flex: 1, minHeight: 40, maxHeight: 120, fontSize: 15 },
  send: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  sendText: { color: '#fff', fontWeight: '800' },
  error: { padding: 12, fontWeight: '700' },
});
