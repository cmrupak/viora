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
import {
  colorsFor,
  getErrorMessage,
  optimisticMutation,
  type PostPublishStatus,
  type PostVisibility,
} from '@viora/core';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { contentTypeForExtension, extensionFromUri, uriToArrayBuffer } from '@/lib/media';

const FEELINGS = ['Happy', 'Blessed', 'Excited', 'Grateful', 'Loved', 'Sad', 'Tired'];

export default function CreateScreen() {
  const { api, user, profile } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const [body, setBody] = useState('');
  const [mediaItems, setMediaItems] = useState<Array<{ uri: string; altText: string }>>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>(
    profile?.isPrivate ? 'followers' : 'public',
  );
  const [locationName, setLocationName] = useState('');
  const [feeling, setFeeling] = useState('');
  const [isSensitive, setIsSensitive] = useState(false);

  async function pickImages() {
    setError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (!result.canceled && result.assets.length > 0) {
      setMediaItems((prev) =>
        [
          ...prev,
          ...result.assets.map((a) => ({ uri: a.uri, altText: '' })),
        ].slice(0, 10),
      );
    }
  }

  async function uploadPostMedia(
    localUri: string,
    sortOrder: number,
    altText: string,
  ): Promise<{
    url: string;
    mediaType: 'image' | 'video';
    sortOrder: number;
    altText: string | null;
  }> {
    if (!api || !user) throw new Error('Not signed in.');
    const ext = extensionFromUri(localUri);
    const contentType = contentTypeForExtension(ext);
    const path = `${user.id}/${Date.now()}-${sortOrder}.${ext}`;
    const bytes = await uriToArrayBuffer(localUri);
    const { error: uploadError } = await api.client.storage.from('post-media').upload(path, bytes, {
      contentType,
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data } = api.client.storage.from('post-media').getPublicUrl(path);
    const mediaType = contentType.startsWith('video/') ? 'video' : 'image';
    return {
      url: data.publicUrl,
      mediaType,
      sortOrder,
      altText: altText.trim() || null,
    };
  }

  async function onPost(asDraft = false) {
    if (!api || !user || !profile) return;
    const text = body.trim();
    if (!text && mediaItems.length === 0) {
      setError('Write something or add media.');
      return;
    }

    setPosting(true);
    setError('');
    setStatus('');
    const nextStatus: PostPublishStatus = asDraft ? 'draft' : 'published';

    try {
      await optimisticMutation({
        apply: () => setStatus(asDraft ? 'Saving draft…' : 'Posting…'),
        mutation: async () => {
          const media =
            mediaItems.length > 0
              ? await Promise.all(
                  mediaItems.map((item, i) => uploadPostMedia(item.uri, i, item.altText)),
                )
              : undefined;
          const created = await api.posts.create({
            authorId: user.id,
            body: text,
            media,
            visibility,
            locationName: locationName.trim() || null,
            feeling: feeling || null,
            publishStatus: nextStatus,
            isSensitive,
          });
          setBody('');
          setMediaItems([]);
          setLocationName('');
          setFeeling('');
          setIsSensitive(false);
          setStatus(asDraft ? 'Draft saved.' : 'Posted.');
          if (!asDraft) {
            router.push({ pathname: '/post/[id]', params: { id: created.id } });
          }
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

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(
          [
            ['public', 'Public'],
            ['followers', 'Followers'],
            ['friends', 'Friends'],
            ['only_me', 'Only me'],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setVisibility(value)}
            style={[
              styles.chip,
              {
                borderColor: colors.line,
                backgroundColor: visibility === value ? colors.brandSoft : colors.surface,
              },
            ]}
          >
            <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 12 }}>{label}</Text>
          </Pressable>
        ))}
      </View>

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

      <TextInput
        value={locationName}
        onChangeText={setLocationName}
        placeholder="Add a place"
        placeholderTextColor={colors.muted}
        style={[
          styles.field,
          { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.line },
        ]}
      />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {FEELINGS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setFeeling((prev) => (prev === f ? '' : f))}
            style={[
              styles.chip,
              {
                borderColor: colors.line,
                backgroundColor: feeling === f ? colors.brandSoft : colors.surface,
              },
            ]}
          >
            <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 12 }}>{f}</Text>
          </Pressable>
        ))}
      </View>

      {mediaItems.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {mediaItems.map((item, index) => (
            <View key={item.uri} style={styles.previewWrap}>
              <Image source={{ uri: item.uri }} style={styles.preview} accessibilityLabel={item.altText || 'Selected media'} />
              <TextInput
                value={item.altText}
                onChangeText={(text) =>
                  setMediaItems((prev) =>
                    prev.map((m, i) => (i === index ? { ...m, altText: text } : m)),
                  )
                }
                placeholder="Alt text"
                placeholderTextColor={colors.muted}
                style={[
                  styles.field,
                  { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.line, width: 140 },
                ]}
              />
              <Pressable onPress={() => setMediaItems((prev) => prev.filter((_, i) => i !== index))}>
                <Text style={{ color: colors.danger, fontWeight: '700' }}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <Pressable
        onPress={() => setIsSensitive((v) => !v)}
        style={[
          styles.chip,
          {
            borderColor: colors.line,
            backgroundColor: isSensitive ? colors.brandSoft : colors.surface,
            alignSelf: 'flex-start',
          },
        ]}
      >
        <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 12 }}>
          {isSensitive ? 'Sensitive: on' : 'Mark sensitive'}
        </Text>
      </Pressable>

      <View style={styles.row}>
        <Pressable
          style={[styles.secondary, { borderColor: colors.line }]}
          onPress={() => void pickImages().catch((err) => Alert.alert('Media', getErrorMessage(err)))}
        >
          <Text style={[styles.secondaryText, { color: colors.ink }]}>Add media</Text>
        </Pressable>
        <Pressable
          style={[styles.primary, { backgroundColor: colors.brand, opacity: posting ? 0.7 : 1 }]}
          disabled={posting}
          onPress={() => void onPost(false)}
        >
          <Text style={styles.primaryText}>{posting ? 'Working…' : 'Post'}</Text>
        </Pressable>
      </View>

      <Pressable
        style={[styles.secondary, { borderColor: colors.line }]}
        disabled={posting}
        onPress={() => void onPost(true)}
      >
        <Text style={[styles.secondaryText, { color: colors.ink }]}>Save draft</Text>
      </Pressable>

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
  field: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  previewWrap: { gap: 8, width: 180 },
  preview: { width: 180, height: 180, borderRadius: 14 },
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
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
