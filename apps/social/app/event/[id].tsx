import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getErrorMessage, type Event, type EventMember } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];
  const [event, setEvent] = useState<Event | null>(null);
  const [members, setMembers] = useState<EventMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!api || !id) return;
    setError('');
    try {
      const [ev, mems] = await Promise.all([
        api.events.getById(id),
        api.events.listMembers(id, { limit: 100 }),
      ]);
      setEvent(ev);
      setMembers(mems);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  async function setRsvp(status: 'going' | 'interested' | 'declined') {
    if (!api || !user || !id) return;
    try {
      if (status === 'declined') {
        await api.events.leave(id, user.id);
        setMembers((prev) => prev.filter((m) => m.userId !== user.id));
      } else {
        const mem = await api.events.join(id, user.id, status);
        setMembers((prev) => [...prev.filter((m) => m.userId !== user.id), mem]);
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

  if (!event) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: palette.bg }}>
        <Text className="text-sm font-semibold text-danger">{error || 'Event not found'}</Text>
      </View>
    );
  }

  const mine = user ? members.find((m) => m.userId === user.id) : null;
  const going = members.filter((m) => m.status === 'going');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
    >
      <Text className="text-xs font-bold uppercase text-primary">
        {event.isOnline ? 'Online event' : 'Event'}
      </Text>
      <Text className="text-2xl font-bold text-ink">{event.title}</Text>
      {event.description ? <Text className="text-sm text-muted">{event.description}</Text> : null}
      <Text className="text-sm text-ink">{new Date(event.startsAt).toLocaleString()}</Text>
      {event.location ? <Text className="text-sm text-muted">{event.location}</Text> : null}
      {event.meetingUrl ? <Text className="text-sm text-primary">{event.meetingUrl}</Text> : null}
      {event.recurrenceRule ? (
        <Text className="text-xs text-muted">Repeats: {event.recurrenceRule}</Text>
      ) : null}
      {error ? <Text className="text-sm font-semibold text-danger">{error}</Text> : null}

      <View className="flex-row flex-wrap gap-2">
        <Pressable
          onPress={() => void setRsvp('going')}
          className={`rounded-full px-4 py-2 ${mine?.status === 'going' ? 'bg-primary' : 'border border-border'}`}
        >
          <Text className={`text-xs font-bold ${mine?.status === 'going' ? 'text-white' : 'text-ink'}`}>
            Going ({going.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void setRsvp('interested')}
          className={`rounded-full px-4 py-2 ${mine?.status === 'interested' ? 'bg-primary' : 'border border-border'}`}
        >
          <Text
            className={`text-xs font-bold ${mine?.status === 'interested' ? 'text-white' : 'text-ink'}`}
          >
            Interested
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
