import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Users } from 'lucide-react-native';
import { getErrorMessage, type Group, type GroupVisibility } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';

export default function GroupsScreen() {
  const { api, user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('public');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!api || !user) return;
    setError('');
    try {
      const list = await api.groups.list({ limit: 40, currentUserId: user.id });
      setGroups(list);
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

  async function onCreate() {
    if (!api || !user || !name.trim()) return;
    setCreating(true);
    setError('');
    try {
      const created = await api.groups.create({
        name: name.trim(),
        ownerId: user.id,
        description: description.trim() || null,
        visibility,
      });
      setName('');
      setDescription('');
      setVisibility('public');
      setGroups((prev) => [
        {
          ...created,
          myMembership: {
            id: 'local',
            groupId: created.id,
            userId: user.id,
            role: 'owner',
            status: 'active',
            createdAt: created.createdAt,
          },
        },
        ...prev,
      ]);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function onToggle(group: Group) {
    if (!api || !user) return;
    const joined =
      group.myMembership?.status === 'active' || group.myMembership?.status === 'pending';
    setBusyId(group.id);
    setError('');
    try {
      if (joined) {
        await api.groups.leave(group.id, user.id);
        setGroups((prev) =>
          prev.map((g) => (g.id === group.id ? { ...g, myMembership: null } : g)),
        );
      } else {
        const mem = await api.groups.requestJoin({ groupId: group.id, userId: user.id });
        setGroups((prev) =>
          prev.map((g) => (g.id === group.id ? { ...g, myMembership: mem } : g)),
        );
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
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
              <Text className="text-xs font-bold uppercase text-primary">Community</Text>
              <Text className="mt-1 text-2xl font-bold text-ink">Groups</Text>
            </View>

            {error ? <Text className="text-sm font-semibold text-danger">{error}</Text> : null}

            <View className="rounded-2xl border border-border bg-surface p-4" style={{ gap: 10 }}>
              <View className="flex-row items-center gap-2">
                <Users size={16} color={palette.primary} />
                <Text className="text-sm font-semibold text-ink">Create a group</Text>
              </View>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Group name"
                placeholderTextColor={palette.muted}
                maxLength={80}
                className="rounded-xl border border-border bg-surface px-3 py-3 text-sm text-ink"
              />
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What is this group about?"
                placeholderTextColor={palette.muted}
                maxLength={500}
                multiline
                className="min-h-[72px] rounded-xl border border-border bg-surface px-3 py-3 text-sm text-ink"
                style={{ textAlignVertical: 'top' }}
              />
              <View className="flex-row flex-wrap gap-2">
                {(['public', 'private', 'hidden'] as GroupVisibility[]).map((v) => (
                  <Pressable
                    key={v}
                    onPress={() => setVisibility(v)}
                    className={`rounded-full px-3 py-1.5 ${visibility === v ? 'bg-primary' : 'border border-border'}`}
                  >
                    <Text className={`text-xs font-bold capitalize ${visibility === v ? 'text-white' : 'text-ink'}`}>
                      {v}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                disabled={creating || !name.trim()}
                onPress={() => void onCreate()}
                className="items-center rounded-full bg-primary py-3"
                style={{ opacity: creating || !name.trim() ? 0.6 : 1 }}
              >
                <Text className="font-bold text-white">
                  {creating ? 'Creating…' : 'Create group'}
                </Text>
              </Pressable>
            </View>

            {loading && groups.length === 0 ? (
              <ActivityIndicator color={palette.primary} />
            ) : null}

            {!loading && groups.length === 0 ? (
              <View className="rounded-2xl border border-border bg-surface p-8">
                <Text className="text-center font-semibold text-ink">No groups yet</Text>
                <Text className="mt-1 text-center text-sm text-muted">
                  Create the first one above.
                </Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const joined = item.myMembership?.status === 'active';
          const pending = item.myMembership?.status === 'pending';
          const isOwner = item.ownerId === user?.id;
          return (
            <View className="flex-row items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
              <Pressable
                className="min-w-0 flex-1"
                onPress={() => router.push(`/group/${item.id}`)}
              >
                <Text className="text-sm font-semibold text-ink">{item.name}</Text>
                {item.description ? (
                  <Text className="mt-1 text-sm text-muted">{item.description}</Text>
                ) : null}
                <Text className="mt-1 text-xs capitalize text-muted">
                  {item.visibility ?? (item.isPrivate ? 'private' : 'public')}
                  {isOwner ? ' · You own this' : ` · @${item.owner?.username ?? 'user'}`}
                </Text>
              </Pressable>
              <Pressable
                disabled={busyId === item.id || (isOwner && joined)}
                onPress={() => void onToggle(item)}
                className={`rounded-full px-3 py-2 ${joined || pending ? 'border border-border' : 'bg-primary'}`}
                style={{ opacity: busyId === item.id || (isOwner && joined) ? 0.5 : 1 }}
              >
                <Text className={`text-xs font-bold ${joined || pending ? 'text-ink' : 'text-white'}`}>
                  {pending ? 'Pending' : joined ? 'Leave' : 'Join'}
                </Text>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}
