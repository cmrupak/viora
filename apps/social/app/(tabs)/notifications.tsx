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
import { colorsFor, getErrorMessage, type Notification } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';

function labelFor(n: Notification): string {
  const actor = n.actor?.displayName || n.actor?.username || 'Someone';
  switch (n.type) {
    case 'like':
      return `${actor} liked your post`;
    case 'comment':
      return `${actor} commented on your post`;
    case 'reply':
      return `${actor} replied to your comment`;
    case 'follow':
      return `${actor} followed you`;
    case 'mention':
      return `${actor} mentioned you`;
    case 'share':
      return `${actor} shared your post`;
    case 'message':
      return `${actor} sent you a message`;
    default:
      return n.body || 'Notification';
  }
}

export default function NotificationsScreen() {
  const { api, user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const [items, setItems] = useState<Notification[]>([]);
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
        const next = await api.notifications.list(user.id, { limit: 40 });
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

  async function openNotification(n: Notification) {
    if (!api || !user) return;
    if (!n.isRead) {
      try {
        await api.notifications.markRead(n.id, user.id);
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      } catch {
        /* non-blocking */
      }
    }

    if (n.conversationId) {
      router.push({ pathname: '/messages/[id]', params: { id: n.conversationId } });
      return;
    }
    if (n.postId) {
      router.push({ pathname: '/post/[id]', params: { id: n.postId } });
      return;
    }
    if (n.actor?.username) {
      router.push({ pathname: '/user/[username]', params: { username: n.actor.username } });
    }
  }

  async function markAll() {
    if (!api || !user) return;
    try {
      await api.notifications.markAllRead(user.id);
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      setError(getErrorMessage(err));
    }
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
      <View style={styles.top}>
        {error ? <Text style={{ color: colors.danger, flex: 1 }}>{error}</Text> : <View style={{ flex: 1 }} />}
        <Pressable onPress={() => void markAll()}>
          <Text style={{ color: colors.brand, fontWeight: '800' }}>Mark all read</Text>
        </Pressable>
      </View>
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
          <Text style={[styles.empty, { color: colors.muted }]}>No notifications yet.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => void openNotification(item)}
            style={[
              styles.row,
              {
                backgroundColor: item.isRead ? colors.surface : colors.brandSoft,
                borderColor: colors.line,
              },
            ]}
          >
            <Text style={[styles.title, { color: colors.ink }]}>{labelFor(item)}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {new Date(item.createdAt).toLocaleString()}
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
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12 },
  list: { padding: 16, gap: 10 },
  row: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6, marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 15 },
});
