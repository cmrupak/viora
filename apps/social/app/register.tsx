import { Link } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { getErrorMessage } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { validateRegister } from '@/components/auth/validation';
import { Button, FieldError, FieldLabel, TextField } from '@/components/ui/Primitives';

export default function RegisterScreen() {
  const { register, configured } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<'displayName' | 'username' | 'email' | 'password', string>>
  >({});
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    const errors = validateRegister({ displayName, username, email, password });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      const result = await register({ email, password, username, displayName });
      if (result.needsEmailVerification) {
        Alert.alert('Verify email', 'Check your inbox to verify your account, then sign in.');
      }
    } catch (error) {
      Alert.alert('Registration failed', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Create account" subtitle="Join Viora on web and mobile with one account">
      <View className="gap-4">
        <View>
          <FieldLabel>Display name</FieldLabel>
          <TextField
            value={displayName}
            onChangeText={(value) => {
              setDisplayName(value);
              setFieldErrors((prev) => ({ ...prev, displayName: undefined }));
            }}
          />
          <FieldError message={fieldErrors.displayName} />
        </View>
        <View>
          <FieldLabel>Username</FieldLabel>
          <TextField
            autoCapitalize="none"
            value={username}
            onChangeText={(value) => {
              setUsername(value);
              setFieldErrors((prev) => ({ ...prev, username: undefined }));
            }}
          />
          <FieldError message={fieldErrors.username} />
        </View>
        <View>
          <FieldLabel>Email</FieldLabel>
          <TextField
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setFieldErrors((prev) => ({ ...prev, email: undefined }));
            }}
          />
          <FieldError message={fieldErrors.email} />
        </View>
        <View>
          <FieldLabel>Password</FieldLabel>
          <View>
            <TextField
              secureTextEntry={!showPassword}
              className="pr-11"
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
            />
            <Pressable
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              onPress={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-3"
            >
              {showPassword ? <EyeOff size={18} color="#64748B" /> : <Eye size={18} color="#64748B" />}
            </Pressable>
          </View>
          <FieldError message={fieldErrors.password} />
        </View>

        <Button onPress={() => void onSubmit()} disabled={loading || !configured}>
          {loading ? 'Creating…' : 'Create account'}
        </Button>

        <Link href="/login" asChild>
          <Pressable>
            <Text className="text-center text-sm text-muted">
              Already have an account? <Text className="font-semibold text-primary">Sign in</Text>
            </Text>
          </Pressable>
        </Link>
      </View>
    </AuthLayout>
  );
}
