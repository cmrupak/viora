import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  colorsFor,
  getErrorMessage,
  optimisticMutation,
  type Post,
  type Profile,
  type RelationshipStatus,
} from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { PostCard } from '@/components/PostCard';
import { useColorScheme } from '@/components/useColorScheme';

const emptyRelation = (): RelationshipStatus => ({
  following: false,
  followedBy: false,
  friends: false,
  outgoingFriendRequest: false,
  incomingFriendRequest: false,
  incomingFriendRequestId: null,
  outgoingFriendRequestId: null,
  blocked: false,
  blockedBy: false,
  mutualFriendsCount: 0,
  muteScope: null,
  restricted: false,
  snoozed: false,
  snoozeExpiresAt: null,
  closeFriend: false,
  favorited: false,
  outgoingFollowRequest: false,
  incomingFollowRequest: false,
  incomingFollowRequestId: null,
  outgoingFollowRequestId: null,
});

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { api, user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [relation, setRelation] = useState<RelationshipStatus>(emptyRelation());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isSelf = Boolean(user && profile && user.id === profile.id);

  const load = useCallback(async () => {
    if (!api || !username) return;
    setLoading(true);
    setError('');
    try {
      const next = await api.profiles.getByUsername(String(username));
      setProfile(next);
      if (!next) {
        setError('User not found.');
        setPosts([]);
        return;
      }
      if (user && user.id === next.id) {
        router.replace('/(tabs)/profile');
        return;
      }
      const [userPosts, status] = await Promise.all([
        api.posts.listByUser({ authorId: next.id, currentUserId: user?.id, limit: 30 }),
        user ? api.friends.getRelationshipStatus(user.id, next.id) : Promise.resolve(emptyRelation()),
      ]);
      if (status.blockedBy) {
        setProfile(null);
        setPosts([]);
        setError('This profile is unavailable.');
        return;
      }
      setPosts(userPosts);
      setRelation(status);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, username, user, router]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function refreshRelation(otherId: string) {
    if (!api || !user) return;
    setRelation(await api.friends.getRelationshipStatus(user.id, otherId));
  }

  async function toggleFollow() {
    if (!api || !user || !profile || isSelf || relation.blocked) return;
    const previousFollowing = relation.following;
    const previousPending = relation.outgoingFollowRequest;
    const previousProfile = profile;

    try {
      await optimisticMutation({
        apply: () => {
          if (previousFollowing || previousPending) {
            setRelation((r) => ({
              ...r,
              following: false,
              outgoingFollowRequest: false,
              outgoingFollowRequestId: null,
            }));
            if (previousFollowing) {
              setProfile({
                ...previousProfile,
                followerCount: Math.max(0, previousProfile.followerCount - 1),
              });
            }
          } else if (profile.isPrivate) {
            setRelation((r) => ({ ...r, outgoingFollowRequest: true }));
          } else {
            setRelation((r) => ({ ...r, following: true }));
            setProfile({
              ...previousProfile,
              followerCount: previousProfile.followerCount + 1,
            });
          }
        },
        mutation: async () => {
          await api.follows.toggleFollow(user.id, profile.id);
          await refreshRelation(profile.id);
          const refreshed = await api.profiles.getById(profile.id);
          if (refreshed) setProfile(refreshed);
        },
        rollback: () => {
          setRelation((r) => ({
            ...r,
            following: previousFollowing,
            outgoingFollowRequest: previousPending,
          }));
          setProfile(previousProfile);
        },
        onError: (err) => setError(getErrorMessage(err)),
      });
    } catch {
      /* rolled back */
    }
  }

  async function onAcceptFollowRequest() {
    if (!api || !user || !profile || !relation.incomingFollowRequestId) return;
    setBusy(true);
    setError('');
    try {
      await api.follows.acceptFollowRequest(relation.incomingFollowRequestId, user.id);
      await refreshRelation(profile.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRejectFollowRequest() {
    if (!api || !user || !profile || !relation.incomingFollowRequestId) return;
    setBusy(true);
    setError('');
    try {
      await api.follows.rejectFollowRequest(relation.incomingFollowRequestId, user.id);
      await refreshRelation(profile.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onFriendAction() {
    if (!api || !user || !profile || isSelf || relation.blocked) return;
    setBusy(true);
    setError('');
    try {
      if (relation.friends) {
        await new Promise<void>((resolve, reject) => {
          Alert.alert(
            'Unfriend',
            `Unfriend ${profile.displayName}? You will still follow each other unless you unfollow.`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => reject(new Error('cancelled')) },
              {
                text: 'Unfriend',
                style: 'destructive',
                onPress: () => resolve(),
              },
            ],
          );
        });
        await api.friends.removeFriend(user.id, profile.id);
      } else if (relation.incomingFriendRequest && relation.incomingFriendRequestId) {
        await api.friends.acceptRequest(relation.incomingFriendRequestId, user.id);
      } else if (relation.outgoingFriendRequest && relation.outgoingFriendRequestId) {
        await new Promise<void>((resolve, reject) => {
          Alert.alert('Cancel request', 'Cancel this friend request?', [
            { text: 'Keep', style: 'cancel', onPress: () => reject(new Error('cancelled')) },
            { text: 'Cancel request', style: 'destructive', onPress: () => resolve() },
          ]);
        });
        await api.friends.cancelRequest(relation.outgoingFriendRequestId, user.id);
      } else {
        await api.friends.sendRequest(user.id, profile.id);
      }
      await refreshRelation(profile.id);
      const refreshed = await api.profiles.getById(profile.id);
      if (refreshed) setProfile(refreshed);
    } catch (err) {
      if (getErrorMessage(err) !== 'cancelled') setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onBlock() {
    if (!api || !user || !profile || isSelf) return;
    Alert.alert(
      'Block user',
      `Block @${profile.username}? This removes follows and friendship, and hides their content.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await api.blocks.toggleBlock(user.id, profile.id);
                router.replace('/(tabs)/feed');
              } catch (err) {
                setError(getErrorMessage(err));
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }

  async function onMuteCycle() {
    if (!api || !user || !profile) return;
    setBusy(true);
    try {
      const next =
        relation.muteScope == null
          ? 'all'
          : relation.muteScope === 'all'
            ? 'posts'
            : relation.muteScope === 'posts'
              ? 'stories'
              : null;
      await api.relationships.setMute(user.id, profile.id, next);
      await refreshRelation(profile.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function onRestrict() {
    if (!api || !user || !profile) return;
    const run = () => {
      void (async () => {
        setBusy(true);
        try {
          await api.relationships.toggleRestrict(user.id, profile.id);
          await refreshRelation(profile.id);
        } catch (err) {
          setError(getErrorMessage(err));
        } finally {
          setBusy(false);
        }
      })();
    };
    if (!relation.restricted) {
      Alert.alert(
        'Restrict',
        `Restrict @${profile.username}? Their comments and notifications will be limited.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Restrict', onPress: run },
        ],
      );
    } else {
      run();
    }
  }

  function onSnooze() {
    if (!api || !user || !profile) return;
    if (relation.snoozed) {
      void (async () => {
        setBusy(true);
        try {
          await api.relationships.unsnooze(user.id, profile.id);
          await refreshRelation(profile.id);
          const userPosts = await api.posts.listByUser({
            authorId: profile.id,
            currentUserId: user.id,
          });
          setPosts(userPosts);
        } catch (err) {
          setError(getErrorMessage(err));
        } finally {
          setBusy(false);
        }
      })();
      return;
    }
    Alert.alert('Snooze 30 days', `Hide posts and stories from @${profile.username} for 30 days?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Snooze',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await api.relationships.snooze(user.id, profile.id, 30);
              await refreshRelation(profile.id);
              setPosts([]);
            } catch (err) {
              setError(getErrorMessage(err));
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  }

  async function onCloseFriend() {
    if (!api || !user || !profile) return;
    setBusy(true);
    try {
      await api.relationships.toggleCloseFriend(user.id, profile.id);
      await refreshRelation(profile.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onFavorite() {
    if (!api || !user || !profile) return;
    setBusy(true);
    try {
      await api.relationships.toggleFavorite(user.id, profile.id);
      await refreshRelation(profile.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function openMessage() {
    if (!api || !user || !profile || isSelf || relation.blocked) return;
    setBusy(true);
    setError('');
    try {
      const conversation = await api.messages.getOrCreateDM(user.id, profile.id);
      router.push({ pathname: '/messages/[id]', params: { id: conversation.id } });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function friendLabel() {
    if (relation.friends) return 'Friends';
    if (relation.incomingFriendRequest) return 'Accept';
    if (relation.outgoingFriendRequest) return 'Requested';
    return 'Add friend';
  }

  function muteLabel() {
    if (relation.muteScope === 'all') return 'Muted';
    if (relation.muteScope === 'posts') return 'Mute posts';
    if (relation.muteScope === 'stories') return 'Mute stories';
    return 'Mute';
  }

  if (loading && !profile) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      {profile ? (
        <View style={[styles.header, { borderColor: colors.line, backgroundColor: colors.surface }]}>
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
              <Text style={{ color: colors.brand, fontWeight: '800', fontSize: 28 }}>
                {(profile.displayName || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[styles.name, { color: colors.ink }]}>{profile.displayName}</Text>
          <Text style={{ color: colors.muted }}>@{profile.username}</Text>
          {profile.bio ? <Text style={[styles.bio, { color: colors.ink }]}>{profile.bio}</Text> : null}
          <View style={styles.statsRow}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/connections/[username]',
                  params: { username: profile.username, tab: 'followers' },
                })
              }
            >
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                <Text style={{ color: colors.ink, fontWeight: '700' }}>{profile.followerCount}</Text>{' '}
                followers
              </Text>
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/connections/[username]',
                  params: { username: profile.username, tab: 'following' },
                })
              }
            >
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                <Text style={{ color: colors.ink, fontWeight: '700' }}>{profile.followingCount}</Text>{' '}
                following
              </Text>
            </Pressable>
          </View>
          {relation.mutualFriendsCount > 0 ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {relation.mutualFriendsCount} mutual friend
              {relation.mutualFriendsCount === 1 ? '' : 's'}
            </Text>
          ) : null}

          {!isSelf ? (
            <View style={styles.actions}>
              {relation.incomingFollowRequest ? (
                <>
                  <Pressable
                    style={[styles.btn, { backgroundColor: colors.brand }]}
                    disabled={busy}
                    onPress={() => void onAcceptFollowRequest()}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800' }}>Accept follow</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, { borderColor: colors.line, borderWidth: 1 }]}
                    disabled={busy}
                    onPress={() => void onRejectFollowRequest()}
                  >
                    <Text style={{ color: colors.ink, fontWeight: '800' }}>Decline</Text>
                  </Pressable>
                </>
              ) : null}
              <Pressable
                style={[
                  styles.btn,
                  {
                    backgroundColor:
                      relation.following || relation.outgoingFollowRequest
                        ? colors.surface
                        : colors.brand,
                    borderColor: colors.line,
                    borderWidth: relation.following || relation.outgoingFollowRequest ? 1 : 0,
                  },
                ]}
                disabled={busy}
                onPress={() => void toggleFollow()}
              >
                <Text
                  style={{
                    color:
                      relation.following || relation.outgoingFollowRequest ? colors.ink : '#fff',
                    fontWeight: '800',
                  }}
                >
                  {relation.following
                    ? 'Following'
                    : relation.outgoingFollowRequest
                      ? 'Requested'
                      : profile.isPrivate
                        ? 'Request'
                        : 'Follow'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.btn, { borderColor: colors.line, borderWidth: 1 }]}
                disabled={busy}
                onPress={() => void onFriendAction()}
              >
                <Text style={{ color: colors.ink, fontWeight: '800' }}>{friendLabel()}</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, { borderColor: colors.line, borderWidth: 1 }]}
                disabled={busy}
                onPress={() => void openMessage()}
              >
                <Text style={{ color: colors.ink, fontWeight: '800' }}>Message</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, { borderColor: colors.line, borderWidth: 1 }]}
                disabled={busy}
                onPress={() => void onMuteCycle()}
              >
                <Text style={{ color: colors.ink, fontWeight: '800' }}>{muteLabel()}</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, { borderColor: colors.line, borderWidth: 1 }]}
                disabled={busy}
                onPress={onRestrict}
              >
                <Text style={{ color: colors.ink, fontWeight: '800' }}>
                  {relation.restricted ? 'Restricted' : 'Restrict'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.btn, { borderColor: colors.line, borderWidth: 1 }]}
                disabled={busy}
                onPress={onSnooze}
              >
                <Text style={{ color: colors.ink, fontWeight: '800' }}>
                  {relation.snoozed ? 'Unsnooze' : 'Snooze'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.btn, { borderColor: colors.line, borderWidth: 1 }]}
                disabled={busy}
                onPress={() => void onCloseFriend()}
              >
                <Text style={{ color: colors.ink, fontWeight: '800' }}>
                  {relation.closeFriend ? 'Close friend' : 'Close friend +'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.btn, { borderColor: colors.line, borderWidth: 1 }]}
                disabled={busy}
                onPress={() => void onFavorite()}
              >
                <Text style={{ color: colors.ink, fontWeight: '800' }}>
                  {relation.favorited ? 'Favorited' : 'Favorite'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.btn, { borderColor: colors.danger, borderWidth: 1 }]}
                disabled={busy}
                onPress={onBlock}
              >
                <Text style={{ color: colors.danger, fontWeight: '800' }}>Block</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, { borderColor: colors.line, borderWidth: 1 }]}
                disabled={busy}
                onPress={() => {
                  Alert.alert('Report user', 'Submit a report for this profile?', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Report',
                      style: 'destructive',
                      onPress: () => {
                        if (!api || !user || !profile) return;
                        void api.reports
                          .create({
                            reporterId: user.id,
                            targetType: 'user',
                            targetId: profile.id,
                            reason: 'other',
                          })
                          .then(() => Alert.alert('Reported', 'Thanks — we received your report.'))
                          .catch((err) => setError(getErrorMessage(err)));
                      },
                    },
                  ]);
                }}
              >
                <Text style={{ color: colors.ink, fontWeight: '800' }}>Report</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.muted }]}>No posts yet.</Text>
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onUpdated={(updated) =>
              setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
            }
            onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
            showError={setError}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    margin: 16,
    marginBottom: 0,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 6,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  name: { fontSize: 22, fontWeight: '800' },
  bio: { fontSize: 15, lineHeight: 21, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  btn: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  list: { padding: 16, paddingBottom: 40 },
  empty: { textAlign: 'center', marginTop: 24 },
  error: { paddingHorizontal: 16, paddingTop: 12 },
});
