import { Link } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { getErrorMessage } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { validateLogin } from '@/components/auth/validation';
import { Button, FieldError, FieldLabel, TextField } from '@/components/ui/Primitives';

export default function LoginScreen() {
  const { login, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'email' | 'password', string>>>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    const errors = validateLogin({ email, password });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      await login({ email, password });
    } catch (error) {
      Alert.alert('Sign in failed', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue to Viora">
      {!configured ? (
        <Text className="mb-4 text-sm font-semibold text-danger">Connect Supabase in Setup first.</Text>
      ) : null}

      <View className="gap-4">
        <View>
          <FieldLabel>Email</FieldLabel>
          <TextField
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
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
          <View className="relative">
            <TextField
              secureTextEntry={!showPassword}
              autoComplete="password"
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

        <Link href="/forgot-password" asChild>
          <Pressable>
            <Text className="text-right text-sm font-semibold text-primary">Forgot password?</Text>
          </Pressable>
        </Link>

        <Button onPress={() => void onSubmit()} disabled={loading || !configured}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>

        <View className="my-1 flex-row items-center gap-3">
          <View className="h-px flex-1 bg-border" />
          <Text className="text-xs font-semibold uppercase text-muted">Or</Text>
          <View className="h-px flex-1 bg-border" />
        </View>

        <Button variant="secondary" disabled>
          Continue with Google
        </Button>
        <Text className="text-center text-xs text-muted">Google sign-in can be enabled later in Supabase Auth.</Text>

        <Link href="/register" asChild>
          <Pressable className="mt-2">
            <Text className="text-center text-sm text-muted">
              Don&apos;t have an account? <Text className="font-semibold text-primary">Sign up</Text>
            </Text>
          </Pressable>
        </Link>
      </View>
    </AuthLayout>
  );
}
