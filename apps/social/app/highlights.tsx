import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getErrorMessage, type StoryHighlight } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';

export default function HighlightsScreen() {
  const { api, user } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];
  const [highlights, setHighlights] = useState<StoryHighlight[]>([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!api || !user) return;
    setError('');
    try {
      const list = await api.stories.listHighlights(user.id);
      setHighlights(list);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
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
    try {
      const created = await api.stories.createHighlight({
        ownerId: user.id,
        title: title.trim(),
      });
      setHighlights((prev) => [created, ...prev]);
      setTitle('');
    } catch (err) {
      Alert.alert('Highlights', getErrorMessage(err));
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
    >
      <Text className="text-xs font-bold uppercase text-primary">Stories</Text>
      <Text className="text-2xl font-bold text-ink">Highlights</Text>
      {error ? <Text className="text-sm font-semibold text-danger">{error}</Text> : null}

      <View className="flex-row gap-2">
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="New highlight title"
          placeholderTextColor={palette.muted}
          className="flex-1 rounded-2xl border border-border bg-surface px-4 py-3 text-ink"
        />
        <Pressable onPress={() => void onCreate()} className="justify-center rounded-full bg-primary px-4">
          <Text className="font-bold text-white">Create</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color={palette.primary} /> : null}

      <View className="flex-row flex-wrap gap-3">
        {highlights.map((h) => (
          <View
            key={h.id}
            className="w-[30%] items-center rounded-2xl border border-border bg-surface p-2"
          >
            <View className="mb-2 h-16 w-16 overflow-hidden rounded-full bg-surface-2">
              {h.coverUrl ? (
                <Image source={{ uri: h.coverUrl }} style={{ width: 64, height: 64 }} />
              ) : (
                <View className="h-full w-full items-center justify-center">
                  <Text className="font-bold text-muted">{h.title.charAt(0)}</Text>
                </View>
              )}
            </View>
            <Text className="text-center text-xs font-semibold text-ink" numberOfLines={1}>
              {h.title}
            </Text>
            <Text className="text-[10px] text-muted">{h.itemCount ?? 0} items</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
