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
import { useFocusEffect, useRouter } from 'expo-router';
import { UserPlus } from 'lucide-react-native';
import { getErrorMessage, type FollowRequest, type FriendRequest, type Profile } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';

export default function FriendsScreen() {
  const { api, user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];
  const [friends, setFriends] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>([]);
  const [suggestions, setSuggestions] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api || !user) return;
    setError('');
    try {
      const [nextFriends, nextRequests, nextFollowRequests, nextSuggestions] = await Promise.all([
        api.friends.listFriends(user.id),
        api.friends.listRequests(user.id, { direction: 'incoming' }),
        api.follows.listFollowRequests(user.id, { direction: 'incoming' }),
        api.follows.listSuggestions(user.id, 6),
      ]);
      setFriends(nextFriends);
      setRequests(nextRequests);
      setFollowRequests(nextFollowRequests);
      setSuggestions(nextSuggestions);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  async function onAccept(requestId: string) {
    if (!api || !user) return;
    setBusyId(requestId);
    setError('');
    try {
      await api.friends.acceptRequest(requestId, user.id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(requestId: string) {
    if (!api || !user) return;
    setBusyId(requestId);
    setError('');
    try {
      await api.friends.rejectRequest(requestId, user.id);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onAcceptFollow(requestId: string) {
    if (!api || !user) return;
    setBusyId(requestId);
    setError('');
    try {
      await api.follows.acceptFollowRequest(requestId, user.id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onRejectFollow(requestId: string) {
    if (!api || !user) return;
    setBusyId(requestId);
    setError('');
    try {
      await api.follows.rejectFollowRequest(requestId, user.id);
      setFollowRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function onUnfriend(friend: Profile) {
    if (!api || !user) return;
    Alert.alert(
      'Unfriend',
      `Unfriend ${friend.displayName}? You will still follow each other unless you unfollow.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfriend',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyId(friend.id);
              const previous = friends;
              setFriends((prev) => prev.filter((f) => f.id !== friend.id));
              try {
                await api.friends.removeFriend(user.id, friend.id);
              } catch (err) {
                setFriends(previous);
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

  function openProfile(username?: string | null) {
    if (!username) return;
    router.push({ pathname: '/user/[username]', params: { username } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <FlatList
        data={friends}
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
          <View style={{ gap: 12 }}>
            <View>
              <Text className="text-xs font-bold uppercase text-primary">Connections</Text>
              <Text className="mt-1 text-2xl font-bold text-ink">Friends</Text>
            </View>

            {error ? <Text className="text-sm font-semibold text-danger">{error}</Text> : null}

            {loading && friends.length === 0 && requests.length === 0 && followRequests.length === 0 ? (
              <ActivityIndicator color={palette.primary} style={{ marginVertical: 12 }} />
            ) : null}

            {followRequests.length > 0 ? (
              <View className="rounded-2xl border border-border bg-surface p-3">
                <View className="mb-2 flex-row items-center gap-2">
                  <UserPlus size={16} color={palette.primary} />
                  <Text className="text-sm font-semibold text-ink">Follow requests</Text>
                </View>
                {followRequests.map((req) => {
                  const from = req.fromUser;
                  const name = from?.displayName || from?.username || 'User';
                  return (
                    <View
                      key={req.id}
                      className="mb-2 flex-row flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface2 p-3"
                    >
                      <Pressable
                        onPress={() => openProfile(from?.username)}
                        className="min-w-0 flex-1 flex-row items-center gap-3"
                      >
                        {from?.avatarUrl ? (
                          <Image
                            source={{ uri: from.avatarUrl }}
                            style={{ width: 40, height: 40, borderRadius: 20 }}
                          />
                        ) : (
                          <View className="h-10 w-10 items-center justify-center rounded-full bg-primarySoft">
                            <Text className="font-bold text-primary">
                              {name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View>
                          <Text className="text-sm font-semibold text-ink">{name}</Text>
                          <Text className="text-xs text-muted">@{from?.username}</Text>
                        </View>
                      </Pressable>
                      <View className="flex-row gap-2">
                        <Pressable
                          disabled={busyId === req.id}
                          onPress={() => void onAcceptFollow(req.id)}
                          className="rounded-full bg-primary px-3 py-2"
                        >
                          <Text className="text-xs font-bold text-white">Accept</Text>
                        </Pressable>
                        <Pressable
                          disabled={busyId === req.id}
                          onPress={() => void onRejectFollow(req.id)}
                          className="rounded-full border border-border px-3 py-2"
                        >
                          <Text className="text-xs font-bold text-ink">Decline</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {requests.length > 0 ? (
              <View className="rounded-2xl border border-border bg-surface p-3">
                <View className="mb-2 flex-row items-center gap-2">
                  <UserPlus size={16} color={palette.primary} />
                  <Text className="text-sm font-semibold text-ink">Incoming requests</Text>
                </View>
                {requests.map((req) => {
                  const from = req.fromUser;
                  const name = from?.displayName || from?.username || 'User';
                  return (
                    <View
                      key={req.id}
                      className="mb-2 flex-row flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface2 p-3"
                    >
                      <Pressable
                        onPress={() => openProfile(from?.username)}
                        className="min-w-0 flex-1 flex-row items-center gap-3"
                      >
                        {from?.avatarUrl ? (
                          <Image
                            source={{ uri: from.avatarUrl }}
                            style={{ width: 40, height: 40, borderRadius: 20 }}
                          />
                        ) : (
                          <View className="h-10 w-10 items-center justify-center rounded-full bg-primarySoft">
                            <Text className="font-bold text-primary">
                              {name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View>
                          <Text className="text-sm font-semibold text-ink">{name}</Text>
                          <Text className="text-xs text-muted">@{from?.username}</Text>
                        </View>
                      </Pressable>
                      <View className="flex-row gap-2">
                        <Pressable
                          disabled={busyId === req.id}
                          onPress={() => void onAccept(req.id)}
                          className="rounded-full bg-primary px-3 py-2"
                        >
                          <Text className="text-xs font-bold text-white">Accept</Text>
                        </Pressable>
                        <Pressable
                          disabled={busyId === req.id}
                          onPress={() => void onReject(req.id)}
                          className="rounded-full border border-border px-3 py-2"
                        >
                          <Text className="text-xs font-bold text-ink">Reject</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {suggestions.length > 0 ? (
              <View className="rounded-2xl border border-border bg-surface p-3">
                <Text className="mb-2 text-sm font-semibold text-ink">People you may know</Text>
                {suggestions.map((person) => (
                  <View
                    key={person.id}
                    className="mb-2 flex-row items-center gap-3 rounded-xl border border-border bg-surface2 p-3"
                  >
                    <Pressable
                      onPress={() => openProfile(person.username)}
                      className="min-w-0 flex-1 flex-row items-center gap-3"
                    >
                      {person.avatarUrl ? (
                        <Image
                          source={{ uri: person.avatarUrl }}
                          style={{ width: 40, height: 40, borderRadius: 20 }}
                        />
                      ) : (
                        <View className="h-10 w-10 items-center justify-center rounded-full bg-primarySoft">
                          <Text className="font-bold text-primary">
                            {person.displayName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View>
                        <Text className="text-sm font-semibold text-ink">{person.displayName}</Text>
                        <Text className="text-xs text-muted">@{person.username}</Text>
                      </View>
                    </Pressable>
                    <Pressable
                      disabled={busyId === person.id}
                      onPress={() => {
                        void (async () => {
                          if (!api || !user) return;
                          setBusyId(person.id);
                          setSuggestions((prev) => prev.filter((p) => p.id !== person.id));
                          try {
                            await api.follows.toggleFollow(user.id, person.id);
                          } catch (err) {
                            setSuggestions((prev) => [person, ...prev]);
                            setError(getErrorMessage(err));
                          } finally {
                            setBusyId(null);
                          }
                        })();
                      }}
                      className="rounded-full border border-border px-3 py-2"
                    >
                      <Text className="text-xs font-bold text-ink">Follow</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            <Text className="text-lg font-bold text-ink">Your friends</Text>
            {!loading && friends.length === 0 ? (
              <View className="rounded-2xl border border-border bg-surface p-8">
                <Text className="text-center font-semibold text-ink">No friends yet</Text>
                <Text className="mt-1 text-center text-sm text-muted">
                  Accept requests or find people on Search.
                </Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-3">
            <Pressable
              onPress={() => openProfile(item.username)}
              className="min-w-0 flex-1 flex-row items-center gap-3"
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
            <Pressable
              disabled={busyId === item.id}
              onPress={() => onUnfriend(item)}
              className="rounded-full border border-border px-3 py-2"
            >
              <Text className="text-xs font-bold text-ink">Unfriend</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}
