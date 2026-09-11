import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { colorsFor, getErrorMessage, type Conversation } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';

export default function MessagesIndexScreen() {
  const { api, user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const [items, setItems] = useState<Conversation[]>([]);
  const [requests, setRequests] = useState<Conversation[]>([]);
  const [tab, setTab] = useState<'inbox' | 'requests'>('inbox');
  const [search, setSearch] = useState('');
  const [searchHits, setSearchHits] = useState<
    Array<{ conversationId: string; body: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (isRefresh = false) => {
      if (!api || !user) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        const [inbox, reqs] = await Promise.all([
          api.messages.listConversations(user.id),
          api.messages.listMessageRequests(user.id),
        ]);
        setItems(inbox);
        setRequests(reqs);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, user],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function titleFor(conversation: Conversation): string {
    if (conversation.nickname) return conversation.nickname;
    if (conversation.title) return conversation.title;
    const other = conversation.members?.find((m) => m.userId !== user?.id);
    return other?.profile?.displayName || other?.profile?.username || 'Conversation';
  }

  async function onSearch(text: string) {
    setSearch(text);
    if (!api || !user || text.trim().length < 2) {
      setSearchHits([]);
      return;
    }
    try {
      const hits = await api.messages.searchMessages(user.id, text.trim());
      setSearchHits(hits.map((h) => ({ conversationId: h.conversationId, body: h.message.body })));
    } catch {
      setSearchHits([]);
    }
  }

  const data = tab === 'inbox' ? items : requests;

  if (loading && items.length === 0 && requests.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      <View style={styles.tabs}>
        <Pressable
          onPress={() => setTab('inbox')}
          style={[
            styles.tab,
            {
              backgroundColor: tab === 'inbox' ? colors.brandSoft : colors.surface,
              borderColor: colors.line,
            },
          ]}
        >
          <Text style={{ color: colors.ink, fontWeight: '800' }}>Chats</Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('requests')}
          style={[
            styles.tab,
            {
              backgroundColor: tab === 'requests' ? colors.brandSoft : colors.surface,
              borderColor: colors.line,
            },
          ]}
        >
          <Text style={{ color: colors.ink, fontWeight: '800' }}>
            Requests{requests.length ? ` (${requests.length})` : ''}
          </Text>
        </Pressable>
      </View>

      <TextInput
        value={search}
        onChangeText={(t) => void onSearch(t)}
        placeholder="Search messages…"
        placeholderTextColor={colors.muted}
        style={[
          styles.search,
          { color: colors.ink, borderColor: colors.line, backgroundColor: colors.surface },
        ]}
      />

      {searchHits.length > 0 ? (
        <View style={{ paddingHorizontal: 16, gap: 6, marginBottom: 8 }}>
          {searchHits.map((hit, i) => (
            <Pressable
              key={`${hit.conversationId}-${i}`}
              onPress={() =>
                router.push({ pathname: '/messages/[id]', params: { id: hit.conversationId } })
              }
            >
              <Text style={{ color: colors.ink }} numberOfLines={1}>
                {hit.body}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.brand}
          />
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.muted }]}>
            {tab === 'requests' ? 'No message requests.' : 'No conversations yet.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/messages/[id]', params: { id: item.id } })}
            onLongPress={() => {
              if (!api || !user || tab !== 'inbox') return;
              void api.messages.setMemberPrefs(item.id, user.id, { pinned: !item.pinnedAt }).then(
                () => load(true),
                (err) => setError(getErrorMessage(err)),
              );
            }}
            style={[styles.row, { borderColor: colors.line, backgroundColor: colors.surface }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.ink }]}>
                {item.pinnedAt ? '📌 ' : ''}
                {titleFor(item)}
                {item.isGroup ? ' · group' : ''}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {item.lastMessageAt
                  ? new Date(item.lastMessageAt).toLocaleString()
                  : 'No messages yet'}
              </Text>
            </View>
            {tab === 'requests' ? (
              <View style={{ gap: 6 }}>
                <Pressable
                  onPress={() => {
                    if (!api || !user) return;
                    void api.messages.acceptRequest(item.id, user.id).then(
                      () => router.push({ pathname: '/messages/[id]', params: { id: item.id } }),
                      (err) => setError(getErrorMessage(err)),
                    );
                  }}
                >
                  <Text style={{ color: colors.brand, fontWeight: '800' }}>Accept</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!api || !user) return;
                    void api.messages.declineRequest(item.id, user.id).then(
                      () => setRequests((prev) => prev.filter((c) => c.id !== item.id)),
                      (err) => setError(getErrorMessage(err)),
                    );
                  }}
                >
                  <Text style={{ color: colors.danger, fontWeight: '800' }}>Decline</Text>
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  tab: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  search: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  list: { padding: 16, gap: 10, paddingBottom: 40 },
  row: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: { fontWeight: '800', fontSize: 15 },
  empty: { textAlign: 'center', marginTop: 40 },
  error: { paddingHorizontal: 16, fontWeight: '700' },
});
