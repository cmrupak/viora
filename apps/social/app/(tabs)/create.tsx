import { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colorsFor, getErrorMessage, optimisticMutation } from '@viora/core';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { contentTypeForExtension, extensionFromUri, uriToArrayBuffer } from '@/lib/media';

export default function CreateScreen() {
  const { api, user, profile } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const [body, setBody] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

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

  async function uploadPostImage(localUri: string): Promise<string> {
    if (!api || !user) throw new Error('Not signed in.');
    const ext = extensionFromUri(localUri);
    const contentType = contentTypeForExtension(ext);
    const path = `${user.id}/${Date.now()}.${ext}`;
    const bytes = await uriToArrayBuffer(localUri);
    const { error: uploadError } = await api.client.storage.from('post-media').upload(path, bytes, {
      contentType,
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data } = api.client.storage.from('post-media').getPublicUrl(path);
    return data.publicUrl;
  }

  async function onPost() {
    if (!api || !user || !profile) return;
    const text = body.trim();
    if (!text && !imageUri) {
      setError('Write something or add a photo.');
      return;
    }

    setPosting(true);
    setError('');
    setStatus('');

    try {
      await optimisticMutation({
        apply: () => setStatus('Posting…'),
        mutation: async () => {
          let media:
            | Array<{ url: string; mediaType: 'image' | 'video'; sortOrder: number }>
            | undefined;
          if (imageUri) {
            const url = await uploadPostImage(imageUri);
            media = [{ url, mediaType: 'image', sortOrder: 0 }];
          }
          const created = await api.posts.create({
            authorId: user.id,
            body: text,
            media,
          });
          setBody('');
          setImageUri(null);
          setStatus('Posted.');
          router.push({ pathname: '/post/[id]', params: { id: created.id } });
        },
        rollback: () => setStatus(''),
        onError: (err) => setError(getErrorMessage(err)),
      });
    } catch {
      /* shown via onError */
    } finally {
      setPosting(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: colors.ink }]}>New post</Text>
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="What's happening?"
        placeholderTextColor={colors.muted}
        multiline
        style={[
          styles.input,
          { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.line },
        ]}
      />

      {imageUri ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri: imageUri }} style={styles.preview} />
          <Pressable onPress={() => setImageUri(null)}>
            <Text style={{ color: colors.danger, fontWeight: '700' }}>Remove photo</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.row}>
        <Pressable
          style={[styles.secondary, { borderColor: colors.line }]}
          onPress={() => void pickImage().catch((err) => Alert.alert('Photos', getErrorMessage(err)))}
        >
          <Text style={[styles.secondaryText, { color: colors.ink }]}>Add photo</Text>
        </Pressable>
        <Pressable
          style={[styles.primary, { backgroundColor: colors.brand, opacity: posting ? 0.7 : 1 }]}
          disabled={posting}
          onPress={() => void onPost()}
        >
          <Text style={styles.primaryText}>{posting ? 'Posting…' : 'Post'}</Text>
        </Pressable>
      </View>

      {error ? <Text style={[styles.msg, { color: colors.danger }]}>{error}</Text> : null}
      {status ? <Text style={[styles.msg, { color: colors.success }]}>{status}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14 },
  title: { fontSize: 24, fontWeight: '800' },
  input: {
    minHeight: 140,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  previewWrap: { gap: 8 },
  preview: { width: '100%', height: 220, borderRadius: 14 },
  row: { flexDirection: 'row', gap: 10 },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: { fontWeight: '800' },
  primary: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '800' },
  msg: { fontSize: 14 },
});
