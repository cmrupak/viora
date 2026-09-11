import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';
import { getErrorMessage, type Profile } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';

export default function SearchScreen() {
  const { api } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [found, setFound] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!api || debounced.length < 2) {
      setFound([]);
      return;
    }
    let active = true;
    void (async () => {
      setSearching(true);
      setError('');
      try {
        const results = await api.profiles.search(debounced, 16);
        if (active) setFound(results);
      } catch {
        try {
          const one = await api.profiles.getByUsername(debounced);
          if (active) setFound(one ? [one] : []);
        } catch (err) {
          if (active) setError(getErrorMessage(err));
        }
      } finally {
        if (active) setSearching(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, debounced]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <FlatList
        data={found}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <View>
              <Text className="text-xs font-bold uppercase text-primary">Find</Text>
              <Text className="mt-1 text-2xl font-bold text-ink">Search</Text>
            </View>

            <View className="flex-row items-center gap-2 rounded-xl border border-border bg-surface px-3">
              <Search size={16} color={palette.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search people"
                placeholderTextColor={palette.muted}
                className="flex-1 py-3 text-sm text-ink"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {error ? <Text className="text-sm font-semibold text-danger">{error}</Text> : null}

            {debounced.length < 2 ? (
              <Text className="text-sm text-muted">Type at least 2 characters to search.</Text>
            ) : (
              <Text className="text-sm font-semibold text-ink">
                People {searching ? '…' : ''}
              </Text>
            )}

            {searching ? <ActivityIndicator color={palette.primary} /> : null}

            {!searching && debounced.length >= 2 && found.length === 0 ? (
              <Text className="text-sm text-muted">No users matched “{debounced}”.</Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({ pathname: '/user/[username]', params: { username: item.username } })
            }
            className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-3"
          >
            {item.avatarUrl ? (
              <Image
                source={{ uri: item.avatarUrl }}
                style={{ width: 40, height: 40, borderRadius: 20 }}
              />
            ) : (
              <View className="h-10 w-10 items-center justify-center rounded-full bg-primarySoft">
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
        )}
      />
    </View>
  );
}
