import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getErrorMessage, type Profile } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';

type Tab = 'followers' | 'following';

export default function ConnectionsScreen() {
  const { username, tab: tabParam } = useLocalSearchParams<{
    username: string;
    tab?: string;
  }>();
  const { api, user, profile: me } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];

  const [tab, setTab] = useState<Tab>(tabParam === 'following' ? 'following' : 'followers');
  const [owner, setOwner] = useState<Profile | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const isOwn = Boolean(me && owner && me.id === owner.id);

  const load = useCallback(async () => {
    if (!api || !username) return;
    setError('');
    try {
      const found = await api.profiles.getByUsername(String(username));
      setOwner(found);
      if (!found) {
        setPeople([]);
        return;
      }
      const list =
        tab === 'followers'
          ? await api.follows.listFollowers(found.id)
          : await api.follows.listFollowing(found.id);
      setPeople(list);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, username, tab]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  function onRemoveFollower(person: Profile) {
    if (!api || !user || !isOwn) return;
    Alert.alert(
      'Remove follower',
      `Remove @${person.username} as a follower? They can still follow you again later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyId(person.id);
              const previous = people;
              setPeople((prev) => prev.filter((p) => p.id !== person.id));
              try {
                await api.follows.removeFollower(user.id, person.id);
              } catch (err) {
                setPeople(previous);
                setError(getErrorMessage(err));
              } finally {
                setBusyId(null);
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <FlatList
        data={people}
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
          <View style={{ gap: 12, marginBottom: 4 }}>
            <View>
              <Text className="text-xs font-bold uppercase text-primary">Connections</Text>
              <Text className="mt-1 text-2xl font-bold text-ink">
                {owner ? `@${owner.username}` : '…'}
              </Text>
            </View>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => setTab('followers')}
                className={`rounded-full px-4 py-2 ${tab === 'followers' ? 'bg-primary' : 'border border-border'}`}
              >
                <Text
                  className={`text-xs font-bold ${tab === 'followers' ? 'text-white' : 'text-ink'}`}
                >
                  Followers
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setTab('following')}
                className={`rounded-full px-4 py-2 ${tab === 'following' ? 'bg-primary' : 'border border-border'}`}
              >
                <Text
                  className={`text-xs font-bold ${tab === 'following' ? 'text-white' : 'text-ink'}`}
                >
                  Following
                </Text>
              </Pressable>
            </View>
            {error ? <Text className="text-sm font-semibold text-danger">{error}</Text> : null}
            {loading ? <ActivityIndicator color={palette.primary} /> : null}
            {!loading && people.length === 0 ? (
              <Text className="text-center text-sm text-muted">
                {tab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-3">
            <Pressable
              className="min-w-0 flex-1 flex-row items-center gap-3"
              onPress={() =>
                router.push({ pathname: '/user/[username]', params: { username: item.username } })
              }
            >
              {item.avatarUrl ? (
                <Image
                  source={{ uri: item.avatarUrl }}
                  style={{ width: 44, height: 44, borderRadius: 22 }}
                />
              ) : (
                <View className="h-11 w-11 items-center justify-center rounded-full bg-primarySoft">
                  <Text className="font-bold text-primary">
                    {(item.displayName || item.username).charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View>
                <Text className="text-sm font-semibold text-ink">{item.displayName}</Text>
                <Text className="text-xs text-muted">@{item.username}</Text>
              </View>
            </Pressable>
            {isOwn && tab === 'followers' ? (
              <Pressable
                disabled={busyId === item.id}
                onPress={() => onRemoveFollower(item)}
                className="rounded-full border border-border px-3 py-2"
              >
                <Text className="text-xs font-bold text-ink">Remove</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
