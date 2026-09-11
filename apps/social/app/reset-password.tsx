import { Link, useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { getErrorMessage } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button, FieldError, FieldLabel, TextField } from '@/components/ui/Primitives';

export default function ResetPasswordScreen() {
  const { updatePassword, user, configured } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    if (password.length < 8) {
      setFieldError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setFieldError('Passwords do not match.');
      return;
    }
    setFieldError('');
    setLoading(true);
    try {
      await updatePassword(password);
      Alert.alert('Password updated', 'You can continue using Viora.');
      router.replace('/(tabs)/feed');
    } catch (error) {
      Alert.alert('Update failed', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle={
        user
          ? 'You are signed in via a recovery link. Set your new password below.'
          : 'Open this page from your password reset email link.'
      }
    >
      <View className="gap-4">
        {!user ? (
          <Text className="rounded-xl bg-primarySoft px-3 py-2 text-sm text-primary">
            No recovery session yet. Request a new link from Forgot password.
          </Text>
        ) : null}

        <View>
          <FieldLabel>New password</FieldLabel>
          <View>
            <TextField
              secureTextEntry={!showPassword}
              className="pr-11"
              value={password}
              onChangeText={setPassword}
            />
            <Pressable
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              onPress={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-3"
            >
              {showPassword ? <EyeOff size={18} color="#64748B" /> : <Eye size={18} color="#64748B" />}
            </Pressable>
          </View>
        </View>

        <View>
          <FieldLabel>Confirm password</FieldLabel>
          <TextField secureTextEntry value={confirm} onChangeText={setConfirm} />
          <FieldError message={fieldError} />
        </View>

        <Button onPress={() => void onSubmit()} disabled={loading || !configured || !user}>
          {loading ? 'Saving…' : 'Update password'}
        </Button>

        <Link href="/forgot-password" asChild>
          <Pressable>
            <Text className="text-center text-sm font-semibold text-primary">Request a new reset link</Text>
          </Pressable>
        </Link>
      </View>
    </AuthLayout>
  );
}
