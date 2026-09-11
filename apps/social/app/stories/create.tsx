import { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ImagePlus, X } from 'lucide-react-native';
import { getErrorMessage } from '@viora/core';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';
import { contentTypeForExtension, extensionFromUri, uriToArrayBuffer } from '@/lib/media';

export default function StoriesCreateScreen() {
  const { api, user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function pickImage() {
    setError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function onSubmit() {
    if (!api || !user || !imageUri) return;
    setSubmitting(true);
    setError('');
    try {
      const ext = extensionFromUri(imageUri);
      const bytes = await uriToArrayBuffer(imageUri);
      const url = await api.stories.uploadMedia({
        userId: user.id,
        body: bytes,
        contentType: contentTypeForExtension(ext),
        extension: ext,
      });
      await api.stories.createStory({
        authorId: user.id,
        media: [{ url, mediaType: 'image' }],
      });
      router.replace('/(tabs)/feed');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <View>
        <Text className="text-xs font-bold uppercase text-primary">Stories</Text>
        <Text className="mt-1 text-2xl font-bold text-ink">Add your story</Text>
      </View>

      {error ? <Text className="text-sm font-semibold text-danger">{error}</Text> : null}

      {!imageUri ? (
        <Pressable
          onPress={() =>
            void pickImage().catch((err) => Alert.alert('Photos', getErrorMessage(err)))
          }
          className="items-center justify-center rounded-2xl border border-dashed border-border bg-surface px-4 py-14"
        >
          <ImagePlus size={32} color={palette.primary} />
          <Text className="mt-3 text-sm font-semibold text-ink">Choose photo</Text>
          <Text className="mt-1 text-xs text-muted">Visible for 24 hours</Text>
        </Pressable>
      ) : (
        <View className="overflow-hidden rounded-2xl border border-border bg-ink">
          <Image
            source={{ uri: imageUri }}
            style={{ width: '100%', height: 420 }}
            resizeMode="contain"
          />
          <Pressable
            onPress={() => setImageUri(null)}
            className="absolute top-3 right-3 rounded-full bg-black/70 p-2"
          >
            <X size={16} color="#fff" />
          </Pressable>
        </View>
      )}

      <View className="flex-row gap-2">
        <Pressable
          onPress={() => router.back()}
          className="flex-1 items-center rounded-full border border-border py-3"
        >
          <Text className="font-bold text-ink">Cancel</Text>
        </Pressable>
        <Pressable
          disabled={!imageUri || submitting}
          onPress={() => void onSubmit()}
          className="flex-1 items-center rounded-full bg-primary py-3"
          style={{ opacity: !imageUri || submitting ? 0.6 : 1 }}
        >
          <Text className="font-bold text-white">
            {submitting ? 'Sharing…' : 'Share story'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
