import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getErrorMessage, type Group, type GroupMember, type Post } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { PostCard } from '@/components/PostCard';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];
  const [group, setGroup] = useState<Group | null>(null);
  const [pending, setPending] = useState<GroupMember[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!api || !user || !id) return;
    setError('');
    try {
      const g = await api.groups.getById(id, user.id);
      setGroup(g);
      const [feed, pens] = await Promise.all([
        api.groups.listGroupPosts(id, { currentUserId: user.id, limit: 20 }),
        api.groups.listMembers(id, { status: 'pending', limit: 50 }).catch(() => []),
      ]);
      setPosts(feed);
      setPending(pens);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, user, id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const isAdmin =
    Boolean(user && group && (group.ownerId === user.id || group.myMembership?.role === 'admin'));
  const isMember =
    Boolean(user && group && (group.ownerId === user.id || group.myMembership?.status === 'active'));

  async function onPost() {
    if (!api || !user || !id || !body.trim()) return;
    try {
      const created = await api.groups.createGroupPost({
        groupId: id,
        authorId: user.id,
        body: body.trim(),
      });
      setBody('');
      if (!group?.requiresPostApproval) {
        setPosts((prev) => [created, ...prev]);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg }}>
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }

  if (!group) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: palette.bg }}>
        <Text className="text-sm font-semibold text-danger">{error || 'Group not found'}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
    >
      <Text className="text-xs font-bold uppercase capitalize text-primary">
        {group.visibility ?? 'public'}
      </Text>
      <Text className="text-2xl font-bold text-ink">{group.name}</Text>
      {group.description ? <Text className="text-sm text-muted">{group.description}</Text> : null}
      {error ? <Text className="text-sm font-semibold text-danger">{error}</Text> : null}

      {isMember ? (
        <View className="gap-2 rounded-2xl border border-border bg-surface p-3">
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Share with the group…"
            placeholderTextColor={palette.muted}
            multiline
            className="min-h-[72px] text-sm text-ink"
          />
          <Pressable
            onPress={() => void onPost()}
            className="items-center rounded-full bg-primary py-3"
            style={{ opacity: !body.trim() ? 0.6 : 1 }}
          >
            <Text className="font-bold text-white">
              {group.requiresPostApproval ? 'Submit for approval' : 'Post'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {isAdmin && pending.length > 0 ? (
        <View className="gap-2 rounded-2xl border border-border bg-surface p-3">
          <Text className="text-sm font-semibold text-ink">Join requests</Text>
          {pending.map((m) => (
            <View key={m.id} className="flex-row items-center justify-between">
              <Text className="text-sm text-ink">@{m.profile?.username || 'user'}</Text>
              <Pressable
                onPress={() =>
                  void api!.groups.approveMember(id!, m.userId).then(() => {
                    setPending((prev) => prev.filter((x) => x.userId !== m.userId));
                  })
                }
                className="rounded-full bg-primary px-3 py-1.5"
              >
                <Text className="text-xs font-bold text-white">Approve</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          onUpdated={(next) => setPosts((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
          onDeleted={(pid) => setPosts((prev) => prev.filter((p) => p.id !== pid))}
          showError={(msg) => setError(msg)}
        />
      ))}
    </ScrollView>
  );
}
