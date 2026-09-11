import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  getErrorMessage,
  type CloseFriend,
  type FeedFavorite,
  type UserMute,
  type UserRestrict,
  type UserSnooze,
} from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';

type Kind = 'mutes' | 'restricts' | 'snoozes' | 'close' | 'favorites';

type Row = {
  id: string;
  targetId: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  meta?: string;
};

export default function RelationshipListsScreen() {
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const kind: Kind =
    kindParam === 'restricts' ||
    kindParam === 'snoozes' ||
    kindParam === 'close' ||
    kindParam === 'favorites'
      ? kindParam
      : 'mutes';

  const { api, user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const title =
    kind === 'mutes'
      ? 'Muted'
      : kind === 'restricts'
        ? 'Restricted'
        : kind === 'snoozes'
          ? 'Snoozed'
          : kind === 'close'
            ? 'Close friends'
            : 'Favorites';

  const load = useCallback(async () => {
    if (!api || !user) return;
    setError('');
    try {
      let next: Row[] = [];
      if (kind === 'mutes') {
        const list: UserMute[] = await api.relationships.listMutes(user.id);
        next = list.map((e) => ({
          id: e.id,
          targetId: e.targetId,
          name: e.target?.displayName || 'User',
          username: e.target?.username,
          avatarUrl: e.target?.avatarUrl,
          meta: `Scope: ${e.scope}`,
        }));
      } else if (kind === 'restricts') {
        const list: UserRestrict[] = await api.relationships.listRestricts(user.id);
        next = list.map((e) => ({
          id: e.id,
          targetId: e.targetId,
          name: e.target?.displayName || 'User',
          username: e.target?.username,
          avatarUrl: e.target?.avatarUrl,
        }));
      } else if (kind === 'snoozes') {
        const list: UserSnooze[] = await api.relationships.listSnoozes(user.id);
        next = list.map((e) => ({
          id: e.id,
          targetId: e.targetId,
          name: e.target?.displayName || 'User',
          username: e.target?.username,
          avatarUrl: e.target?.avatarUrl,
          meta: `Until ${new Date(e.expiresAt).toLocaleDateString()}`,
        }));
      } else if (kind === 'close') {
        const list: CloseFriend[] = await api.relationships.listCloseFriends(user.id);
        next = list.map((e) => ({
          id: e.id,
          targetId: e.friendId,
          name: e.friend?.displayName || 'User',
          username: e.friend?.username,
          avatarUrl: e.friend?.avatarUrl,
        }));
      } else {
        const list: FeedFavorite[] = await api.relationships.listFavorites(user.id);
        next = list.map((e) => ({
          id: e.id,
          targetId: e.targetId,
          name: e.target?.displayName || 'User',
          username: e.target?.username,
          avatarUrl: e.target?.avatarUrl,
        }));
      }
      setRows(next);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, user, kind]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  async function onRemove(row: Row) {
    if (!api || !user) return;
    setBusyId(row.id);
    const previous = rows;
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    try {
      if (kind === 'mutes') await api.relationships.setMute(user.id, row.targetId, null);
      else if (kind === 'restricts') await api.relationships.toggleRestrict(user.id, row.targetId);
      else if (kind === 'snoozes') await api.relationships.unsnooze(user.id, row.targetId);
      else if (kind === 'close') await api.relationships.toggleCloseFriend(user.id, row.targetId);
      else await api.relationships.toggleFavorite(user.id, row.targetId);
    } catch (err) {
      setRows(previous);
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={palette.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 8, marginBottom: 8 }}>
            <Text className="text-xs font-bold uppercase text-primary">Relationships</Text>
            <Text className="text-2xl font-bold text-ink">{title}</Text>
            {error ? <Text className="text-sm font-semibold text-danger">{error}</Text> : null}
            {loading ? <ActivityIndicator color={palette.primary} /> : null}
            {!loading && rows.length === 0 ? (
              <Text className="text-sm text-muted">Nothing here yet.</Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-3">
            <Pressable
              className="min-w-0 flex-1 flex-row items-center gap-3"
              onPress={() => {
                if (!item.username) return;
                router.push({ pathname: '/user/[username]', params: { username: item.username } });
              }}
            >
              {item.avatarUrl ? (
                <Image
                  source={{ uri: item.avatarUrl }}
                  style={{ width: 40, height: 40, borderRadius: 20 }}
                />
              ) : (
                <View className="h-10 w-10 items-center justify-center rounded-full bg-primarySoft">
                  <Text className="font-bold text-primary">
                    {item.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View>
                <Text className="text-sm font-semibold text-ink">{item.name}</Text>
                {item.username ? (
                  <Text className="text-xs text-muted">@{item.username}</Text>
                ) : null}
                {item.meta ? <Text className="text-xs text-muted">{item.meta}</Text> : null}
              </View>
            </Pressable>
            <Pressable
              disabled={busyId === item.id}
              onPress={() => void onRemove(item)}
              className="rounded-full border border-border px-3 py-2"
            >
              <Text className="text-xs font-bold text-ink">Remove</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}
