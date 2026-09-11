import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
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
        const next = await api.messages.listConversations(user.id);
        setItems(next);
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
    if (conversation.title) return conversation.title;
    const other = conversation.members?.find((m) => m.userId !== user?.id);
    return other?.profile?.displayName || other?.profile?.username || 'Conversation';
  }

  if (loading && items.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      <FlatList
        data={items}
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
            No conversations yet. Message someone from their profile.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.line }]}
            onPress={() => router.push({ pathname: '/messages/[id]', params: { id: item.id } })}
          >
            <Text style={[styles.title, { color: colors.ink }]}>{titleFor(item)}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {item.lastMessageAt
                ? new Date(item.lastMessageAt).toLocaleString()
                : 'No messages yet'}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16 },
  row: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 4,
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '800' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 15, lineHeight: 22 },
  error: { padding: 16, paddingBottom: 0 },
});
