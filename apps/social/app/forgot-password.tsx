import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { getErrorMessage } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { isValidEmail } from '@/components/auth/validation';
import { Button, FieldError, FieldLabel, TextField } from '@/components/ui/Primitives';

export default function ForgotPasswordScreen() {
  const { requestPasswordReset, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    if (!email.trim()) {
      setEmailError('Email is required.');
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError('');
    setLoading(true);
    try {
      await requestPasswordReset(email, {
        redirectTo: Linking.createURL('/reset-password'),
      });
      Alert.alert('Check your email', 'If an account exists, a reset link is on the way.');
    } catch (error) {
      Alert.alert('Reset failed', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Reset password" subtitle="We'll email you a secure link to choose a new password">
      <View className="gap-4">
        <View>
          <FieldLabel>Email</FieldLabel>
          <TextField
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setEmailError('');
            }}
          />
          <FieldError message={emailError} />
        </View>
        <Button onPress={() => void onSubmit()} disabled={loading || !configured}>
          {loading ? 'Sending…' : 'Send reset link'}
        </Button>
        <Link href="/login" asChild>
          <Pressable>
            <Text className="text-center text-sm font-semibold text-primary">Back to sign in</Text>
          </Pressable>
        </Link>
      </View>
    </AuthLayout>
  );
}
