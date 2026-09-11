import { useEffect, useState } from 'react';
import {
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
  type Profile,
} from '@viora/core';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { contentTypeForExtension, extensionFromUri, uriToArrayBuffer } from '@/lib/media';

const NAV_LINKS = [
  { label: 'Friends', href: '/friends' },
  { label: 'Groups', href: '/groups' },
  { label: 'Events', href: '/events' },
  { label: 'Reels', href: '/reels' },
  { label: 'Saved', href: '/saved' },
  { label: 'Search', href: '/search' },
  { label: 'Create story', href: '/stories/create' },
  { label: 'Messages', href: '/messages/index' },
  { label: 'Settings', href: '/settings' },
] as const;

export default function ProfileScreen() {
  const { api, user, profile, setProfile, logout } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [website, setWebsite] = useState(profile?.website ?? '');
  const [location, setLocation] = useState(profile?.location ?? '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(profile?.avatarUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    setDisplayName(profile?.displayName ?? '');
    setUsername(profile?.username ?? '');
    setBio(profile?.bio ?? '');
    setWebsite(profile?.website ?? '');
    setLocation(profile?.location ?? '');
    setPreviewUrl(profile?.avatarUrl ?? null);
  }, [profile]);

  if (!user || !profile || !api) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.muted }}>Loading profile…</Text>
      </View>
    );
  }

  async function onSave() {
    const current = profile;
    const client = api;
    const sessionUser = user;
    if (!current || !client || !sessionUser) return;

    setError('');
    setStatus('');
    setSaving(true);
    const optimistic: Profile = {
      ...current,
      displayName: displayName.trim(),
      username: username.trim().toLowerCase(),
      bio: bio.trim() || null,
      website: website.trim() || null,
      location: location.trim() || null,
    };

    try {
      await optimisticMutation({
        apply: () => setProfile(optimistic),
        mutation: async () => {
          const saved = await client.profiles.updateProfile(sessionUser.id, {
            displayName,
            username,
            bio,
            website,
            location,
          });
          setProfile(saved);
        },
        rollback: () => setProfile(current),
        onError: (err) => setError(getErrorMessage(err)),
        onSuccess: () => setStatus('Profile saved.'),
      });
    } finally {
      setSaving(false);
    }
  }

  async function onPickAvatar() {
    const current = profile;
    const client = api;
    const sessionUser = user;
    if (!current || !client || !sessionUser) return;

    setError('');
    setStatus('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library permission is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]?.uri) return;

    const localUri = result.assets[0].uri;
    setUploading(true);
    setPreviewUrl(localUri);
    setProfile({ ...current, avatarUrl: localUri });

    try {
      const ext = extensionFromUri(localUri);
      const bytes = await uriToArrayBuffer(localUri);
      const avatarUrl = await client.profiles.uploadAvatar({
        userId: sessionUser.id,
        body: bytes,
        contentType: contentTypeForExtension(ext),
        extension: ext,
      });
      setPreviewUrl(avatarUrl);
      setProfile({ ...current, avatarUrl });
      setStatus('Photo updated.');
    } catch (err) {
      setPreviewUrl(current.avatarUrl);
      setProfile(current);
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: colors.ink }]}>Your profile</Text>
      <Text style={[styles.email, { color: colors.muted }]}>{user.email}</Text>

      <View style={styles.avatarRow}>
        {previewUrl ? (
          <Image source={{ uri: previewUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
            <Text style={{ color: colors.brand, fontWeight: '800', fontSize: 28 }}>
              {(profile.displayName || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <Pressable
          style={[styles.ghost, { borderColor: colors.line }]}
          disabled={uploading}
          onPress={() => void onPickAvatar()}
        >
          <Text style={[styles.ghostText, { color: colors.ink }]}>
            {uploading ? 'Uploading…' : 'Change photo'}
          </Text>
        </Pressable>
      </View>

      <Field
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
        colors={colors}
      />
      <Field
        label="Username"
        value={username}
        onChangeText={setUsername}
        colors={colors}
        autoCapitalize="none"
      />
      <Field
        label="Bio"
        value={bio}
        onChangeText={setBio}
        colors={colors}
        multiline
      />
      <Field
        label="Website"
        value={website}
        onChangeText={setWebsite}
        colors={colors}
        autoCapitalize="none"
      />
      <Field
        label="Location"
        value={location}
        onChangeText={setLocation}
        colors={colors}
      />

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      {status ? <Text style={{ color: colors.success }}>{status}</Text> : null}

      <Pressable
        style={[styles.primary, { backgroundColor: colors.brand, opacity: saving ? 0.7 : 1 }]}
        disabled={saving}
        onPress={() => void onSave()}
      >
        <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save profile'}</Text>
      </Pressable>

      {NAV_LINKS.map((link) => (
        <Pressable
          key={link.href}
          style={[styles.ghost, { borderColor: colors.line }]}
          onPress={() => router.push(link.href as never)}
        >
          <Text style={[styles.ghostText, { color: colors.ink }]}>{link.label}</Text>
        </Pressable>
      ))}

      <Pressable style={[styles.ghost, { borderColor: colors.line }]} onPress={() => void logout()}>
        <Text style={[styles.ghostText, { color: colors.danger }]}>Log out</Text>
      </Pressable>

      <Text style={[styles.stats, { color: colors.muted }]}>
        {profile.followerCount} followers · {profile.followingCount} following
      </Text>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  colors,
  multiline,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  colors: ReturnType<typeof colorsFor>;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences';
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        style={[
          styles.input,
          multiline && styles.textarea,
          { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.line },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800' },
  email: { fontSize: 14, marginBottom: 4 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  primary: { borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryText: { color: '#fff', fontWeight: '800' },
  ghost: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  ghostText: { fontWeight: '800' },
  stats: { fontSize: 13, marginTop: 4 },
});
