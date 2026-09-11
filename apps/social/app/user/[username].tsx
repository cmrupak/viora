import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
} from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { PostCard } from '@/components/PostCard';
import { useColorScheme } from '@/components/useColorScheme';

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { api, user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [messaging, setMessaging] = useState(false);

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
      const [userPosts, isFollowing] = await Promise.all([
        api.posts.listByUser({ authorId: next.id, currentUserId: user?.id, limit: 30 }),
        user && user.id !== next.id
          ? api.follows.isFollowing(user.id, next.id)
          : Promise.resolve(false),
      ]);
      setPosts(userPosts);
      setFollowing(isFollowing);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, username, user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function toggleFollow() {
    if (!api || !user || !profile || isSelf) return;
    const previous = following;
    const previousProfile = profile;

    try {
      await optimisticMutation({
        apply: () => {
          setFollowing(!previous);
          setProfile({
            ...previousProfile,
            followerCount: previous
              ? Math.max(0, previousProfile.followerCount - 1)
              : previousProfile.followerCount + 1,
          });
        },
        mutation: async () => {
          await api.follows.toggleFollow(user.id, profile.id);
        },
        rollback: () => {
          setFollowing(previous);
          setProfile(previousProfile);
        },
        onError: (err) => setError(getErrorMessage(err)),
      });
    } catch {
      /* rolled back */
    }
  }

  async function openMessage() {
    if (!api || !user || !profile || isSelf) return;
    setMessaging(true);
    setError('');
    try {
      const conversation = await api.messages.getOrCreateDM(user.id, profile.id);
      router.push({ pathname: '/messages/[id]', params: { id: conversation.id } });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setMessaging(false);
    }
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
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {profile.followerCount} followers · {profile.followingCount} following
          </Text>

          {!isSelf ? (
            <View style={styles.actions}>
              <Pressable
                style={[
                  styles.btn,
                  {
                    backgroundColor: following ? colors.surface : colors.brand,
                    borderColor: colors.line,
                    borderWidth: following ? 1 : 0,
                  },
                ]}
                onPress={() => void toggleFollow()}
              >
                <Text style={{ color: following ? colors.ink : '#fff', fontWeight: '800' }}>
                  {following ? 'Following' : 'Follow'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.btn, { borderColor: colors.line, borderWidth: 1 }]}
                disabled={messaging}
                onPress={() => void openMessage()}
              >
                <Text style={{ color: colors.ink, fontWeight: '800' }}>
                  {messaging ? '…' : 'Message'}
                </Text>
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
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  list: { padding: 16, paddingBottom: 40 },
  empty: { textAlign: 'center', marginTop: 24 },
  error: { paddingHorizontal: 16, paddingTop: 12 },
});
