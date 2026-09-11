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
import { CalendarDays } from 'lucide-react-native';
import { getErrorMessage, type Event } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';

function parseStartsAt(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export default function EventsScreen() {
  const { api, user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];
  const [events, setEvents] = useState<Event[]>([]);
  const [goingIds, setGoingIds] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!api || !user) return;
    setError('');
    try {
      const list = await api.events.list({ limit: 40 });
      setEvents(list);
      const memberships = await Promise.all(
        list.map(async (ev) => {
          try {
            const members = await api.events.listMembers(ev.id, { limit: 100 });
            const mine = members.find((m) => m.userId === user.id && m.status === 'going');
            return mine ? ev.id : null;
          } catch {
            return null;
          }
        }),
      );
      setGoingIds(new Set(memberships.filter((id): id is string => Boolean(id))));
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
    if (!api || !user || !title.trim()) return;
    const iso = parseStartsAt(startsAt);
    if (!iso) {
      setError('Enter a valid start time like 2026-09-15 18:00');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const created = await api.events.create({
        title: title.trim(),
        hostId: user.id,
        startsAt: iso,
        description: description.trim() || null,
        isOnline,
      });
      await api.events.join(created.id, user.id, 'going');
      setTitle('');
      setDescription('');
      setStartsAt('');
      setIsOnline(false);
      setEvents((prev) =>
        [...prev, created].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      );
      setGoingIds((prev) => new Set([...prev, created.id]));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function onToggle(ev: Event) {
    if (!api || !user) return;
    const going = goingIds.has(ev.id);
    setBusyId(ev.id);
    setError('');
    try {
      if (going) {
        await api.events.leave(ev.id, user.id);
        setGoingIds((prev) => {
          const next = new Set(prev);
          next.delete(ev.id);
          return next;
        });
      } else {
        await api.events.join(ev.id, user.id, 'going');
        setGoingIds((prev) => new Set([...prev, ev.id]));
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(ev: Event) {
    if (!api || !user || ev.hostId !== user.id) return;
    setBusyId(ev.id);
    setError('');
    try {
      await api.events.delete(ev.id, user.id);
      setEvents((prev) => prev.filter((x) => x.id !== ev.id));
      setGoingIds((prev) => {
        const next = new Set(prev);
        next.delete(ev.id);
        return next;
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <FlatList
        data={events}
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
              <Text className="text-xs font-bold uppercase text-primary">Happenings</Text>
              <Text className="mt-1 text-2xl font-bold text-ink">Events</Text>
            </View>

            {error ? <Text className="text-sm font-semibold text-danger">{error}</Text> : null}

            <View className="rounded-2xl border border-border bg-surface p-4" style={{ gap: 10 }}>
              <View className="flex-row items-center gap-2">
                <CalendarDays size={16} color={palette.primary} />
                <Text className="text-sm font-semibold text-ink">Create an event</Text>
              </View>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Event title"
                placeholderTextColor={palette.muted}
                maxLength={120}
                className="rounded-xl border border-border bg-surface px-3 py-3 text-sm text-ink"
              />
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Details"
                placeholderTextColor={palette.muted}
                maxLength={1000}
                multiline
                className="min-h-[72px] rounded-xl border border-border bg-surface px-3 py-3 text-sm text-ink"
                style={{ textAlignVertical: 'top' }}
              />
              <TextInput
                value={startsAt}
                onChangeText={setStartsAt}
                placeholder="Starts at (YYYY-MM-DD HH:mm)"
                placeholderTextColor={palette.muted}
                autoCapitalize="none"
                className="rounded-xl border border-border bg-surface px-3 py-3 text-sm text-ink"
              />
              <Pressable
                onPress={() => setIsOnline((v) => !v)}
                className={`self-start rounded-full px-3 py-1.5 ${isOnline ? 'bg-primary' : 'border border-border'}`}
              >
                <Text className={`text-xs font-bold ${isOnline ? 'text-white' : 'text-ink'}`}>
                  {isOnline ? 'Online event' : 'In-person'}
                </Text>
              </Pressable>
              <Pressable
                disabled={creating || !title.trim() || !startsAt.trim()}
                onPress={() => void onCreate()}
                className="items-center rounded-full bg-primary py-3"
                style={{
                  opacity: creating || !title.trim() || !startsAt.trim() ? 0.6 : 1,
                }}
              >
                <Text className="font-bold text-white">
                  {creating ? 'Creating…' : 'Create event'}
                </Text>
              </Pressable>
            </View>

            {loading && events.length === 0 ? (
              <ActivityIndicator color={palette.primary} />
            ) : null}

            {!loading && events.length === 0 ? (
              <View className="rounded-2xl border border-border bg-surface p-8">
                <Text className="text-center font-semibold text-ink">No events yet</Text>
                <Text className="mt-1 text-center text-sm text-muted">
                  Schedule something above.
                </Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const going = goingIds.has(item.id);
          return (
            <View className="flex-row items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
              <Pressable className="min-w-0 flex-1" onPress={() => router.push(`/event/${item.id}`)}>
                <Text className="text-sm font-semibold text-ink">{item.title}</Text>
                {item.description ? (
                  <Text className="mt-1 text-sm text-muted">{item.description}</Text>
                ) : null}
                <Text className="mt-1 text-xs text-muted">
                  {new Date(item.startsAt).toLocaleString()}
                  {item.isOnline ? ' · Online' : ''}
                  {item.host?.username ? ` · @${item.host.username}` : ''}
                </Text>
              </Pressable>
              <View style={{ gap: 8, alignItems: 'flex-end' }}>
                <Pressable
                  disabled={busyId === item.id}
                  onPress={() => void onToggle(item)}
                  className={`rounded-full px-3 py-2 ${going ? 'border border-border' : 'bg-primary'}`}
                  style={{ opacity: busyId === item.id ? 0.5 : 1 }}
                >
                  <Text className={`text-xs font-bold ${going ? 'text-ink' : 'text-white'}`}>
                    {going ? 'Leave' : 'Going'}
                  </Text>
                </Pressable>
                {user && item.hostId === user.id ? (
                  <Pressable
                    disabled={busyId === item.id}
                    onPress={() => void onDelete(item)}
                    className="rounded-full border border-danger px-3 py-2"
                    style={{ opacity: busyId === item.id ? 0.5 : 1 }}
                  >
                    <Text className="text-xs font-bold text-danger">Delete</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
