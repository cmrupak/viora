import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Film } from 'lucide-react-native';
import { getErrorMessage } from '@viora/core';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';
import { contentTypeForExtension, extensionFromUri, uriToArrayBuffer } from '@/lib/media';

export default function ReelsCreateScreen() {
  const { api, user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [audioTitle, setAudioTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function pickVideo() {
    setError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Media library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setVideoUri(result.assets[0].uri);
    }
  }

  async function onSubmit() {
    if (!api || !user || !videoUri) return;
    setSubmitting(true);
    setError('');
    try {
      const ext = extensionFromUri(videoUri) || 'mp4';
      const bytes = await uriToArrayBuffer(videoUri);
      const url = await api.reels.uploadMedia({
        userId: user.id,
        body: bytes,
        contentType: contentTypeForExtension(ext) || 'video/mp4',
        extension: ext,
      });
      await api.reels.create({
        authorId: user.id,
        caption,
        audioTitle: audioTitle.trim() || null,
        media: [{ url, mediaType: 'video' }],
      });
      router.replace('/reels');
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
      <Text className="text-xs font-bold uppercase text-primary">Reels</Text>
      <Text className="text-2xl font-bold text-ink">Create a reel</Text>
      {error ? <Text className="text-sm font-semibold text-danger">{error}</Text> : null}

      <Pressable
        onPress={() =>
          void pickVideo().catch((err) => Alert.alert('Video', getErrorMessage(err)))
        }
        className="items-center justify-center rounded-2xl border border-dashed border-border bg-surface px-4 py-14"
      >
        <Film size={32} color={palette.primary} />
        <Text className="mt-3 text-sm font-semibold text-ink">
          {videoUri ? 'Video selected — tap to change' : 'Choose a video'}
        </Text>
      </Pressable>

      <TextInput
        value={caption}
        onChangeText={setCaption}
        placeholder="Caption"
        placeholderTextColor={palette.muted}
        className="rounded-2xl border border-border bg-surface px-4 py-3 text-ink"
      />
      <TextInput
        value={audioTitle}
        onChangeText={setAudioTitle}
        placeholder="Audio title (optional)"
        placeholderTextColor={palette.muted}
        className="rounded-2xl border border-border bg-surface px-4 py-3 text-ink"
      />

      <Pressable
        disabled={!videoUri || submitting}
        onPress={() => void onSubmit()}
        className="items-center rounded-full bg-primary py-3"
        style={{ opacity: !videoUri || submitting ? 0.6 : 1 }}
      >
        <Text className="font-bold text-white">
          {submitting ? 'Publishing…' : 'Publish reel'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
